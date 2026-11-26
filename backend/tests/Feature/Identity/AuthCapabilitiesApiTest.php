<?php

declare(strict_types=1);

use App\Core\Tenancy\Services\TenantProvisioner;
use App\Core\Tenancy\TenantContext;
use App\Modules\Identity\Database\Seeders\RbacBaselineSeeder;
use App\Modules\Identity\Models\Role;
use App\Modules\Identity\Models\RoleAssignment;
use App\Modules\Identity\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\RateLimiter;
use Tests\Feature\Tenancy\TenancyTestHelper;

uses(TenancyTestHelper::class);

beforeEach(function () {
    $this->purgeAllTenantDatabases();
    $this->provisioner = app(TenantProvisioner::class);
    $this->tenantContext = app(TenantContext::class);

    $this->tenantA = $this->provisioner->provision('tenant_capa', 'Cap College A', 'capa.test', 'cloud');
    $this->tenantContext->setTenant($this->tenantA);
    app(RbacBaselineSeeder::class)->run();

    $this->superAdminA = User::create([
        'type' => 'staff',
        'name' => 'SA A',
        'email' => 'sa@capa.test',
        'password' => 'Secret@123!',
        'must_change_password' => false,
        'status' => 'active',
    ]);
    RoleAssignment::create([
        'user_id' => $this->superAdminA->id,
        'role_id' => Role::where('key', 'super_admin')->firstOrFail()->id,
        'scope_type' => 'institution',
        'scope_label' => 'i_carmel',
        'valid_from' => Carbon::now()->subDay(),
        'is_active' => true,
    ]);
});

afterEach(function () {
    $this->tenantContext->forget();
    $this->purgeAllTenantDatabases();
});

describe('Auth Capabilities API', function () {
    it('isolates GET /auth/capabilities across tenants', function () {
        $tenantB = $this->provisioner->provision('tenant_capb', 'Cap College B', 'capb.test', 'cloud');

        // Enable on Tenant A only
        $this->tenantContext->setTenant($this->tenantA);
        $tokenA = $this->superAdminA->createToken('sa_a')->plainTextToken;
        $this->withHeaders([
            'Authorization' => "Bearer {$tokenA}",
            'X-Tenant' => 'tenant_capa',
        ])->putJson('http://capa.test/api/v1/settings/auth.staff_self_registration_enabled', [
            'value' => ['enabled' => true],
            'reason' => 'Enabling registration for Tenant A only.',
        ])->assertOk();

        // Tenant A returns true
        $this->withHeaders(['X-Tenant' => 'tenant_capa'])
            ->getJson('http://capa.test/api/v1/auth/capabilities')
            ->assertOk()
            ->assertJsonPath('data.staff_self_registration_enabled', true);

        // Tenant B remains false
        $this->withHeaders(['X-Tenant' => 'tenant_capb'])
            ->getJson('http://capb.test/api/v1/auth/capabilities')
            ->assertOk()
            ->assertJsonPath('data.staff_self_registration_enabled', false);

        expect($tenantB->slug)->toBe('tenant_capb');
    });

    it('returns only staff_self_registration_enabled with private cache, Vary: X-Tenant, and rate limiting on GET /auth/capabilities', function () {
        $res = $this->withHeaders(['X-Tenant' => 'tenant_capa'])
            ->getJson('http://capa.test/api/v1/auth/capabilities')
            ->assertOk();

        expect(array_keys($res->json('data')))->toBe(['staff_self_registration_enabled'])
            ->and($res->json('data.staff_self_registration_enabled'))->toBeFalse();

        $cacheControl = (string) $res->headers->get('Cache-Control');
        expect($cacheControl)->toContain('private')
            ->and($cacheControl)->toContain('max-age=60')
            ->and((string) $res->headers->get('Vary'))->toContain('X-Tenant');

        // Exhaust rate limit (60/min) -> 429 with Retry-After
        $ipKey = "auth_cap:ip:{$this->tenantA->id}:".hash('sha256', '127.0.0.1');
        for ($i = 0; $i < 60; $i++) {
            RateLimiter::hit($ipKey, 60);
        }

        $this->withHeaders(['X-Tenant' => 'tenant_capa'])
            ->getJson('http://capa.test/api/v1/auth/capabilities')
            ->assertStatus(429)
            ->assertHeader('Retry-After');
    });

    it('reflects auth.staff_self_registration_enabled changes in GET /auth/capabilities and POST /auth/register-staff', function () {
        // Initially disabled -> capabilities false and register-staff 403
        $this->withHeaders(['X-Tenant' => 'tenant_capa'])
            ->getJson('http://capa.test/api/v1/auth/capabilities')
            ->assertOk()
            ->assertJsonPath('data.staff_self_registration_enabled', false);

        $this->withHeaders(['X-Tenant' => 'tenant_capa'])
            ->postJson('http://capa.test/api/v1/auth/register-staff', [
                'name' => 'Applicant',
                'email' => 'app@capa.test',
                'password' => 'StrongPass#2026!',
            ])->assertForbidden();

        // Enable via settings API
        $this->tenantContext->setTenant($this->tenantA);
        $token = $this->superAdminA->createToken('sa_a2')->plainTextToken;
        $this->withHeaders([
            'Authorization' => "Bearer {$token}",
            'X-Tenant' => 'tenant_capa',
        ])->putJson('http://capa.test/api/v1/settings/auth.staff_self_registration_enabled', [
            'value' => ['enabled' => true],
            'reason' => 'Opening registration window.',
        ])->assertOk();

        // Now capabilities true and register-staff 202
        $this->withHeaders(['X-Tenant' => 'tenant_capa'])
            ->getJson('http://capa.test/api/v1/auth/capabilities')
            ->assertOk()
            ->assertJsonPath('data.staff_self_registration_enabled', true);

        $this->withHeaders(['X-Tenant' => 'tenant_capa'])
            ->postJson('http://capa.test/api/v1/auth/register-staff', [
                'name' => 'Applicant',
                'email' => 'app@capa.test',
                'password' => 'StrongPass#2026!',
            ])->assertAccepted();
    });
});


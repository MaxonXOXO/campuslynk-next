<?php

declare(strict_types=1);

use App\Core\Tenancy\Services\TenantProvisioner;
use App\Core\Tenancy\TenantContext;
use App\Modules\Identity\Database\Seeders\RbacBaselineSeeder;
use App\Modules\Identity\Models\Role;
use App\Modules\Identity\Models\RoleAssignment;
use App\Modules\Identity\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Tests\Feature\Tenancy\TenancyTestHelper;

uses(TenancyTestHelper::class);

beforeEach(function () {
    $this->purgeAllTenantDatabases();
    $this->provisioner = app(TenantProvisioner::class);
    $this->tenantContext = app(TenantContext::class);

    $this->tenant = $this->provisioner->provision('tenant_setapi', 'Settings College', 'setapi.test', 'cloud');
    $this->tenantContext->setTenant($this->tenant);
    app(RbacBaselineSeeder::class)->run();

    $this->superAdmin = User::create([
        'type' => 'staff',
        'name' => 'IT Head',
        'email' => 'sa@setapi.test',
        'password' => 'Secret@123!',
        'must_change_password' => false,
        'status' => 'active',
    ]);
    RoleAssignment::create([
        'user_id' => $this->superAdmin->id,
        'role_id' => Role::where('key', 'super_admin')->firstOrFail()->id,
        'scope_type' => 'institution',
        'scope_label' => 'i_carmel',
        'valid_from' => Carbon::now()->subDay(),
        'is_active' => true,
    ]);

    $this->principal = User::create([
        'type' => 'staff',
        'name' => 'Principal',
        'email' => 'principal@setapi.test',
        'password' => 'Secret@123!',
        'must_change_password' => false,
        'status' => 'active',
    ]);
    RoleAssignment::create([
        'user_id' => $this->principal->id,
        'role_id' => Role::where('key', 'principal')->firstOrFail()->id,
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

describe('Tenant Settings API', function () {
    it('rejects signup_policy on PUT /settings/signup_policy so setup lock cannot be bypassed', function () {
        $token = $this->superAdmin->createToken('sa_tok')->plainTextToken;

        $this->withHeaders([
            'Authorization' => "Bearer {$token}",
            'X-Tenant' => 'tenant_setapi',
        ])->putJson('http://setapi.test/api/v1/settings/signup_policy', [
            'value' => [
                'student_self_registration_enabled' => true,
                'parent_self_registration_enabled' => false,
                'approval_mode' => 'manual',
            ],
        ])->assertStatus(422);
    });

    it('requires a 5-500 char reason when enabling auth.staff_self_registration_enabled', function () {
        $token = $this->superAdmin->createToken('sa_tok')->plainTextToken;

        // Missing reason -> 422
        $this->withHeaders([
            'Authorization' => "Bearer {$token}",
            'X-Tenant' => 'tenant_setapi',
        ])->putJson('http://setapi.test/api/v1/settings/auth.staff_self_registration_enabled', [
            'value' => ['enabled' => true],
        ])->assertStatus(422);

        // Short reason (< 5 chars) -> 422
        $this->withHeaders([
            'Authorization' => "Bearer {$token}",
            'X-Tenant' => 'tenant_setapi',
        ])->putJson('http://setapi.test/api/v1/settings/auth.staff_self_registration_enabled', [
            'value' => ['enabled' => true],
            'reason' => 'open',
        ])->assertStatus(422);

        // Valid reason -> 200
        $this->withHeaders([
            'Authorization' => "Bearer {$token}",
            'X-Tenant' => 'tenant_setapi',
        ])->putJson('http://setapi.test/api/v1/settings/auth.staff_self_registration_enabled', [
            'value' => ['enabled' => true],
            'reason' => 'Opening staff onboarding window for 2026-27 intake.',
        ])->assertOk()
            ->assertJsonPath('data.key', 'auth.staff_self_registration_enabled')
            ->assertJsonPath('data.value.enabled', true);
    });

    it('allows disabling auth.staff_self_registration_enabled without a reason', function () {
        $token = $this->superAdmin->createToken('sa_tok')->plainTextToken;

        $this->withHeaders([
            'Authorization' => "Bearer {$token}",
            'X-Tenant' => 'tenant_setapi',
        ])->putJson('http://setapi.test/api/v1/settings/auth.staff_self_registration_enabled', [
            'value' => ['enabled' => false],
        ])->assertOk()
            ->assertJsonPath('data.value.enabled', false);
    });

    it('logs setting.updated with old_value and new_value in activity_log', function () {
        $token = $this->superAdmin->createToken('sa_tok')->plainTextToken;

        $this->withHeaders([
            'Authorization' => "Bearer {$token}",
            'X-Tenant' => 'tenant_setapi',
        ])->putJson('http://setapi.test/api/v1/settings/auth.staff_self_registration_daily_cap', [
            'value' => ['cap' => 50],
            'reason' => 'Tightening daily pending cap for intake.',
        ])->assertOk();

        $this->tenantContext->setTenant($this->tenant);
        $entry = DB::connection('tenant')->table('activity_log')
            ->where('event', 'setting.updated')
            ->latest('created_at')
            ->first();

        expect($entry)->not->toBeNull();
        /** @var array<string, mixed> $props */
        $props = json_decode((string) $entry->properties, true);
        expect($props['key'])->toBe('auth.staff_self_registration_daily_cap')
            ->and($props['old_value'])->toBe(['cap' => 100])
            ->and($props['new_value'])->toBe(['cap' => 50])
            ->and($props['reason'])->toBe('Tightening daily pending cap for intake.');
    });

    it('returns whitelisted auth settings and token counts on GET /settings for super_admin', function () {
        $token = $this->superAdmin->createToken('sa_tok')->plainTextToken;

        $res = $this->withHeaders([
            'Authorization' => "Bearer {$token}",
            'X-Tenant' => 'tenant_setapi',
        ])->getJson('http://setapi.test/api/v1/settings')->assertOk();

        expect($res->json('data.settings'))->toHaveKeys([
            'auth.staff_self_registration_enabled',
            'auth.staff_self_registration_daily_cap',
            'auth.rejected_resubmit_cooldown_days',
            'auth.token_lifetime_web_hours',
            'auth.token_lifetime_mobile_days',
        ])->and($res->json('data.token_summary.active_tokens_count'))->toBeGreaterThanOrEqual(1)
            ->and($res->json('data.token_summary.active_users_with_tokens_count'))->toBeGreaterThanOrEqual(1);
    });

    it('rejects non-super-admin callers on GET and PUT /settings with 403', function () {
        $pToken = $this->principal->createToken('p_tok')->plainTextToken;

        $this->withHeaders([
            'Authorization' => "Bearer {$pToken}",
            'X-Tenant' => 'tenant_setapi',
        ])->getJson('http://setapi.test/api/v1/settings')->assertForbidden();

        $this->withHeaders([
            'Authorization' => "Bearer {$pToken}",
            'X-Tenant' => 'tenant_setapi',
        ])->putJson('http://setapi.test/api/v1/settings/auth.staff_self_registration_daily_cap', [
            'value' => ['cap' => 50],
        ])->assertForbidden();
    });
});

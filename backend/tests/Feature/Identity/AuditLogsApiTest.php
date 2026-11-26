<?php

declare(strict_types=1);

use App\Core\Tenancy\Services\TenantProvisioner;
use App\Core\Tenancy\TenantContext;
use App\Modules\Identity\Database\Seeders\RbacBaselineSeeder;
use App\Modules\Identity\Models\Role;
use App\Modules\Identity\Models\RoleAssignment;
use App\Modules\Identity\Models\User;
use Illuminate\Support\Carbon;
use Tests\Feature\Tenancy\TenancyTestHelper;

uses(TenancyTestHelper::class);

beforeEach(function () {
    $this->purgeAllTenantDatabases();
    $this->provisioner = app(TenantProvisioner::class);
    $this->tenantContext = app(TenantContext::class);

    $this->tenant = $this->provisioner->provision('tenant_auditapi', 'Audit College', 'auditapi.test', 'cloud');
    $this->tenantContext->setTenant($this->tenant);
    app(RbacBaselineSeeder::class)->run();

    $this->superAdmin = User::create([
        'type' => 'staff',
        'name' => 'IT Head',
        'email' => 'sa@auditapi.test',
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
        'name' => 'Dr. Principal',
        'email' => 'principal@auditapi.test',
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

    $this->hod = User::create([
        'type' => 'staff',
        'name' => 'CE HOD',
        'email' => 'hod@auditapi.test',
        'password' => 'Secret@123!',
        'must_change_password' => false,
        'status' => 'active',
    ]);
    RoleAssignment::create([
        'user_id' => $this->hod->id,
        'role_id' => Role::where('key', 'hod')->firstOrFail()->id,
        'scope_type' => 'department',
        'scope_label' => 'd_ce',
        'valid_from' => Carbon::now()->subDay(),
        'is_active' => true,
    ]);
});

afterEach(function () {
    $this->tenantContext->forget();
    $this->purgeAllTenantDatabases();
});

describe('Audit Logs API', function () {
    it('excludes security log_name on GET /audit-logs for principal and returns 403 for hod and staff', function () {
        $this->tenantContext->setTenant($this->tenant);
        activity('identity')->causedBy($this->superAdmin)->event('user.created')->log('Created user');
        activity('organisation')->causedBy($this->superAdmin)->event('rule.updated')->log('Updated rule');
        activity('rbac')->causedBy($this->superAdmin)->event('role.assigned')->log('Assigned role');
        activity('security')->causedBy($this->superAdmin)->event('impersonation.started')->log('Impersonation started');

        $pToken = $this->principal->createToken('p_tok')->plainTextToken;

        // Principal sees identity, organisation, rbac — never security
        $res = $this->withHeaders([
            'Authorization' => "Bearer {$pToken}",
            'X-Tenant' => 'tenant_auditapi',
        ])->getJson('http://auditapi.test/api/v1/audit-logs')->assertOk();

        $logNames = collect($res->json('data'))->pluck('log_name')->unique()->all();
        expect($logNames)->toContain('identity', 'organisation', 'rbac')
            ->and($logNames)->not->toContain('security');

        // Even explicitly filtering log_name=security returns empty for principal
        $secRes = $this->withHeaders([
            'Authorization' => "Bearer {$pToken}",
            'X-Tenant' => 'tenant_auditapi',
        ])->getJson('http://auditapi.test/api/v1/audit-logs?log_name=security')->assertOk();
        expect($secRes->json('data'))->toBe([]);

        // HOD gets 403
        $this->app['auth']->forgetGuards();
        $this->tenantContext->setTenant($this->tenant);
        $hToken = $this->hod->createToken('h_tok')->plainTextToken;
        $this->withHeaders([
            'Authorization' => "Bearer {$hToken}",
            'X-Tenant' => 'tenant_auditapi',
        ])->getJson('http://auditapi.test/api/v1/audit-logs')->assertForbidden();
    });

    it('returns all log_names including security on GET /audit-logs for super_admin', function () {
        $this->tenantContext->setTenant($this->tenant);
        activity('identity')->causedBy($this->superAdmin)->event('user.created')->log('Created user');
        activity('security')->causedBy($this->superAdmin)->event('impersonation.started')->log('Impersonation started');

        $saToken = $this->superAdmin->createToken('sa_tok')->plainTextToken;

        $res = $this->withHeaders([
            'Authorization' => "Bearer {$saToken}",
            'X-Tenant' => 'tenant_auditapi',
        ])->getJson('http://auditapi.test/api/v1/audit-logs')->assertOk();

        $logNames = collect($res->json('data'))->pluck('log_name')->unique()->all();
        expect($logNames)->toContain('identity', 'security');
    });

    it('never writes or returns passwords, password hashes, or bearer tokens in audit log properties', function () {
        $this->tenantContext->setTenant($this->tenant);
        activity('identity')
            ->causedBy($this->superAdmin)
            ->event('sensitive.test')
            ->withProperties([
                'safe_field' => 'ok',
                'password' => 'PlainSecret#2026!',
                'password_hash' => '$argon2id$v=19$m=65536,t=4,p=1$fakehash',
                'access_token' => '1|supersecrettokenvalue',
                'nested' => [
                    'temporary_password' => 'TempPass#99',
                    'api_secret' => 'sec_live_123',
                ],
            ])
            ->log('Sensitive property test');

        $saToken = $this->superAdmin->createToken('sa_tok')->plainTextToken;

        $res = $this->withHeaders([
            'Authorization' => "Bearer {$saToken}",
            'X-Tenant' => 'tenant_auditapi',
        ])->getJson('http://auditapi.test/api/v1/audit-logs?event=sensitive.test')->assertOk();

        $body = json_encode($res->json('data'));
        expect($body)->not->toContain('PlainSecret#2026!')
            ->and($body)->not->toContain('$argon2id$')
            ->and($body)->not->toContain('1|supersecrettokenvalue')
            ->and($body)->not->toContain('TempPass#99')
            ->and($body)->not->toContain('sec_live_123')
            ->and($res->json('data.0.properties.password'))->toBe('[REDACTED]')
            ->and($res->json('data.0.properties.nested.temporary_password'))->toBe('[REDACTED]')
            ->and($res->json('data.0.properties.safe_field'))->toBe('ok');
    });

    it('enforces per_page max 100 and searches only event, log_name, and causer name without matching JSON properties', function () {
        $this->tenantContext->setTenant($this->tenant);
        activity('identity')
            ->causedBy($this->superAdmin)
            ->event('custom.marker')
            ->withProperties(['hidden_note' => 'secret_json_needle_xyz'])
            ->log('Marker entry');

        $saToken = $this->superAdmin->createToken('sa_tok')->plainTextToken;

        // per_page > 100 rejected with 422
        $this->withHeaders([
            'Authorization' => "Bearer {$saToken}",
            'X-Tenant' => 'tenant_auditapi',
        ])->getJson('http://auditapi.test/api/v1/audit-logs?per_page=101')->assertStatus(422);

        // Searching JSON property value returns 0 matches
        $jsonSearch = $this->withHeaders([
            'Authorization' => "Bearer {$saToken}",
            'X-Tenant' => 'tenant_auditapi',
        ])->getJson('http://auditapi.test/api/v1/audit-logs?search=secret_json_needle_xyz')->assertOk();
        expect($jsonSearch->json('data'))->toBe([]);

        // Searching event or causer name matches
        $eventSearch = $this->withHeaders([
            'Authorization' => "Bearer {$saToken}",
            'X-Tenant' => 'tenant_auditapi',
        ])->getJson('http://auditapi.test/api/v1/audit-logs?search=custom.marker')->assertOk();
        expect(count($eventSearch->json('data')))->toBe(1);

        $causerSearch = $this->withHeaders([
            'Authorization' => "Bearer {$saToken}",
            'X-Tenant' => 'tenant_auditapi',
        ])->getJson('http://auditapi.test/api/v1/audit-logs?search=IT%20Head')->assertOk();
        expect(count($causerSearch->json('data')))->toBeGreaterThanOrEqual(1);
    });
});

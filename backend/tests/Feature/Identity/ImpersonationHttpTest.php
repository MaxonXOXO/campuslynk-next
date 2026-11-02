<?php

declare(strict_types=1);

namespace Tests\Feature\Identity;

use App\Core\Tenancy\Services\TenantProvisioner;
use App\Core\Tenancy\TenantContext;
use App\Modules\Identity\Models\Activity;
use App\Modules\Identity\Models\Role;
use App\Modules\Identity\Models\RoleAssignment;
use App\Modules\Identity\Models\User;
use App\Modules\Organisation\Database\Seeders\KeralaPolytechnicProfileSeeder;
use Illuminate\Support\Facades\Hash;
use Tests\Feature\Tenancy\TenancyTestHelper;

uses(TenancyTestHelper::class);

beforeEach(function () {
    $this->purgeAllTenantDatabases();
    $this->provisioner = app(TenantProvisioner::class);
    $this->tenantContext = app(TenantContext::class);
});

afterEach(function () {
    $this->purgeAllTenantDatabases();
});

it('allows super admin to start and stop impersonation with security audit logging', function () {
    config(['app_profile.deploy_profile' => 'cloud']);

    $tenant = $this->provisioner->provision('tenant_imp_ok', 'Imp Poly', 'imp.test', 'cloud');
    $this->tenantContext->setTenant($tenant);

    try {
        app(KeralaPolytechnicProfileSeeder::class)->run();

        $superAdmin = User::create([
            'type' => 'staff',
            'name' => 'IT Head',
            'email' => 'ithead@imp.test',
            'password' => Hash::make('Password123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);
        $superAdminRole = Role::where('key', 'super_admin')->firstOrFail();
        RoleAssignment::create([
            'user_id' => $superAdmin->id,
            'role_id' => $superAdminRole->id,
            'scope_type' => 'institution',
            'scope_label' => 'i_carmel',
            'is_singleton' => false,
            'is_active' => true,
        ]);

        $lecturer = User::create([
            'type' => 'staff',
            'name' => 'Lecturer Bob',
            'email' => 'bob@imp.test',
            'password' => Hash::make('Password123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);
        $lecturerRole = Role::where('key', 'lecturer')->firstOrFail();
        RoleAssignment::create([
            'user_id' => $lecturer->id,
            'role_id' => $lecturerRole->id,
            'scope_type' => 'department',
            'scope_label' => 'd_ce',
            'is_singleton' => false,
            'is_active' => true,
        ]);

        $adminToken = $superAdmin->createToken('test_token')->plainTextToken;

        $response = $this->withHeaders([
            'Authorization' => "Bearer {$adminToken}",
        ])->postJson('http://imp.test/api/v1/impersonation', [
            'user_id' => $lecturer->id,
            'ticket' => 'INC-1092',
            'reason' => 'Troubleshooting timetable view',
        ]);

        $response->assertStatus(201);
        $token = (string) $response->json('data.token');
        expect($token)->not->toBeEmpty()
            ->and($response->json('data.read_only'))->toBeFalse();

        // Audit log verified
        $this->tenantContext->setTenant($tenant);
        $log = Activity::where('log_name', 'security')->first();
        expect($log)->not->toBeNull()
            ->and($log->causer_id)->toBe($superAdmin->id)
            ->and($log->subject_id)->toBe($lecturer->id);

        // Conclude impersonation
        $this->app['auth']->forgetGuards();
        $stopResponse = $this->withHeaders([
            'Authorization' => "Bearer {$token}",
        ])->postJson('http://imp.test/api/v1/impersonation/stop');

        $stopResponse->assertStatus(200);
    } finally {
        $this->tenantContext->forget();
    }
});

it('enforces read-only restrictions when impersonating academic approval roles (ADR-0004)', function () {
    config(['app_profile.deploy_profile' => 'cloud']);

    $tenant = $this->provisioner->provision('tenant_imp_ro', 'Imp RO Poly', 'impro.test', 'cloud');
    $this->tenantContext->setTenant($tenant);

    try {
        app(KeralaPolytechnicProfileSeeder::class)->run();

        $superAdmin = User::create([
            'type' => 'staff',
            'name' => 'IT Head',
            'email' => 'ithead@impro.test',
            'password' => Hash::make('Password123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);
        $superAdminRole = Role::where('key', 'super_admin')->firstOrFail();
        RoleAssignment::create([
            'user_id' => $superAdmin->id,
            'role_id' => $superAdminRole->id,
            'scope_type' => 'institution',
            'scope_label' => 'i_carmel',
            'is_singleton' => false,
            'is_active' => true,
        ]);

        // Target user is CE HOD (Academic Authority)
        $hodUser = User::create([
            'type' => 'staff',
            'name' => 'HOD Civil',
            'email' => 'hod@impro.test',
            'password' => Hash::make('Password123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);
        $hodRole = Role::where('key', 'hod')->firstOrFail();
        RoleAssignment::create([
            'user_id' => $hodUser->id,
            'role_id' => $hodRole->id,
            'scope_type' => 'department',
            'scope_label' => 'd_ce',
            'is_singleton' => true,
            'is_active' => true,
        ]);

        $adminToken = $superAdmin->createToken('admin_token')->plainTextToken;

        $response = $this->withHeaders([
            'Authorization' => "Bearer {$adminToken}",
        ])->postJson('http://impro.test/api/v1/impersonation', [
            'user_id' => $hodUser->id,
            'ticket' => 'SEC-2041',
            'reason' => 'Verifying attendance consolidation view',
        ]);

        $response->assertStatus(201);
        expect($response->json('data.read_only'))->toBeTrue();

        $impersonationToken = (string) $response->json('data.token');

        // Flush cached auth guard to simulate fresh HTTP request with new Bearer token
        $this->app['auth']->forgetGuards();

        // GET requests succeed during read-only impersonation
        $getResponse = $this->withHeaders([
            'Authorization' => "Bearer {$impersonationToken}",
        ])->getJson('http://impro.test/api/v1/batches');
        $getResponse->assertStatus(200);

        // State-mutating POST requests are strictly blocked with 403 Forbidden
        $postResponse = $this->withHeaders([
            'Authorization' => "Bearer {$impersonationToken}",
        ])->postJson('http://impro.test/api/v1/batches', [
            'name' => 'Unauthorized Batch Attempt',
        ]);
        $postResponse->assertStatus(403);
        expect($postResponse->json('title'))->toBe('Read-Only Impersonation Session');
    } finally {
        $this->tenantContext->forget();
    }
});

it('rejects unauthorised users from initiating impersonation', function () {
    config(['app_profile.deploy_profile' => 'cloud']);

    $tenant = $this->provisioner->provision('tenant_imp_unauth', 'Unauth Poly', 'unauth.test', 'cloud');
    $this->tenantContext->setTenant($tenant);

    try {
        app(KeralaPolytechnicProfileSeeder::class)->run();

        $lecturer = User::create([
            'type' => 'staff',
            'name' => 'Lecturer Sam',
            'email' => 'sam@unauth.test',
            'password' => Hash::make('Password123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);
        $lecturerRole = Role::where('key', 'lecturer')->firstOrFail();
        RoleAssignment::create([
            'user_id' => $lecturer->id,
            'role_id' => $lecturerRole->id,
            'scope_type' => 'department',
            'scope_label' => 'd_ce',
            'is_singleton' => false,
            'is_active' => true,
        ]);

        $token = $lecturer->createToken('lecturer_token')->plainTextToken;

        // Lecturer does not hold identity.user.impersonate permission
        $response = $this->withHeaders([
            'Authorization' => "Bearer {$token}",
        ])->postJson('http://unauth.test/api/v1/impersonation', [
            'user_id' => $lecturer->id,
            'ticket' => 'ROGUE-1',
            'reason' => 'Rogue impersonation attempt',
        ]);

        $response->assertStatus(403);
    } finally {
        $this->tenantContext->forget();
    }
});

it('enforces cross-tenant isolation and prevents impersonating users from another tenant', function () {
    config(['app_profile.deploy_profile' => 'cloud']);

    $tenantA = $this->provisioner->provision('tenant_imp_a', 'Tenant A Poly', 'a.test', 'cloud');
    $tenantB = $this->provisioner->provision('tenant_imp_b', 'Tenant B Poly', 'b.test', 'cloud');

    $this->tenantContext->setTenant($tenantB);
    try {
        app(KeralaPolytechnicProfileSeeder::class)->run();
        $userB = User::create([
            'type' => 'staff',
            'name' => 'Target User B',
            'email' => 'target@b.test',
            'password' => Hash::make('Password123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);
        $targetUserId = $userB->id;
    } finally {
        $this->tenantContext->forget();
    }

    $this->tenantContext->setTenant($tenantA);
    try {
        app(KeralaPolytechnicProfileSeeder::class)->run();
        $adminA = User::create([
            'type' => 'staff',
            'name' => 'Admin A',
            'email' => 'admin@a.test',
            'password' => Hash::make('Password123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);
        $superAdminRole = Role::where('key', 'super_admin')->firstOrFail();
        RoleAssignment::create([
            'user_id' => $adminA->id,
            'role_id' => $superAdminRole->id,
            'scope_type' => 'institution',
            'scope_label' => 'i_carmel',
            'is_singleton' => false,
            'is_active' => true,
        ]);

        $tokenA = $adminA->createToken('admin_a')->plainTextToken;

        // Admin A attempts to impersonate User B (which exists only in Tenant B DB)
        $response = $this->withHeaders([
            'Authorization' => "Bearer {$tokenA}",
        ])->postJson('http://a.test/api/v1/impersonation', [
            'user_id' => $targetUserId,
            'ticket' => 'CROSS-1',
            'reason' => 'Cross-tenant breach attempt',
        ]);

        $response->assertStatus(404);
    } finally {
        $this->tenantContext->forget();
    }
});

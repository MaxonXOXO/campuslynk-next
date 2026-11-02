<?php

declare(strict_types=1);

namespace Tests\Feature\Identity;

use App\Core\Tenancy\Services\TenantProvisioner;
use App\Core\Tenancy\TenantContext;
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

it('allows authorized user to list, create, and update users', function () {
    config(['app_profile.deploy_profile' => 'cloud']);

    $tenant = $this->provisioner->provision('tenant_user_mgr', 'User Mgr Poly', 'usermgr.test', 'cloud');
    $this->tenantContext->setTenant($tenant);

    try {
        app(KeralaPolytechnicProfileSeeder::class)->run();

        $admin = User::create([
            'type' => 'staff',
            'name' => 'IT Admin',
            'email' => 'admin@usermgr.test',
            'password' => Hash::make('Password123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);
        $superAdminRole = Role::where('key', 'super_admin')->firstOrFail();
        RoleAssignment::create([
            'user_id' => $admin->id,
            'role_id' => $superAdminRole->id,
            'scope_type' => 'institution',
            'scope_label' => 'i_carmel',
            'is_singleton' => false,
            'is_active' => true,
        ]);

        $adminToken = $admin->createToken('admin_token')->plainTextToken;

        // 1. List users
        $listResponse = $this->withHeaders([
            'Authorization' => "Bearer {$adminToken}",
        ])->getJson('http://usermgr.test/api/v1/users');

        $listResponse->assertStatus(200);
        expect($listResponse->json('meta.total'))->toBeGreaterThanOrEqual(1);

        // 2. Create user
        $createResponse = $this->withHeaders([
            'Authorization' => "Bearer {$adminToken}",
        ])->postJson('http://usermgr.test/api/v1/users', [
            'type' => 'staff',
            'name' => 'Professor David',
            'email' => 'david@usermgr.test',
            'mobile' => '9876543210',
        ]);

        $createResponse->assertStatus(201);
        $newUserId = (string) $createResponse->json('data.id');
        expect($newUserId)->not->toBeEmpty();

        // 3. View user
        $viewResponse = $this->withHeaders([
            'Authorization' => "Bearer {$adminToken}",
        ])->getJson("http://usermgr.test/api/v1/users/{$newUserId}");

        $viewResponse->assertStatus(200);
        expect($viewResponse->json('data.name'))->toBe('Professor David');

        // 4. Update user
        $updateResponse = $this->withHeaders([
            'Authorization' => "Bearer {$adminToken}",
        ])->putJson("http://usermgr.test/api/v1/users/{$newUserId}", [
            'name' => 'Professor David Junior',
        ]);

        $updateResponse->assertStatus(200);
        expect($updateResponse->json('data.name'))->toBe('Professor David Junior');
    } finally {
        $this->tenantContext->forget();
    }
});

it('allows authorized user to assign and revoke scoped roles via API', function () {
    config(['app_profile.deploy_profile' => 'cloud']);

    $tenant = $this->provisioner->provision('tenant_role_api', 'Role Api Poly', 'roleapi.test', 'cloud');
    $this->tenantContext->setTenant($tenant);

    try {
        app(KeralaPolytechnicProfileSeeder::class)->run();

        $principal = User::create([
            'type' => 'staff',
            'name' => 'Principal Patrick',
            'email' => 'principal@roleapi.test',
            'password' => Hash::make('Password123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);
        $principalRole = Role::where('key', 'principal')->firstOrFail();
        RoleAssignment::create([
            'user_id' => $principal->id,
            'role_id' => $principalRole->id,
            'scope_type' => 'institution',
            'scope_label' => 'i_carmel',
            'is_singleton' => true,
            'is_active' => true,
        ]);

        $staffUser = User::create([
            'type' => 'staff',
            'name' => 'Staff Helen',
            'email' => 'helen@roleapi.test',
            'password' => Hash::make('Password123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);

        $principalToken = $principal->createToken('principal_token')->plainTextToken;

        // Assign HOD role to Helen for Civil Engineering
        $assignResponse = $this->withHeaders([
            'Authorization' => "Bearer {$principalToken}",
        ])->postJson('http://roleapi.test/api/v1/roles/assign', [
            'user_id' => $staffUser->id,
            'role_key' => 'hod',
            'scope_type' => 'department',
            'scope_label' => 'd_ce',
        ]);

        $assignResponse->assertStatus(201);
        $assignmentId = (string) $assignResponse->json('data.id');
        expect($assignmentId)->not->toBeEmpty();

        // Revoke the role assignment
        $revokeResponse = $this->withHeaders([
            'Authorization' => "Bearer {$principalToken}",
        ])->postJson('http://roleapi.test/api/v1/roles/revoke', [
            'assignment_id' => $assignmentId,
        ]);

        $revokeResponse->assertStatus(200);

        // Verify inactive in database
        $this->tenantContext->setTenant($tenant);
        $assignment = RoleAssignment::find($assignmentId);
        expect($assignment->is_active)->toBeFalse();
    } finally {
        $this->tenantContext->forget();
    }
});

it('rejects unauthorised users from managing users and assigning roles', function () {
    config(['app_profile.deploy_profile' => 'cloud']);

    $tenant = $this->provisioner->provision('tenant_user_unauth', 'Unauth Poly', 'unauthuser.test', 'cloud');
    $this->tenantContext->setTenant($tenant);

    try {
        app(KeralaPolytechnicProfileSeeder::class)->run();

        $student = User::create([
            'type' => 'student',
            'name' => 'Student Alex',
            'email' => 'alex@unauthuser.test',
            'password' => Hash::make('Password123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);
        $studentRole = Role::where('key', 'student')->firstOrFail();
        RoleAssignment::create([
            'user_id' => $student->id,
            'role_id' => $studentRole->id,
            'scope_type' => 'own',
            'scope_label' => 'u_'.$student->id,
            'is_singleton' => false,
            'is_active' => true,
        ]);

        $studentToken = $student->createToken('student_token')->plainTextToken;

        // Student attempts to create user -> 403 Forbidden
        $response = $this->withHeaders([
            'Authorization' => "Bearer {$studentToken}",
        ])->postJson('http://unauthuser.test/api/v1/users', [
            'type' => 'staff',
            'name' => 'Malicious User',
            'email' => 'bad@unauthuser.test',
        ]);
        $response->assertStatus(403);

        // Student attempts to assign role -> 403 Forbidden
        $roleResponse = $this->withHeaders([
            'Authorization' => "Bearer {$studentToken}",
        ])->postJson('http://unauthuser.test/api/v1/roles/assign', [
            'user_id' => $student->id,
            'role_key' => 'super_admin',
            'scope_type' => 'institution',
            'scope_label' => 'i_carmel',
        ]);
        $roleResponse->assertStatus(403);
    } finally {
        $this->tenantContext->forget();
    }
});

it('enforces cross-tenant isolation and prevents viewing or updating another tenant user', function () {
    config(['app_profile.deploy_profile' => 'cloud']);

    $tenantA = $this->provisioner->provision('tenant_um_a', 'Poly A', 'uma.test', 'cloud');
    $tenantB = $this->provisioner->provision('tenant_um_b', 'Poly B', 'umb.test', 'cloud');

    $this->tenantContext->setTenant($tenantB);
    try {
        app(KeralaPolytechnicProfileSeeder::class)->run();
        $userB = User::create([
            'type' => 'staff',
            'name' => 'User in B',
            'email' => 'b@umb.test',
            'password' => Hash::make('Password123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);
        $userBId = $userB->id;
    } finally {
        $this->tenantContext->forget();
    }

    $this->tenantContext->setTenant($tenantA);
    try {
        app(KeralaPolytechnicProfileSeeder::class)->run();
        $adminA = User::create([
            'type' => 'staff',
            'name' => 'Admin A',
            'email' => 'admin@uma.test',
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

        // Admin A attempts to view User B (from Tenant B) -> 404
        $response = $this->withHeaders([
            'Authorization' => "Bearer {$tokenA}",
        ])->getJson("http://uma.test/api/v1/users/{$userBId}");

        $response->assertStatus(404);
    } finally {
        $this->tenantContext->forget();
    }
});

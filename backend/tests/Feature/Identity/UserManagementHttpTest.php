<?php

declare(strict_types=1);

namespace Tests\Feature\Identity;

use App\Core\Tenancy\Services\TenantProvisioner;
use App\Core\Tenancy\TenantContext;
use App\Modules\Identity\Models\Role;
use App\Modules\Identity\Models\RoleAssignment;
use App\Modules\Identity\Models\User;
use App\Modules\Organisation\Database\Seeders\KeralaPolytechnicProfileSeeder;
use App\Modules\Organisation\Models\AcademicYear;
use App\Modules\Organisation\Models\Batch;
use App\Modules\Organisation\Models\Department;
use App\Modules\Organisation\Models\Program;
use App\Modules\Organisation\Models\Regulation;
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

it('administratively unlocks a locked-out user account and verifies immediate login', function () {
    config(['app_profile.deploy_profile' => 'cloud']);

    $tenant = $this->provisioner->provision('tenant_unlock', 'Unlock Poly', 'unlock.test', 'cloud');
    $this->tenantContext->setTenant($tenant);

    try {
        app(KeralaPolytechnicProfileSeeder::class)->run();

        $admin = User::create([
            'type' => 'staff',
            'name' => 'IT Admin',
            'email' => 'admin@unlock.test',
            'password' => Hash::make('AdminPass123!'),
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

        $student = User::create([
            'type' => 'student',
            'name' => 'Locked Student',
            'email' => 'student@unlock.test',
            'password' => Hash::make('CorrectPassword123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);

        $adminToken = $admin->createToken('admin_token')->plainTextToken;

        // Trigger account lockout with 5 failed login attempts
        for ($i = 0; $i < 5; $i++) {
            $this->postJson('http://unlock.test/api/v1/auth/login', [
                'identifier' => 'student@unlock.test',
                'password' => 'WrongPassword!',
                'device_name' => 'TestingDevice',
                'client' => 'web',
            ])->assertStatus(401);
        }

        // 6th attempt is locked out (429 Too Many Requests)
        $lockResponse = $this->postJson('http://unlock.test/api/v1/auth/login', [
            'identifier' => 'student@unlock.test',
            'password' => 'CorrectPassword123!',
            'device_name' => 'TestingDevice',
            'client' => 'web',
        ]);
        expect(in_array($lockResponse->status(), [423, 429], true))->toBeTrue();

        $this->app['auth']->forgetGuards();

        // Admin unlocks student account
        $unlockResponse = $this->withHeaders([
            'Authorization' => "Bearer {$adminToken}",
        ])->postJson("http://unlock.test/api/v1/users/{$student->id}/unlock");

        $unlockResponse->assertStatus(200);

        $this->app['auth']->forgetGuards();

        // Immediate login with correct password now succeeds
        $loginResponse = $this->postJson('http://unlock.test/api/v1/auth/login', [
            'identifier' => 'student@unlock.test',
            'password' => 'CorrectPassword123!',
            'device_name' => 'TestingDevice',
            'client' => 'web',
        ]);

        $loginResponse->assertStatus(200);
        expect($loginResponse->json('data.token'))->not->toBeEmpty();
    } finally {
        $this->tenantContext->forget();
    }
});

it('allows suspending and reactivating user accounts with immediate token revocation', function () {
    config(['app_profile.deploy_profile' => 'cloud']);

    $tenant = $this->provisioner->provision('tenant_suspend', 'Suspend Poly', 'suspend.test', 'cloud');
    $this->tenantContext->setTenant($tenant);

    try {
        app(KeralaPolytechnicProfileSeeder::class)->run();

        $admin = User::create([
            'type' => 'staff',
            'name' => 'IT Admin',
            'email' => 'admin@suspend.test',
            'password' => Hash::make('AdminPass123!'),
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

        $lecturer = User::create([
            'type' => 'staff',
            'name' => 'Lecturer Mark',
            'email' => 'mark@suspend.test',
            'password' => Hash::make('MarkPassword123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);

        $lecturerToken = $lecturer->createToken('mark_token')->plainTextToken;
        $adminToken = $admin->createToken('admin_token')->plainTextToken;

        $this->app['auth']->forgetGuards();

        // Normal authenticated call succeeds
        $resBefore = $this->withHeaders([
            'Authorization' => "Bearer {$lecturerToken}",
        ])->getJson('http://suspend.test/api/v1/me');
        $resBefore->assertStatus(200);

        $this->app['auth']->forgetGuards();

        // Admin suspends lecturer
        $suspendRes = $this->withHeaders([
            'Authorization' => "Bearer {$adminToken}",
        ])->postJson("http://suspend.test/api/v1/users/{$lecturer->id}/suspend");
        $suspendRes->assertStatus(200);

        // Subsequent call with old token fails because tokens were deleted upon suspension
        $this->app['auth']->forgetGuards();
        $resAfter = $this->withHeaders([
            'Authorization' => "Bearer {$lecturerToken}",
        ])->getJson('http://suspend.test/api/v1/me');
        $resAfter->assertStatus(401);

        $this->app['auth']->forgetGuards();

        // Attempting to login while suspended is rejected
        $loginRes = $this->postJson('http://suspend.test/api/v1/auth/login', [
            'identifier' => 'mark@suspend.test',
            'password' => 'MarkPassword123!',
            'device_name' => 'WebClient',
            'client' => 'web',
        ]);
        expect(in_array($loginRes->status(), [401, 403], true))->toBeTrue();

        $this->app['auth']->forgetGuards();

        // Admin reactivates lecturer
        $reactivateRes = $this->withHeaders([
            'Authorization' => "Bearer {$adminToken}",
        ])->postJson("http://suspend.test/api/v1/users/{$lecturer->id}/reactivate");
        $reactivateRes->assertStatus(200);

        $this->app['auth']->forgetGuards();

        // Login now succeeds again
        $loginAgain = $this->postJson('http://suspend.test/api/v1/auth/login', [
            'identifier' => 'mark@suspend.test',
            'password' => 'MarkPassword123!',
            'device_name' => 'WebClient',
            'client' => 'web',
        ]);
        $loginAgain->assertStatus(200);
    } finally {
        $this->tenantContext->forget();
    }
});

it('supports role-assignments list, assign, and delete endpoints', function () {
    config(['app_profile.deploy_profile' => 'cloud']);

    $tenant = $this->provisioner->provision('tenant_ra_crud', 'RA CRUD Poly', 'racrud.test', 'cloud');
    $this->tenantContext->setTenant($tenant);

    try {
        app(KeralaPolytechnicProfileSeeder::class)->run();

        $principal = User::create([
            'type' => 'staff',
            'name' => 'Principal Peter',
            'email' => 'peter@racrud.test',
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

        $lecturer = User::create([
            'type' => 'staff',
            'name' => 'Lecturer Laura',
            'email' => 'laura@racrud.test',
            'password' => Hash::make('Password123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);

        $principalToken = $principal->createToken('principal_token')->plainTextToken;

        // 1. POST /api/v1/role-assignments
        $postRes = $this->withHeaders([
            'Authorization' => "Bearer {$principalToken}",
        ])->postJson('http://racrud.test/api/v1/role-assignments', [
            'user_id' => $lecturer->id,
            'role_key' => 'lecturer',
            'scope_type' => 'department',
            'scope_label' => 'd_ce',
        ]);
        $postRes->assertStatus(201);
        $assignmentId = (string) $postRes->json('data.id');
        expect($assignmentId)->not->toBeEmpty();

        // 2. GET /api/v1/role-assignments
        $getRes = $this->withHeaders([
            'Authorization' => "Bearer {$principalToken}",
        ])->getJson('http://racrud.test/api/v1/role-assignments');
        $getRes->assertStatus(200);
        expect($getRes->json('meta.total'))->toBeGreaterThanOrEqual(2);

        // 3. DELETE /api/v1/role-assignments/{id}
        $delRes = $this->withHeaders([
            'Authorization' => "Bearer {$principalToken}",
        ])->deleteJson("http://racrud.test/api/v1/role-assignments/{$assignmentId}");
        $delRes->assertStatus(200);

        // Confirm revoked in DB
        $this->tenantContext->setTenant($tenant);
        $assignment = RoleAssignment::find($assignmentId);
        expect($assignment->is_active)->toBeFalse();
    } finally {
        $this->tenantContext->forget();
    }
});

it('verifies full delegation matrix and scope constraints via HTTP', function () {
    config(['app_profile.deploy_profile' => 'cloud']);

    $tenant = $this->provisioner->provision('tenant_deleg_http', 'Deleg HTTP Poly', 'deleghtpp.test', 'cloud');
    $this->tenantContext->setTenant($tenant);

    try {
        app(KeralaPolytechnicProfileSeeder::class)->run();

        // 1. Principal
        $principal = User::create([
            'type' => 'staff',
            'name' => 'Principal P',
            'email' => 'principal@deleghtpp.test',
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

        // 2. Super Admin
        $superAdmin = User::create([
            'type' => 'staff',
            'name' => 'IT Head',
            'email' => 'superadmin@deleghtpp.test',
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

        // 3. Admin (Office Admin)
        $officeAdmin = User::create([
            'type' => 'staff',
            'name' => 'Office Admin O',
            'email' => 'officeadmin@deleghtpp.test',
            'password' => Hash::make('Password123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);
        $adminRole = Role::where('key', 'admin')->firstOrFail();
        RoleAssignment::create([
            'user_id' => $officeAdmin->id,
            'role_id' => $adminRole->id,
            'scope_type' => 'institution',
            'scope_label' => 'i_carmel',
            'is_singleton' => false,
            'is_active' => true,
        ]);

        // 4. CE HOD
        $ceHod = User::create([
            'type' => 'staff',
            'name' => 'CE HOD H',
            'email' => 'cehod@deleghtpp.test',
            'password' => Hash::make('Password123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);
        $hodRole = Role::where('key', 'hod')->firstOrFail();
        RoleAssignment::create([
            'user_id' => $ceHod->id,
            'role_id' => $hodRole->id,
            'scope_type' => 'department',
            'scope_label' => 'd_ce',
            'is_singleton' => true,
            'is_active' => true,
        ]);

        // 5. Staff users
        $staffUser1 = User::create([
            'type' => 'staff',
            'name' => 'Candidate 1',
            'email' => 'c1@deleghtpp.test',
            'password' => Hash::make('Password123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);
        $staffUser2 = User::create([
            'type' => 'staff',
            'name' => 'Candidate 2',
            'email' => 'c2@deleghtpp.test',
            'password' => Hash::make('Password123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);

        // Batch in CE and Batch in ME
        $batchCE = Batch::create([
            'program_id' => Program::first()->id,
            'home_department_id' => Department::where('code', 'CE')->first()->id,
            'managing_department_id' => Department::where('code', 'CE')->first()->id,
            'academic_year_id' => AcademicYear::first()->id,
            'regulation_id' => Regulation::first()->id,
            'name' => 'CE Batch 2026',
            'current_semester' => 3,
            'scope_label' => 'b_ce_2026',
            'home_path' => 'i_carmel.s_aided.d_ce.p_dce.b_ce_2026',
            'managing_path' => 'i_carmel.s_aided.d_ce.p_dce.b_ce_2026',
        ]);

        $batchME = Batch::create([
            'program_id' => Program::first()->id,
            'home_department_id' => Department::where('code', 'ME')->first()->id,
            'managing_department_id' => Department::where('code', 'ME')->first()->id,
            'academic_year_id' => AcademicYear::first()->id,
            'regulation_id' => Regulation::first()->id,
            'name' => 'ME Batch 2026',
            'current_semester' => 3,
            'scope_label' => 'b_me_2026',
            'home_path' => 'i_carmel.s_aided.d_me.p_dme.b_me_2026',
            'managing_path' => 'i_carmel.s_aided.d_me.p_dme.b_me_2026',
        ]);

        $principalToken = $principal->createToken('principal_token')->plainTextToken;
        $superAdminToken = $superAdmin->createToken('sa_token')->plainTextToken;
        $adminToken = $officeAdmin->createToken('admin_token')->plainTextToken;
        $ceHodToken = $ceHod->createToken('cehod_token')->plainTextToken;

        // (1) Principal assigns HOD -> 201 Created
        $this->app['auth']->forgetGuards();
        $resPrincAssignHod = $this->withHeaders([
            'Authorization' => "Bearer {$principalToken}",
        ])->postJson('http://deleghtpp.test/api/v1/roles/assign', [
            'user_id' => $staffUser1->id,
            'role_key' => 'hod',
            'scope_type' => 'department',
            'scope_label' => 'd_me',
        ]);
        $resPrincAssignHod->assertStatus(201);

        // (2) HOD assigns Tutor in own department batch -> 201 Created
        $this->app['auth']->forgetGuards();
        $resHodOwnDept = $this->withHeaders([
            'Authorization' => "Bearer {$ceHodToken}",
        ])->postJson('http://deleghtpp.test/api/v1/roles/assign', [
            'user_id' => $staffUser2->id,
            'role_key' => 'tutor',
            'scope_type' => 'batch',
            'scope_id' => $batchCE->id,
            'scope_label' => $batchCE->scope_label,
        ]);
        $resHodOwnDept->assertStatus(201);

        // (3) HOD assigns Tutor in another department batch -> 403 Forbidden
        $this->app['auth']->forgetGuards();
        $resHodOtherDept = $this->withHeaders([
            'Authorization' => "Bearer {$ceHodToken}",
        ])->postJson('http://deleghtpp.test/api/v1/roles/assign', [
            'user_id' => $staffUser2->id,
            'role_key' => 'tutor',
            'scope_type' => 'batch',
            'scope_id' => $batchME->id,
            'scope_label' => $batchME->scope_label,
        ]);
        $resHodOtherDept->assertStatus(403);

        // (4) Office Admin assigns HOD -> 403 Forbidden
        $this->app['auth']->forgetGuards();
        $resAdminAssignHod = $this->withHeaders([
            'Authorization' => "Bearer {$adminToken}",
        ])->postJson('http://deleghtpp.test/api/v1/roles/assign', [
            'user_id' => $staffUser2->id,
            'role_key' => 'hod',
            'scope_type' => 'department',
            'scope_label' => 'd_eee',
        ]);
        $resAdminAssignHod->assertStatus(403);

        // (5) Super Admin assigns HOD without order reference -> 422 Unprocessable
        $this->app['auth']->forgetGuards();
        $resSaWithoutOrder = $this->withHeaders([
            'Authorization' => "Bearer {$superAdminToken}",
        ])->postJson('http://deleghtpp.test/api/v1/roles/assign', [
            'user_id' => $staffUser2->id,
            'role_key' => 'hod',
            'scope_type' => 'department',
            'scope_label' => 'd_eee',
        ]);
        $resSaWithoutOrder->assertStatus(422);

        // (6) Super Admin assigns HOD with order reference -> 201 Created
        $this->app['auth']->forgetGuards();
        $resSaWithOrder = $this->withHeaders([
            'Authorization' => "Bearer {$superAdminToken}",
        ])->postJson('http://deleghtpp.test/api/v1/roles/assign', [
            'user_id' => $staffUser2->id,
            'role_key' => 'hod',
            'scope_type' => 'department',
            'scope_label' => 'd_eee',
            'order_record' => 'G.O.(Rt) No. 402/2026/HEDN',
        ]);
        $resSaWithOrder->assertStatus(201);

        // (7) HOD assigns HOD -> 403 Forbidden
        $this->app['auth']->forgetGuards();
        $resHodAssignHod = $this->withHeaders([
            'Authorization' => "Bearer {$ceHodToken}",
        ])->postJson('http://deleghtpp.test/api/v1/roles/assign', [
            'user_id' => $staffUser1->id,
            'role_key' => 'hod',
            'scope_type' => 'department',
            'scope_label' => 'd_ce',
        ]);
        $resHodAssignHod->assertStatus(403);

        // (8) HOD assigns Principal (role at or above assigner level) -> 403 Forbidden
        $this->app['auth']->forgetGuards();
        $resHodAssignPrinc = $this->withHeaders([
            'Authorization' => "Bearer {$ceHodToken}",
        ])->postJson('http://deleghtpp.test/api/v1/roles/assign', [
            'user_id' => $staffUser1->id,
            'role_key' => 'principal',
            'scope_type' => 'institution',
            'scope_label' => 'i_carmel',
        ]);
        $resHodAssignPrinc->assertStatus(403);
    } finally {
        $this->tenantContext->forget();
    }
});

it('returns real assignments and capabilities for authenticated user via /me', function () {
    config(['app_profile.deploy_profile' => 'cloud']);

    $tenant = $this->provisioner->provision('tenant_me_real', 'Me Real Poly', 'mereal.test', 'cloud');
    $this->tenantContext->setTenant($tenant);

    try {
        app(KeralaPolytechnicProfileSeeder::class)->run();

        $hod = User::create([
            'type' => 'staff',
            'name' => 'HOD Real',
            'email' => 'hodreal@mereal.test',
            'password' => Hash::make('Password123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);
        $hodRole = Role::where('key', 'hod')->firstOrFail();
        RoleAssignment::create([
            'user_id' => $hod->id,
            'role_id' => $hodRole->id,
            'scope_type' => 'department',
            'scope_label' => 'd_ce',
            'is_singleton' => true,
            'is_active' => true,
        ]);

        $token = $hod->createToken('hod_token')->plainTextToken;

        $response = $this->withHeaders([
            'Authorization' => "Bearer {$token}",
        ])->getJson('http://mereal.test/api/v1/me');

        $response->assertStatus(200);

        // Active assignments present
        $assignments = $response->json('data.assignments');
        expect($assignments)->toHaveCount(1)
            ->and($assignments[0]['role_key'])->toBe('hod')
            ->and($assignments[0]['scope_label'])->toBe('d_ce')
            ->and($assignments[0]['is_singleton'])->toBeTrue();

        // Active capabilities present
        $capabilities = $response->json('data.capabilities');
        expect($capabilities)->toContain('organisation.batch.create')
            ->toContain('organisation.batch.promote_semester')
            ->toContain('organisation.batch.assign_tutor');
    } finally {
        $this->tenantContext->forget();
    }
});

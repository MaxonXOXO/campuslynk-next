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

dataset('impersonatable_target_roles', [
    'principal',
    'chairman',
    'admin',
    'academic_coordinator',
    'gen_dept_coordinator',
    'sf_office',
    'hod',
    'workshop_superintendent',
    'tutor',
    'mentor',
    'course_teacher',
    'lecturer',
    'demonstrator',
    'workshop_instructor',
    'trade_instructor',
    'tradesman',
    'laboratory_assistant',
    'physical_instructor',
    'student',
    'parent',
]);

it('enforces read-only restrictions and allows safe GET and stop for all 20 target roles', function (string $roleKey) {
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

        $targetUser = User::create([
            'type' => in_array($roleKey, ['student', 'parent']) ? $roleKey : 'staff',
            'name' => "Target User {$roleKey}",
            'email' => "user_{$roleKey}@impro.test",
            'password' => Hash::make('Password123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);

        $role = Role::where('key', $roleKey)->firstOrFail();
        RoleAssignment::create([
            'user_id' => $targetUser->id,
            'role_id' => $role->id,
            'scope_type' => $role->scope_type === 'institution' ? 'institution' : 'department',
            'scope_label' => $role->scope_type === 'institution' ? 'i_carmel' : 'd_ce',
            'is_singleton' => false,
            'is_active' => true,
        ]);

        $adminToken = $superAdmin->createToken('admin_token')->plainTextToken;

        // Initiate impersonation
        $response = $this->withHeaders([
            'Authorization' => "Bearer {$adminToken}",
        ])->postJson('http://impro.test/api/v1/impersonation', [
            'user_id' => $targetUser->id,
            'ticket' => "TICKET-{$roleKey}",
            'reason' => "Audited administrative investigation for {$roleKey}",
        ]);

        $response->assertStatus(201);
        expect($response->json('data.read_only'))->toBeTrue();

        $impToken = (string) $response->json('data.token');

        // Flush guard cache for fresh request
        $this->app['auth']->forgetGuards();

        // 1. GET requests work
        $getResponse = $this->withHeaders([
            'Authorization' => "Bearer {$impToken}",
        ])->getJson('http://impro.test/api/v1/me');
        $getResponse->assertStatus(200);

        // 2. POST requests are blocked with 403 Forbidden
        $postResponse = $this->withHeaders([
            'Authorization' => "Bearer {$impToken}",
        ])->postJson('http://impro.test/api/v1/batches', [
            'name' => 'Illegal Batch',
        ]);
        $postResponse->assertStatus(403);
        expect($postResponse->json('title'))->toBe('Read-Only Impersonation Session');

        // 3. PUT requests are blocked with 403 Forbidden
        $putResponse = $this->withHeaders([
            'Authorization' => "Bearer {$impToken}",
        ])->putJson("http://impro.test/api/v1/users/{$targetUser->id}", [
            'name' => 'Illegal User Update',
        ]);
        $putResponse->assertStatus(403);

        // 4. DELETE requests are blocked with 403 Forbidden
        $deleteResponse = $this->withHeaders([
            'Authorization' => "Bearer {$impToken}",
        ])->deleteJson('http://impro.test/api/v1/role-assignments/non_existent_id');
        $deleteResponse->assertStatus(403);

        // 5. POST /impersonation/stop works
        $stopResponse = $this->withHeaders([
            'Authorization' => "Bearer {$impToken}",
        ])->postJson('http://impro.test/api/v1/impersonation/stop');
        $stopResponse->assertStatus(200);
    } finally {
        $this->tenantContext->forget();
    }
})->with('impersonatable_target_roles');

it('enforces reason minimum length when starting impersonation', function () {
    config(['app_profile.deploy_profile' => 'cloud']);

    $tenant = $this->provisioner->provision('tenant_imp_reason', 'Imp Reason Poly', 'reason.test', 'cloud');
    $this->tenantContext->setTenant($tenant);

    try {
        app(KeralaPolytechnicProfileSeeder::class)->run();

        $superAdmin = User::create([
            'type' => 'staff',
            'name' => 'IT Head',
            'email' => 'ithead@reason.test',
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
            'name' => 'Target Lecturer',
            'email' => 'lecturer@reason.test',
            'password' => Hash::make('Password123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);

        $token = $superAdmin->createToken('admin_token')->plainTextToken;

        // Missing reason fails validation (422)
        $resMissing = $this->withHeaders([
            'Authorization' => "Bearer {$token}",
        ])->postJson('http://reason.test/api/v1/impersonation', [
            'user_id' => $lecturer->id,
            'ticket' => 'INC-100',
        ]);
        $resMissing->assertStatus(422)->assertJsonValidationErrors(['reason']);

        // Reason < 10 characters fails validation (422)
        $resShort = $this->withHeaders([
            'Authorization' => "Bearer {$token}",
        ])->postJson('http://reason.test/api/v1/impersonation', [
            'user_id' => $lecturer->id,
            'ticket' => 'INC-100',
            'reason' => 'Too short',
        ]);
        $resShort->assertStatus(422)->assertJsonValidationErrors(['reason']);
    } finally {
        $this->tenantContext->forget();
    }
});

it('rejects impersonating another super administrator or self', function () {
    config(['app_profile.deploy_profile' => 'cloud']);

    $tenant = $this->provisioner->provision('tenant_imp_super', 'Imp Super Poly', 'super.test', 'cloud');
    $this->tenantContext->setTenant($tenant);

    try {
        app(KeralaPolytechnicProfileSeeder::class)->run();

        $superAdmin1 = User::create([
            'type' => 'staff',
            'name' => 'IT Head 1',
            'email' => 'ithead1@super.test',
            'password' => Hash::make('Password123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);
        $superAdmin2 = User::create([
            'type' => 'staff',
            'name' => 'IT Head 2',
            'email' => 'ithead2@super.test',
            'password' => Hash::make('Password123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);
        $superAdminRole = Role::where('key', 'super_admin')->firstOrFail();
        RoleAssignment::create([
            'user_id' => $superAdmin1->id,
            'role_id' => $superAdminRole->id,
            'scope_type' => 'institution',
            'scope_label' => 'i_carmel',
            'is_singleton' => false,
            'is_active' => true,
        ]);
        RoleAssignment::create([
            'user_id' => $superAdmin2->id,
            'role_id' => $superAdminRole->id,
            'scope_type' => 'institution',
            'scope_label' => 'i_carmel',
            'is_singleton' => false,
            'is_active' => true,
        ]);

        $token1 = $superAdmin1->createToken('admin1_token')->plainTextToken;

        // Impersonating self rejected
        $resSelf = $this->withHeaders([
            'Authorization' => "Bearer {$token1}",
        ])->postJson('http://super.test/api/v1/impersonation', [
            'user_id' => $superAdmin1->id,
            'ticket' => 'INC-101',
            'reason' => 'Legitimate administrative reason',
        ]);
        $resSelf->assertStatus(403);

        // Impersonating another Super Admin rejected
        $resOther = $this->withHeaders([
            'Authorization' => "Bearer {$token1}",
        ])->postJson('http://super.test/api/v1/impersonation', [
            'user_id' => $superAdmin2->id,
            'ticket' => 'INC-102',
            'reason' => 'Legitimate administrative reason',
        ]);
        $resOther->assertStatus(403);
    } finally {
        $this->tenantContext->forget();
    }
});

it('rejects nested impersonation attempts', function () {
    config(['app_profile.deploy_profile' => 'cloud']);

    $tenant = $this->provisioner->provision('tenant_imp_nest', 'Imp Nest Poly', 'nest.test', 'cloud');
    $this->tenantContext->setTenant($tenant);

    try {
        app(KeralaPolytechnicProfileSeeder::class)->run();

        $superAdmin = User::create([
            'type' => 'staff',
            'name' => 'IT Head',
            'email' => 'ithead@nest.test',
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
            'name' => 'Lecturer A',
            'email' => 'lecturera@nest.test',
            'password' => Hash::make('Password123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);

        $student = User::create([
            'type' => 'student',
            'name' => 'Student B',
            'email' => 'studentb@nest.test',
            'password' => Hash::make('Password123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);

        $adminToken = $superAdmin->createToken('admin_token')->plainTextToken;

        // Super Admin impersonates Lecturer
        $res = $this->withHeaders([
            'Authorization' => "Bearer {$adminToken}",
        ])->postJson('http://nest.test/api/v1/impersonation', [
            'user_id' => $lecturer->id,
            'ticket' => 'INC-NEST-1',
            'reason' => 'Initial valid impersonation session',
        ]);
        $res->assertStatus(201);
        $impToken = (string) $res->json('data.token');

        $this->app['auth']->forgetGuards();

        // While impersonating, attempt to start another impersonation (nested impersonation)
        $resNested = $this->withHeaders([
            'Authorization' => "Bearer {$impToken}",
        ])->postJson('http://nest.test/api/v1/impersonation', [
            'user_id' => $student->id,
            'ticket' => 'INC-NEST-2',
            'reason' => 'Secondary nested impersonation attempt',
        ]);

        $resNested->assertStatus(403);
    } finally {
        $this->tenantContext->forget();
    }
});

it('blocks routes flagged with side effects on GET while impersonating', function () {
    config(['app_profile.deploy_profile' => 'cloud']);

    $tenant = $this->provisioner->provision('tenant_imp_side', 'Imp Side Poly', 'side.test', 'cloud');
    $this->tenantContext->setTenant($tenant);

    try {
        app(KeralaPolytechnicProfileSeeder::class)->run();

        $superAdmin = User::create([
            'type' => 'staff',
            'name' => 'IT Head',
            'email' => 'ithead@side.test',
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
            'email' => 'bob@side.test',
            'password' => Hash::make('Password123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);
        $adminRole = Role::where('key', 'admin')->firstOrFail();
        RoleAssignment::create([
            'user_id' => $lecturer->id,
            'role_id' => $adminRole->id,
            'scope_type' => 'institution',
            'scope_label' => 'i_carmel',
            'is_singleton' => false,
            'is_active' => true,
        ]);

        $adminToken = $superAdmin->createToken('admin_token')->plainTextToken;
        $directLecturerToken = $lecturer->createToken('direct_token')->plainTextToken;

        $res = $this->withHeaders([
            'Authorization' => "Bearer {$adminToken}",
        ])->postJson('http://side.test/api/v1/impersonation', [
            'user_id' => $lecturer->id,
            'ticket' => 'INC-SIDE',
            'reason' => 'Testing side-effect route restriction',
        ]);
        $res->assertStatus(201);
        $impToken = (string) $res->json('data.token');

        $this->app['auth']->forgetGuards();

        // Normal authenticated user calling GET on side-effect route succeeds
        $directRes = $this->withHeaders([
            'Authorization' => "Bearer {$directLecturerToken}",
        ])->getJson('http://side.test/api/v1/test/side-effect-action');
        $directRes->assertStatus(200);

        $this->app['auth']->forgetGuards();

        // Impersonated session calling GET on side-effect route is blocked with 403
        $impRes = $this->withHeaders([
            'Authorization' => "Bearer {$impToken}",
        ])->getJson('http://side.test/api/v1/test/side-effect-action');
        $impRes->assertStatus(403);
        expect($impRes->json('title'))->toBe('Impersonation Prohibited');
    } finally {
        $this->tenantContext->forget();
    }
});

it('expires impersonation tokens after 30 minutes', function () {
    config(['app_profile.deploy_profile' => 'cloud']);

    $tenant = $this->provisioner->provision('tenant_imp_exp', 'Imp Exp Poly', 'exp.test', 'cloud');
    $this->tenantContext->setTenant($tenant);

    try {
        app(KeralaPolytechnicProfileSeeder::class)->run();

        $superAdmin = User::create([
            'type' => 'staff',
            'name' => 'IT Head',
            'email' => 'ithead@exp.test',
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
            'email' => 'bob@exp.test',
            'password' => Hash::make('Password123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);

        $adminToken = $superAdmin->createToken('admin_token')->plainTextToken;

        $res = $this->withHeaders([
            'Authorization' => "Bearer {$adminToken}",
        ])->postJson('http://exp.test/api/v1/impersonation', [
            'user_id' => $lecturer->id,
            'ticket' => 'INC-EXP',
            'reason' => 'Testing time-to-live expiration',
        ]);
        $res->assertStatus(201);
        $impToken = (string) $res->json('data.token');

        $this->app['auth']->forgetGuards();

        // Immediate request succeeds
        $resBefore = $this->withHeaders([
            'Authorization' => "Bearer {$impToken}",
        ])->getJson('http://exp.test/api/v1/me');
        $resBefore->assertStatus(200);

        // Travel 31 minutes into the future
        $this->travel(31)->minutes();

        $this->app['auth']->forgetGuards();

        // Expired request fails with 401 Unauthenticated
        $resAfter = $this->withHeaders([
            'Authorization' => "Bearer {$impToken}",
        ])->getJson('http://exp.test/api/v1/me');
        $resAfter->assertStatus(401);
    } finally {
        $this->tenantContext->forget();
    }
});

it('verifies audit logging and security log entries for impersonation', function () {
    config(['app_profile.deploy_profile' => 'cloud']);

    $tenant = $this->provisioner->provision('tenant_imp_audit', 'Imp Audit Poly', 'audit.test', 'cloud');
    $this->tenantContext->setTenant($tenant);

    try {
        app(KeralaPolytechnicProfileSeeder::class)->run();

        $superAdmin = User::create([
            'type' => 'staff',
            'name' => 'IT Head',
            'email' => 'ithead@audit.test',
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
            'email' => 'bob@audit.test',
            'password' => Hash::make('Password123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);

        $adminToken = $superAdmin->createToken('admin_token')->plainTextToken;

        $res = $this->withHeaders([
            'Authorization' => "Bearer {$adminToken}",
        ])->postJson('http://audit.test/api/v1/impersonation', [
            'user_id' => $lecturer->id,
            'ticket' => 'INC-AUDIT-1',
            'reason' => 'Verifying audit and security log records',
        ]);
        $res->assertStatus(201);

        // Security log audit query
        $this->tenantContext->setTenant($tenant);
        $securityLog = Activity::where('log_name', 'security')
            ->where('subject_id', $lecturer->id)
            ->first();

        expect($securityLog)->not->toBeNull()
            ->and($securityLog->causer_id)->toBe($superAdmin->id)
            ->and($securityLog->description)->toContain('INC-AUDIT-1')
            ->and($securityLog->properties['read_only'])->toBeTrue();
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

<?php

declare(strict_types=1);

namespace Tests\Feature\Organisation;

use App\Core\Http\ProblemDetails;
use App\Core\Tenancy\Services\TenantProvisioner;
use App\Core\Tenancy\TenantContext;
use App\Modules\Identity\Models\Role;
use App\Modules\Identity\Models\RoleAssignment;
use App\Modules\Identity\Models\User;
use App\Modules\Organisation\Actions\CreateDepartmentAction;
use App\Modules\Organisation\Database\Seeders\TenantBaselineSeeder;
use App\Modules\Organisation\Models\Department;
use App\Modules\Organisation\Models\Program;
use App\Modules\Organisation\Models\Stream;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Symfony\Component\HttpFoundation\Response;
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

it('creates a stream with valid code and name', function () {
    config(['app_profile.deploy_profile' => 'cloud']);

    $tenant = $this->provisioner->provision('tenant_stream_create', 'Stream College', 'streamcreate.test', 'cloud');
    $this->tenantContext->setTenant($tenant);
    app(TenantBaselineSeeder::class)->run();

    try {
        $superAdmin = User::create([
            'type' => 'staff',
            'name' => 'Super Administrator',
            'email' => 'superadmin@streamcreate.test',
            'password' => Hash::make('Password123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);
        $superAdminRole = Role::where('key', 'super_admin')->firstOrFail();
        RoleAssignment::create([
            'user_id' => $superAdmin->id,
            'role_id' => $superAdminRole->id,
            'scope_type' => 'institution',
            'scope_label' => 'inst_root',
            'is_singleton' => false,
            'is_active' => true,
        ]);

        $token = $superAdmin->createToken('admin-token')->plainTextToken;

        $response = $this->withHeaders([
            'Authorization' => "Bearer {$token}",
        ])->postJson('http://streamcreate.test/api/v1/streams', [
            'code' => 'AIDED',
            'name' => 'Aided Stream',
        ]);

        $response->assertStatus(Response::HTTP_CREATED)
            ->assertJsonPath('data.code', 'AIDED')
            ->assertJsonPath('data.name', 'Aided Stream')
            ->assertJsonPath('data.scope_label', 's_aided')
            ->assertJsonPath('data.departments_count', 0);

        $this->tenantContext->setTenant($tenant);
        expect(Stream::where('code', 'AIDED')->exists())->toBeTrue();
    } finally {
        $this->tenantContext->forget();
    }
});

it('rejects duplicate stream code with 422 problem+json', function () {
    config(['app_profile.deploy_profile' => 'cloud']);

    $tenant = $this->provisioner->provision('tenant_stream_dup', 'Stream College', 'streamdup.test', 'cloud');
    $this->tenantContext->setTenant($tenant);
    app(TenantBaselineSeeder::class)->run();

    try {
        $superAdmin = User::create([
            'type' => 'staff',
            'name' => 'Super Administrator',
            'email' => 'superadmin@streamdup.test',
            'password' => Hash::make('Password123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);
        $superAdminRole = Role::where('key', 'super_admin')->firstOrFail();
        RoleAssignment::create([
            'user_id' => $superAdmin->id,
            'role_id' => $superAdminRole->id,
            'scope_type' => 'institution',
            'scope_label' => 'inst_root',
            'is_singleton' => false,
            'is_active' => true,
        ]);

        $token = $superAdmin->createToken('admin-token')->plainTextToken;

        Stream::create([
            'code' => 'AIDED',
            'name' => 'Aided Stream',
            'scope_label' => 's_aided',
        ]);

        $response = $this->withHeaders([
            'Authorization' => "Bearer {$token}",
        ])->postJson('http://streamdup.test/api/v1/streams', [
            'code' => 'AIDED',
            'name' => 'Duplicate Aided Stream',
        ]);

        $response->assertStatus(Response::HTTP_UNPROCESSABLE_ENTITY)
            ->assertHeader('Content-Type', 'application/problem+json')
            ->assertJson([
                'type' => ProblemDetails::type('unprocessable'),
                'title' => 'Unprocessable Content',
                'status' => Response::HTTP_UNPROCESSABLE_ENTITY,
            ]);
    } finally {
        $this->tenantContext->forget();
    }
});

it('lists streams ordered by name with departments_count', function () {
    config(['app_profile.deploy_profile' => 'cloud']);

    $tenant = $this->provisioner->provision('tenant_stream_list', 'Stream College', 'streamlist.test', 'cloud');
    $this->tenantContext->setTenant($tenant);
    app(TenantBaselineSeeder::class)->run();

    try {
        $superAdmin = User::create([
            'type' => 'staff',
            'name' => 'Super Administrator',
            'email' => 'superadmin@streamlist.test',
            'password' => Hash::make('Password123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);
        $superAdminRole = Role::where('key', 'super_admin')->firstOrFail();
        RoleAssignment::create([
            'user_id' => $superAdmin->id,
            'role_id' => $superAdminRole->id,
            'scope_type' => 'institution',
            'scope_label' => 'inst_root',
            'is_singleton' => false,
            'is_active' => true,
        ]);

        $token = $superAdmin->createToken('admin-token')->plainTextToken;

        $streamB = Stream::create([
            'code' => 'POLY',
            'name' => 'Polytechnic Stream',
            'scope_label' => 's_poly',
        ]);

        $streamA = Stream::create([
            'code' => 'ENGG',
            'name' => 'Engineering Stream',
            'scope_label' => 's_engg',
        ]);

        app(CreateDepartmentAction::class)->execute(
            code: 'CE',
            name: 'Civil Engineering',
            streamId: $streamA->id
        );

        $response = $this->withHeaders([
            'Authorization' => "Bearer {$token}",
        ])->getJson('http://streamlist.test/api/v1/streams');

        $response->assertStatus(Response::HTTP_OK);
        $data = $response->json('data');

        expect($data)->toHaveCount(2)
            ->and($data[0]['name'])->toBe('Engineering Stream')
            ->and($data[0]['departments_count'])->toBe(1)
            ->and($data[1]['name'])->toBe('Polytechnic Stream')
            ->and($data[1]['departments_count'])->toBe(0);
    } finally {
        $this->tenantContext->forget();
    }
});

it('updates stream name successfully via PATCH /streams/{id}', function () {
    config(['app_profile.deploy_profile' => 'cloud']);

    $tenant = $this->provisioner->provision('tenant_stream_update', 'Stream College', 'streamupdate.test', 'cloud');
    $this->tenantContext->setTenant($tenant);
    app(TenantBaselineSeeder::class)->run();

    try {
        $superAdmin = User::create([
            'type' => 'staff',
            'name' => 'Super Administrator',
            'email' => 'superadmin@streamupdate.test',
            'password' => Hash::make('Password123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);
        $superAdminRole = Role::where('key', 'super_admin')->firstOrFail();
        RoleAssignment::create([
            'user_id' => $superAdmin->id,
            'role_id' => $superAdminRole->id,
            'scope_type' => 'institution',
            'scope_label' => 'inst_root',
            'is_singleton' => false,
            'is_active' => true,
        ]);

        $token = $superAdmin->createToken('admin-token')->plainTextToken;

        $stream = Stream::create([
            'code' => 'ENGG',
            'name' => 'Engineering Stream',
            'scope_label' => 's_engg',
        ]);

        $response = $this->withHeaders([
            'Authorization' => "Bearer {$token}",
        ])->patchJson("http://streamupdate.test/api/v1/streams/{$stream->id}", [
            'name' => 'Engineering and Technology Stream',
        ]);

        $response->assertStatus(Response::HTTP_OK)
            ->assertJsonPath('data.name', 'Engineering and Technology Stream')
            ->assertJsonPath('data.code', 'ENGG');

        $this->tenantContext->setTenant($tenant);
        expect($stream->fresh()->name)->toBe('Engineering and Technology Stream');
    } finally {
        $this->tenantContext->forget();
    }
});

it('rejects stream code change with 422 problem+json', function () {
    config(['app_profile.deploy_profile' => 'cloud']);

    $tenant = $this->provisioner->provision('tenant_stream_code_lock', 'Stream College', 'streamcodelock.test', 'cloud');
    $this->tenantContext->setTenant($tenant);
    app(TenantBaselineSeeder::class)->run();

    try {
        $superAdmin = User::create([
            'type' => 'staff',
            'name' => 'Super Administrator',
            'email' => 'superadmin@streamcodelock.test',
            'password' => Hash::make('Password123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);
        $superAdminRole = Role::where('key', 'super_admin')->firstOrFail();
        RoleAssignment::create([
            'user_id' => $superAdmin->id,
            'role_id' => $superAdminRole->id,
            'scope_type' => 'institution',
            'scope_label' => 'inst_root',
            'is_singleton' => false,
            'is_active' => true,
        ]);

        $token = $superAdmin->createToken('admin-token')->plainTextToken;

        $stream = Stream::create([
            'code' => 'ENGG',
            'name' => 'Engineering Stream',
            'scope_label' => 's_engg',
        ]);

        $response = $this->withHeaders([
            'Authorization' => "Bearer {$token}",
        ])->patchJson("http://streamcodelock.test/api/v1/streams/{$stream->id}", [
            'name' => 'New Engineering Stream',
            'code' => 'NEW_ENGG',
        ]);

        $response->assertStatus(Response::HTTP_UNPROCESSABLE_ENTITY)
            ->assertHeader('Content-Type', 'application/problem+json')
            ->assertJson([
                'type' => ProblemDetails::type('unprocessable'),
                'title' => 'Unprocessable Content',
                'status' => Response::HTTP_UNPROCESSABLE_ENTITY,
            ]);

        $this->tenantContext->setTenant($tenant);
        expect($stream->fresh()->code)->toBe('ENGG');
    } finally {
        $this->tenantContext->forget();
    }
});

it('blocks delete with 409 problem+json when departments reference stream and succeeds when none', function () {
    config(['app_profile.deploy_profile' => 'cloud']);

    $tenant = $this->provisioner->provision('tenant_stream_delete', 'Stream College', 'streamdelete.test', 'cloud');
    $this->tenantContext->setTenant($tenant);
    app(TenantBaselineSeeder::class)->run();

    try {
        $superAdmin = User::create([
            'type' => 'staff',
            'name' => 'Super Administrator',
            'email' => 'superadmin@streamdelete.test',
            'password' => Hash::make('Password123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);
        $superAdminRole = Role::where('key', 'super_admin')->firstOrFail();
        RoleAssignment::create([
            'user_id' => $superAdmin->id,
            'role_id' => $superAdminRole->id,
            'scope_type' => 'institution',
            'scope_label' => 'inst_root',
            'is_singleton' => false,
            'is_active' => true,
        ]);

        $token = $superAdmin->createToken('admin-token')->plainTextToken;

        $stream = Stream::create([
            'code' => 'ENGG',
            'name' => 'Engineering Stream',
            'scope_label' => 's_engg',
        ]);

        $dept = app(CreateDepartmentAction::class)->execute(
            code: 'CE',
            name: 'Civil Engineering',
            streamId: $stream->id
        );

        // 1. Delete blocked with 409 when department references stream
        $blockedRes = $this->withHeaders([
            'Authorization' => "Bearer {$token}",
        ])->deleteJson("http://streamdelete.test/api/v1/streams/{$stream->id}");

        $blockedRes->assertStatus(Response::HTTP_CONFLICT)
            ->assertHeader('Content-Type', 'application/problem+json')
            ->assertJson([
                'type' => ProblemDetails::type('stream-in-use'),
                'title' => 'Conflict',
                'status' => Response::HTTP_CONFLICT,
            ]);

        $this->tenantContext->setTenant($tenant);
        expect(Stream::where('id', $stream->id)->exists())->toBeTrue();

        // 2. Remove referencing department and retry delete
        $dept->delete();

        $successRes = $this->withHeaders([
            'Authorization' => "Bearer {$token}",
        ])->deleteJson("http://streamdelete.test/api/v1/streams/{$stream->id}");

        $successRes->assertStatus(Response::HTTP_OK)
            ->assertJsonPath('data.message', 'Stream deleted successfully.');

        $this->tenantContext->setTenant($tenant);
        expect(Stream::where('id', $stream->id)->exists())->toBeFalse();
    } finally {
        $this->tenantContext->forget();
    }
});

it('rejects non-super_admin on stream create, update, and delete with 403', function () {
    config(['app_profile.deploy_profile' => 'cloud']);

    $tenant = $this->provisioner->provision('tenant_stream_rbac', 'Stream College', 'streamrbac.test', 'cloud');
    $this->tenantContext->setTenant($tenant);
    app(TenantBaselineSeeder::class)->run();

    try {
        $lecturer = User::create([
            'type' => 'staff',
            'name' => 'Regular Lecturer',
            'email' => 'lecturer@streamrbac.test',
            'password' => Hash::make('Password123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);
        $lecturerRole = Role::where('key', 'lecturer')->firstOrFail();
        RoleAssignment::create([
            'user_id' => $lecturer->id,
            'role_id' => $lecturerRole->id,
            'scope_type' => 'institution',
            'scope_label' => 'inst_root',
            'is_singleton' => false,
            'is_active' => true,
        ]);

        $token = $lecturer->createToken('lecturer-token')->plainTextToken;

        $stream = Stream::create([
            'code' => 'ENGG',
            'name' => 'Engineering Stream',
            'scope_label' => 's_engg',
        ]);

        // Lecturer can list streams (organisation.batch.view)
        $listRes = $this->withHeaders([
            'Authorization' => "Bearer {$token}",
        ])->getJson('http://streamrbac.test/api/v1/streams');
        $listRes->assertStatus(Response::HTTP_OK);

        // Lecturer cannot create stream
        $createRes = $this->withHeaders([
            'Authorization' => "Bearer {$token}",
        ])->postJson('http://streamrbac.test/api/v1/streams', [
            'code' => 'NEW',
            'name' => 'New Stream',
        ]);
        $createRes->assertStatus(Response::HTTP_FORBIDDEN);

        // Lecturer cannot update stream
        $updateRes = $this->withHeaders([
            'Authorization' => "Bearer {$token}",
        ])->patchJson("http://streamrbac.test/api/v1/streams/{$stream->id}", [
            'name' => 'Unauthorized Rename',
        ]);
        $updateRes->assertStatus(Response::HTTP_FORBIDDEN);

        // Lecturer cannot delete stream
        $deleteRes = $this->withHeaders([
            'Authorization' => "Bearer {$token}",
        ])->deleteJson("http://streamrbac.test/api/v1/streams/{$stream->id}");
        $deleteRes->assertStatus(Response::HTTP_FORBIDDEN);
    } finally {
        $this->tenantContext->forget();
    }
});

it('executes full flow on fresh baseline-only tenant: create stream -> create department -> create academic year', function () {
    config(['app_profile.deploy_profile' => 'cloud']);

    $tenant = $this->provisioner->provision('tenant_stream_flow', 'Fresh College', 'streamflow.test', 'cloud');
    $this->tenantContext->setTenant($tenant);
    // Fresh tenant baseline only (no Kerala polytechnic seeder)
    app(TenantBaselineSeeder::class)->run();

    try {
        $superAdmin = User::create([
            'type' => 'staff',
            'name' => 'Super Administrator',
            'email' => 'superadmin@streamflow.test',
            'password' => Hash::make('Password123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);
        $superAdminRole = Role::where('key', 'super_admin')->firstOrFail();
        RoleAssignment::create([
            'user_id' => $superAdmin->id,
            'role_id' => $superAdminRole->id,
            'scope_type' => 'institution',
            'scope_label' => 'inst_root',
            'is_singleton' => false,
            'is_active' => true,
        ]);

        $token = $superAdmin->createToken('admin-token')->plainTextToken;

        // Step 1: Create stream
        $streamRes = $this->withHeaders([
            'Authorization' => "Bearer {$token}",
        ])->postJson('http://streamflow.test/api/v1/streams', [
            'code' => 'ENGG',
            'name' => 'Engineering Stream',
        ]);
        $streamRes->assertStatus(Response::HTTP_CREATED);
        $streamId = (string) $streamRes->json('data.id');
        expect($streamId)->not->toBeEmpty();

        // Step 2: Create department under created stream
        $deptRes = $this->withHeaders([
            'Authorization' => "Bearer {$token}",
        ])->postJson('http://streamflow.test/api/v1/departments', [
            'code' => 'CSE',
            'name' => 'Computer Science & Engineering',
            'stream_id' => $streamId,
            'kind' => 'academic',
        ]);
        $deptRes->assertStatus(Response::HTTP_CREATED);
        $deptId = (string) $deptRes->json('data.id');
        expect($deptId)->not->toBeEmpty()
            ->and($deptRes->json('data.stream_id'))->toBe($streamId);

        // Step 3: Create academic year
        $ayRes = $this->withHeaders([
            'Authorization' => "Bearer {$token}",
        ])->postJson('http://streamflow.test/api/v1/academic-years', [
            'label' => '2026-2027',
            'start_date' => '2026-06-01',
            'end_date' => '2027-05-31',
            'is_current' => true,
        ]);
        $ayRes->assertStatus(Response::HTTP_CREATED);
        $ayId = (string) $ayRes->json('data.id');
        expect($ayId)->not->toBeEmpty();
    } finally {
        $this->tenantContext->forget();
    }
});

it('deletes an unreferenced department via DELETE /departments/{id} and blocks deletion with 409 when referenced by a program', function () {
    config(['app_profile.deploy_profile' => 'cloud']);

    $tenant = $this->provisioner->provision('tenant_dept_delete', 'Dept College', 'deptdelete.test', 'cloud');
    $this->tenantContext->setTenant($tenant);
    app(TenantBaselineSeeder::class)->run();

    try {
        $superAdmin = User::create([
            'type' => 'staff',
            'name' => 'Super Administrator',
            'email' => 'superadmin@deptdelete.test',
            'password' => Hash::make('Password123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);
        $superAdminRole = Role::where('key', 'super_admin')->firstOrFail();
        RoleAssignment::create([
            'user_id' => $superAdmin->id,
            'role_id' => $superAdminRole->id,
            'scope_type' => 'institution',
            'scope_label' => 'inst_root',
            'is_singleton' => false,
            'is_active' => true,
        ]);

        $lecturer = User::create([
            'type' => 'staff',
            'name' => 'Regular Lecturer',
            'email' => 'lecturer@deptdelete.test',
            'password' => Hash::make('Password123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);
        $lecturerRole = Role::where('key', 'lecturer')->firstOrFail();
        RoleAssignment::create([
            'user_id' => $lecturer->id,
            'role_id' => $lecturerRole->id,
            'scope_type' => 'institution',
            'scope_label' => 'inst_root',
            'is_singleton' => false,
            'is_active' => true,
        ]);

        $adminToken = $superAdmin->createToken('admin-token')->plainTextToken;
        $lecturerToken = $lecturer->createToken('lecturer-token')->plainTextToken;

        $stream = Stream::create([
            'code' => 'AIDED',
            'name' => 'Aided Stream',
            'scope_label' => 's_aided',
        ]);

        $dept = app(CreateDepartmentAction::class)->execute(
            code: 'CE',
            name: 'Civil Engineering',
            streamId: $stream->id
        );

        // 1. Unauthorized lecturer gets 403
        $forbiddenRes = $this->withHeaders([
            'Authorization' => "Bearer {$lecturerToken}",
        ])->deleteJson("http://deptdelete.test/api/v1/departments/{$dept->id}");
        $forbiddenRes->assertStatus(Response::HTTP_FORBIDDEN);

        // Clear Sanctum cached guard user before authenticating with adminToken
        Auth::forgetGuards();

        // 2. Attach a Program to the department -> delete is blocked with 409 department-in-use
        $this->tenantContext->setTenant($tenant);
        $program = Program::create([
            'department_id' => $dept->id,
            'code' => 'DIP-CE',
            'name' => 'Diploma in Civil Engineering',
            'duration_years' => 3,
            'total_semesters' => 6,
            'regulation' => 'REV2021',
            'scope_label' => 'p_dip_ce',
            'path' => 'inst_root.s_aided.d_aided_ce.p_dip_ce',
        ]);

        $blockedRes = $this->withHeaders([
            'Authorization' => "Bearer {$adminToken}",
        ])->deleteJson("http://deptdelete.test/api/v1/departments/{$dept->id}");

        $blockedRes->assertStatus(Response::HTTP_CONFLICT)
            ->assertHeader('Content-Type', 'application/problem+json')
            ->assertJson([
                'type' => ProblemDetails::type('department-in-use'),
                'title' => 'Conflict',
                'status' => Response::HTTP_CONFLICT,
            ]);

        // 3. Remove program -> department delete succeeds with 200, and then stream delete also succeeds!
        $this->tenantContext->setTenant($tenant);
        $program->delete();

        $successDeptRes = $this->withHeaders([
            'Authorization' => "Bearer {$adminToken}",
        ])->deleteJson("http://deptdelete.test/api/v1/departments/{$dept->id}");

        $successDeptRes->assertStatus(Response::HTTP_OK)
            ->assertJsonPath('data.message', 'Department deleted successfully.');

        $this->tenantContext->setTenant($tenant);
        expect(Department::where('id', $dept->id)->exists())->toBeFalse();

        // Stream now has 0 departments and can be deleted cleanly
        $successStreamRes = $this->withHeaders([
            'Authorization' => "Bearer {$adminToken}",
        ])->deleteJson("http://deptdelete.test/api/v1/streams/{$stream->id}");

        $successStreamRes->assertStatus(Response::HTTP_OK)
            ->assertJsonPath('data.message', 'Stream deleted successfully.');
    } finally {
        $this->tenantContext->forget();
    }
});

<?php

declare(strict_types=1);

namespace Tests\Feature\Organisation;

use App\Core\Http\ProblemDetails;
use App\Core\Tenancy\Services\TenantProvisioner;
use App\Core\Tenancy\TenantContext;
use App\Modules\Identity\Models\Role;
use App\Modules\Identity\Models\RoleAssignment;
use App\Modules\Identity\Models\User;
use App\Modules\Organisation\Database\Seeders\TenantBaselineSeeder;
use App\Modules\Organisation\Models\AcademicYear;
use App\Modules\Organisation\Models\Department;
use App\Modules\Organisation\Models\Stream;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Hash;
use Tests\Feature\Tenancy\TenancyTestHelper;

uses(TenancyTestHelper::class);

beforeEach(function () {
    $this->purgeAllTenantDatabases();
    $this->provisioner = app(TenantProvisioner::class);
    $this->tenantContext = app(TenantContext::class);
});

afterEach(function () {
    Carbon::setTestNow();
    $this->purgeAllTenantDatabases();
});

it('rejects unauthenticated requests and requests from non-super_admin users with 401 and 403', function () {
    config(['app_profile.deploy_profile' => 'cloud']);

    $tenant = $this->provisioner->provision('tenant_setup_auth', 'Setup College', 'setupauth.test', 'cloud');
    $this->tenantContext->setTenant($tenant);
    app(TenantBaselineSeeder::class)->run();

    try {
        $superAdminRole = Role::where('key', 'super_admin')->firstOrFail();
        $lecturerRole = Role::where('key', 'lecturer')->firstOrFail();

        // 1. User with no role assignment
        $noRoleUser = User::create([
            'type' => 'staff',
            'name' => 'No Role User',
            'email' => 'norole@setupauth.test',
            'password' => Hash::make('Password123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);
        $noRoleToken = $noRoleUser->createToken('norole-token')->plainTextToken;

        // 2. User with non-super_admin role at institution scope
        $lecturer = User::create([
            'type' => 'staff',
            'name' => 'Regular Lecturer',
            'email' => 'lecturer@setupauth.test',
            'password' => Hash::make('Password123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);
        RoleAssignment::create([
            'user_id' => $lecturer->id,
            'role_id' => $lecturerRole->id,
            'scope_type' => 'institution',
            'scope_label' => 'inst_root',
            'is_singleton' => false,
            'is_active' => true,
        ]);
        $lecturerToken = $lecturer->createToken('lecturer-token')->plainTextToken;

        // 3. User with super_admin role at department (non-institution) scope
        $deptAdmin = User::create([
            'type' => 'staff',
            'name' => 'Dept SuperAdmin',
            'email' => 'deptadmin@setupauth.test',
            'password' => Hash::make('Password123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);
        RoleAssignment::create([
            'user_id' => $deptAdmin->id,
            'role_id' => $superAdminRole->id,
            'scope_type' => 'department',
            'scope_label' => 'd_ce',
            'is_singleton' => false,
            'is_active' => true,
        ]);
        $deptAdminToken = $deptAdmin->createToken('deptadmin-token')->plainTextToken;

        // 4. Valid super_admin at institution scope, but acting under impersonation
        $instAdmin = User::create([
            'type' => 'staff',
            'name' => 'Inst SuperAdmin',
            'email' => 'instadmin@setupauth.test',
            'password' => Hash::make('Password123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);
        RoleAssignment::create([
            'user_id' => $instAdmin->id,
            'role_id' => $superAdminRole->id,
            'scope_type' => 'institution',
            'scope_label' => 'inst_root',
            'is_singleton' => false,
            'is_active' => true,
        ]);
        $impersonationToken = $instAdmin->createToken(
            name: 'impersonation-token',
            abilities: ['impersonation:read_only'],
            expiresAt: now()->addMinutes(30)
        )->plainTextToken;

        // A. Unauthenticated request -> 401
        $this->app['auth']->forgetGuards();
        $unauthRes = $this->getJson('http://setupauth.test/api/v1/setup/status');
        $unauthRes->assertStatus(401);

        // B. User with no role -> 403
        $this->app['auth']->forgetGuards();
        $noRoleRes = $this->withHeaders([
            'Authorization' => "Bearer {$noRoleToken}",
        ])->getJson('http://setupauth.test/api/v1/setup/status');
        $noRoleRes->assertStatus(403)
            ->assertJson([
                'type' => ProblemDetails::type('forbidden'),
                'title' => 'Forbidden',
                'status' => 403,
            ]);

        // C. Non-super_admin role at institution scope -> 403
        $this->app['auth']->forgetGuards();
        $lecturerRes = $this->withHeaders([
            'Authorization' => "Bearer {$lecturerToken}",
        ])->getJson('http://setupauth.test/api/v1/setup/status');
        $lecturerRes->assertStatus(403)
            ->assertJson([
                'type' => ProblemDetails::type('forbidden'),
                'title' => 'Forbidden',
                'status' => 403,
            ]);

        // D. Super_admin at department (non-institution) scope -> 403
        $this->app['auth']->forgetGuards();
        $deptAdminRes = $this->withHeaders([
            'Authorization' => "Bearer {$deptAdminToken}",
        ])->getJson('http://setupauth.test/api/v1/setup/status');
        $deptAdminRes->assertStatus(403)
            ->assertJson([
                'type' => ProblemDetails::type('forbidden'),
                'title' => 'Forbidden',
                'status' => 403,
            ]);

        // E. Impersonation session attempting to reach setup endpoint -> 403
        $this->app['auth']->forgetGuards();
        $impersonationRes = $this->withHeaders([
            'Authorization' => "Bearer {$impersonationToken}",
        ])->getJson('http://setupauth.test/api/v1/setup/status');
        $impersonationRes->assertStatus(403)
            ->assertJson([
                'type' => ProblemDetails::type('forbidden'),
                'title' => 'Forbidden',
                'status' => 403,
            ]);
    } finally {
        $this->tenantContext->forget();
    }
});

it('rejects unknown setup step with 404', function () {
    config(['app_profile.deploy_profile' => 'cloud']);

    $tenant = $this->provisioner->provision('tenant_setup_unknown', 'Setup College', 'setupunknown.test', 'cloud');
    $this->tenantContext->setTenant($tenant);
    app(TenantBaselineSeeder::class)->run();

    try {
        $superAdmin = User::create([
            'type' => 'staff',
            'name' => 'Super Administrator',
            'email' => 'superadmin@setupunknown.test',
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

        $this->app['auth']->forgetGuards();
        $res = $this->withHeaders([
            'Authorization' => "Bearer {$token}",
        ])->putJson('http://setupunknown.test/api/v1/setup/steps/invalid_step_key', [
            'foo' => 'bar',
        ]);

        $res->assertStatus(404)
            ->assertJson([
                'type' => ProblemDetails::type('not-found'),
                'title' => 'Not Found',
                'status' => 404,
            ]);
    } finally {
        $this->tenantContext->forget();
    }
});

it('validates each schema: accepts valid input and rejects invalid input', function () {
    config(['app_profile.deploy_profile' => 'cloud']);

    $tenant = $this->provisioner->provision('tenant_setup_validation', 'Setup College', 'setupval.test', 'cloud');
    $this->tenantContext->setTenant($tenant);
    app(TenantBaselineSeeder::class)->run();

    try {
        $superAdmin = User::create([
            'type' => 'staff',
            'name' => 'Super Administrator',
            'email' => 'superadmin@setupval.test',
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

        // A. institution_profile schema validation
        // A1. Missing required short_code
        $this->app['auth']->forgetGuards();
        $res = $this->withHeaders(['Authorization' => "Bearer {$token}"])
            ->putJson('http://setupval.test/api/v1/setup/steps/institution_profile', [
                'name' => 'Carmel Polytechnic College',
            ]);
        $res->assertStatus(422);

        // A2. Invalid email pattern
        $this->app['auth']->forgetGuards();
        $res = $this->withHeaders(['Authorization' => "Bearer {$token}"])
            ->putJson('http://setupval.test/api/v1/setup/steps/institution_profile', [
                'name' => 'Carmel Polytechnic College',
                'short_code' => 'CPC',
                'contact_email' => 'not-an-email',
            ]);
        $res->assertStatus(422);

        // A3. Valid institution_profile
        $this->app['auth']->forgetGuards();
        $res = $this->withHeaders(['Authorization' => "Bearer {$token}"])
            ->putJson('http://setupval.test/api/v1/setup/steps/institution_profile', [
                'name' => 'Carmel Polytechnic College',
                'short_code' => 'CPC',
                'board' => 'State Board of Technical Education',
                'board_code' => 'SBTE',
                'contact_email' => 'info@carmelpoly.in',
                'contact_phone' => '04772261234',
                'city' => 'Alappuzha',
                'state' => 'Kerala',
                'postal_code' => '688004',
                'website' => 'https://carmelpoly.in',
            ]);
        $res->assertStatus(200)
            ->assertJsonPath('data.steps.institution_profile.is_completed', true)
            ->assertJsonPath('data.steps.institution_profile.settings_exist', true);

        // B. calendar_basics schema validation
        // B1. Mismatched periods count (periods_per_day = 6, but only 2 provided)
        $this->app['auth']->forgetGuards();
        $res = $this->withHeaders(['Authorization' => "Bearer {$token}"])
            ->putJson('http://setupval.test/api/v1/setup/steps/calendar_basics', [
                'working_days' => ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
                'periods_per_day' => 6,
                'periods' => [
                    ['index' => 1, 'start' => '09:00', 'end' => '09:50'],
                    ['index' => 2, 'start' => '09:50', 'end' => '10:40'],
                ],
                'day_order_format' => 'roman',
            ]);
        $res->assertStatus(422);

        // B2. Overlapping periods (09:00-10:00 and 09:30-10:30)
        $this->app['auth']->forgetGuards();
        $res = $this->withHeaders(['Authorization' => "Bearer {$token}"])
            ->putJson('http://setupval.test/api/v1/setup/steps/calendar_basics', [
                'working_days' => ['Monday', 'Tuesday', 'Wednesday'],
                'periods_per_day' => 2,
                'periods' => [
                    ['index' => 1, 'start' => '09:00', 'end' => '10:00'],
                    ['index' => 2, 'start' => '09:30', 'end' => '10:30'],
                ],
                'day_order_format' => 'numeric',
            ]);
        $res->assertStatus(422);

        // B3. Start time after end time (10:00 to 09:00)
        $this->app['auth']->forgetGuards();
        $res = $this->withHeaders(['Authorization' => "Bearer {$token}"])
            ->putJson('http://setupval.test/api/v1/setup/steps/calendar_basics', [
                'working_days' => ['Monday', 'Tuesday'],
                'periods_per_day' => 1,
                'periods' => [
                    ['index' => 1, 'start' => '10:00', 'end' => '09:00'],
                ],
                'day_order_format' => 'alpha',
            ]);
        $res->assertStatus(422);

        // B4. Invalid day order format enum
        $this->app['auth']->forgetGuards();
        $res = $this->withHeaders(['Authorization' => "Bearer {$token}"])
            ->putJson('http://setupval.test/api/v1/setup/steps/calendar_basics', [
                'working_days' => ['Monday'],
                'periods_per_day' => 1,
                'periods' => [
                    ['index' => 1, 'start' => '09:00', 'end' => '10:00'],
                ],
                'day_order_format' => 'invalid_enum',
            ]);
        $res->assertStatus(422);

        // B5. Valid calendar_basics
        $this->app['auth']->forgetGuards();
        $res = $this->withHeaders(['Authorization' => "Bearer {$token}"])
            ->putJson('http://setupval.test/api/v1/setup/steps/calendar_basics', [
                'working_days' => ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
                'periods_per_day' => 3,
                'periods' => [
                    ['index' => 1, 'start' => '09:00', 'end' => '09:50'],
                    ['index' => 2, 'start' => '10:00', 'end' => '10:50'],
                    ['index' => 3, 'start' => '11:00', 'end' => '11:50'],
                ],
                'day_order_format' => 'roman',
            ]);
        $res->assertStatus(200)
            ->assertJsonPath('data.steps.calendar_basics.is_completed', true);

        // C. signup_policy schema validation
        // C1. Invalid approval_mode
        $this->app['auth']->forgetGuards();
        $res = $this->withHeaders(['Authorization' => "Bearer {$token}"])
            ->putJson('http://setupval.test/api/v1/setup/steps/signup_policy', [
                'student_self_registration_enabled' => false,
                'parent_self_registration_enabled' => false,
                'approval_mode' => 'invalid_mode',
            ]);
        $res->assertStatus(422);

        // C2. Valid signup_policy
        $this->app['auth']->forgetGuards();
        $res = $this->withHeaders(['Authorization' => "Bearer {$token}"])
            ->putJson('http://setupval.test/api/v1/setup/steps/signup_policy', [
                'student_self_registration_enabled' => false,
                'parent_self_registration_enabled' => false,
                'approval_mode' => 'manual',
            ]);
        $res->assertStatus(200)
            ->assertJsonPath('data.steps.signup_policy.is_completed', true);
    } finally {
        $this->tenantContext->forget();
    }
});

it('lists missing prerequisites when complete is called prematurely, completes cleanly when met, rejects repetition, and keeps completed_at intact on step re-save', function () {
    config(['app_profile.deploy_profile' => 'cloud']);

    $tenant = $this->provisioner->provision('tenant_setup_flow', 'Setup Flow College', 'setupflow.test', 'cloud');
    $this->tenantContext->setTenant($tenant);
    app(TenantBaselineSeeder::class)->run();

    try {
        $superAdmin = User::create([
            'type' => 'staff',
            'name' => 'Super Administrator',
            'email' => 'superadmin@setupflow.test',
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

        // 1. Initial status shows all incomplete and 0 prerequisites
        $this->app['auth']->forgetGuards();
        $statusRes = $this->withHeaders(['Authorization' => "Bearer {$token}"])
            ->getJson('http://setupflow.test/api/v1/setup/status');
        $statusRes->assertStatus(200)
            ->assertJsonPath('data.is_completed', false)
            ->assertJsonPath('data.steps.institution_profile.is_completed', false)
            ->assertJsonPath('data.prerequisites.streams_count', 0)
            ->assertJsonPath('data.prerequisites.departments_count', 0)
            ->assertJsonPath('data.prerequisites.academic_years_count', 0);

        // 2. Call complete prematurely -> 422 listing missing prerequisites
        $this->app['auth']->forgetGuards();
        $completeRes = $this->withHeaders(['Authorization' => "Bearer {$token}"])
            ->postJson('http://setupflow.test/api/v1/setup/complete');

        $completeRes->assertStatus(422)
            ->assertJson([
                'type' => ProblemDetails::type('setup-prerequisites-missing'),
                'title' => 'Unprocessable Content',
                'status' => 422,
            ]);
        $missing = $completeRes->json('errors.missing');
        expect($missing)->toBeArray()
            ->and($missing)->toContain('Setup step [institution_profile] is not completed.')
            ->and($missing)->toContain('Setup step [calendar_basics] is not completed.')
            ->and($missing)->toContain('Setup step [signup_policy] is not completed.')
            ->and($missing)->toContain('At least one stream must exist.')
            ->and($missing)->toContain('At least one department must exist.')
            ->and($missing)->toContain('At least one academic year must exist.');

        // 3. Complete all 3 steps
        $this->app['auth']->forgetGuards();
        $step1Res = $this->withHeaders(['Authorization' => "Bearer {$token}"])
            ->putJson('http://setupflow.test/api/v1/setup/steps/institution_profile', [
                'name' => 'Carmel Polytechnic College',
                'short_code' => 'CPC',
            ]);
        $step1Res->assertStatus(200);
        $initialStepCompletedAt = $step1Res->json('data.steps.institution_profile.completed_at');
        expect($initialStepCompletedAt)->not->toBeNull();

        $this->app['auth']->forgetGuards();
        $this->withHeaders(['Authorization' => "Bearer {$token}"])
            ->putJson('http://setupflow.test/api/v1/setup/steps/calendar_basics', [
                'working_days' => ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
                'periods_per_day' => 1,
                'periods' => [
                    ['index' => 1, 'start' => '09:00', 'end' => '10:00'],
                ],
                'day_order_format' => 'numeric',
            ])->assertStatus(200);

        $this->app['auth']->forgetGuards();
        $this->withHeaders(['Authorization' => "Bearer {$token}"])
            ->putJson('http://setupflow.test/api/v1/setup/steps/signup_policy', [
                'student_self_registration_enabled' => false,
                'parent_self_registration_enabled' => false,
                'approval_mode' => 'manual',
            ])->assertStatus(200);

        // 4. Create structural prerequisites (Stream, Department, AcademicYear)
        $this->tenantContext->setTenant($tenant);
        $stream = Stream::create([
            'code' => 'AIDED',
            'name' => 'Aided Stream',
            'scope_label' => 's_aided',
        ]);
        Department::create([
            'code' => 'CE',
            'name' => 'Civil Engineering',
            'stream_id' => $stream->id,
            'kind' => 'academic',
            'scope_label' => 'd_ce',
            'home_path' => 'inst_root.d_ce',
            'managing_path' => 'inst_root.d_ce',
        ]);
        AcademicYear::create([
            'label' => '2026-2027',
            'start_date' => '2026-06-01',
            'end_date' => '2027-03-31',
            'is_current' => true,
        ]);

        // 5. Complete now succeeds
        $this->app['auth']->forgetGuards();
        $completeSuccess = $this->withHeaders(['Authorization' => "Bearer {$token}"])
            ->postJson('http://setupflow.test/api/v1/setup/complete');

        $completeSuccess->assertStatus(200)
            ->assertJsonPath('data.is_completed', true);

        $completedAt = $completeSuccess->json('data.completed_at');
        expect($completedAt)->not->toBeNull();

        // 6. Calling complete a second time returns 409 Conflict
        $this->app['auth']->forgetGuards();
        $secondComplete = $this->withHeaders(['Authorization' => "Bearer {$token}"])
            ->postJson('http://setupflow.test/api/v1/setup/complete');

        $secondComplete->assertStatus(409)
            ->assertJson([
                'type' => ProblemDetails::type('setup-already-completed'),
                'title' => 'Conflict',
                'status' => 409,
            ]);

        // 7. Re-saving an earlier step keeps completed_at of the setup state AND the step itself intact
        Carbon::setTestNow(now()->addHour());

        $this->app['auth']->forgetGuards();
        $resaveRes = $this->withHeaders(['Authorization' => "Bearer {$token}"])
            ->putJson('http://setupflow.test/api/v1/setup/steps/institution_profile', [
                'name' => 'Carmel Polytechnic College (Updated)',
                'short_code' => 'CPC',
            ]);

        $resaveRes->assertStatus(200)
            ->assertJsonPath('data.is_completed', true)
            ->assertJsonPath('data.completed_at', $completedAt)
            ->assertJsonPath('data.steps.institution_profile.completed_at', $initialStepCompletedAt);

        Carbon::setTestNow();
    } finally {
        $this->tenantContext->forget();
    }
});

<?php

declare(strict_types=1);

use App\Core\Tenancy\Services\TenantProvisioner;
use App\Core\Tenancy\TenantContext;
use App\Modules\Identity\Actions\DeactivateUserAction;
use App\Modules\Identity\Database\Seeders\RbacBaselineSeeder;
use App\Modules\Identity\Exceptions\UserLifecycleConflictException;
use App\Modules\Identity\Models\Role;
use App\Modules\Identity\Models\RoleAssignment;
use App\Modules\Identity\Models\User;
use App\Modules\Identity\Services\RoleAuthorityRank;
use App\Modules\Organisation\Database\Seeders\KeralaPolytechnicProfileSeeder;
use App\Modules\Organisation\Models\Department;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Tests\Feature\Tenancy\TenancyTestHelper;

uses(TenancyTestHelper::class);

beforeEach(function () {
    $this->purgeAllTenantDatabases();
    $this->provisioner = app(TenantProvisioner::class);
    $this->tenantContext = app(TenantContext::class);

    $this->tenant = $this->provisioner->provision('tenant_life_test', 'Lifecycle College', 'lifecycle.test', 'cloud');
    $this->tenantContext->setTenant($this->tenant);

    app(RbacBaselineSeeder::class)->run();
    app(KeralaPolytechnicProfileSeeder::class)->run();

    $this->ceDept = Department::where('code', 'CE')->firstOrFail();
    $this->meDept = Department::where('code', 'ME')->firstOrFail();

    $this->superAdmin = User::create([
        'type' => 'staff',
        'name' => 'IT Head',
        'email' => 'it@lifecycle.test',
        'password' => 'Secret@123!',
        'must_change_password' => false,
        'status' => 'active',
    ]);
    RoleAssignment::create([
        'user_id' => $this->superAdmin->id,
        'role_id' => Role::where('key', 'super_admin')->firstOrFail()->id,
        'scope_type' => 'institution',
        'scope_id' => null,
        'scope_label' => 'i_carmel',
        'valid_from' => Carbon::now()->subDay(),
        'is_active' => true,
    ]);

    $this->principal = User::create([
        'type' => 'staff',
        'name' => 'College Principal',
        'email' => 'principal@lifecycle.test',
        'password' => 'Secret@123!',
        'must_change_password' => false,
        'status' => 'active',
    ]);
    RoleAssignment::create([
        'user_id' => $this->principal->id,
        'role_id' => Role::where('key', 'principal')->firstOrFail()->id,
        'scope_type' => 'institution',
        'scope_id' => null,
        'scope_label' => 'i_carmel',
        'valid_from' => Carbon::now()->subDay(),
        'is_active' => true,
    ]);

    $this->ceHod = User::create([
        'type' => 'staff',
        'name' => 'CE HOD',
        'email' => 'hod.ce@lifecycle.test',
        'password' => 'Secret@123!',
        'must_change_password' => false,
        'status' => 'active',
    ]);
    RoleAssignment::create([
        'user_id' => $this->ceHod->id,
        'role_id' => Role::where('key', 'hod')->firstOrFail()->id,
        'scope_type' => 'department',
        'scope_id' => $this->ceDept->id,
        'scope_label' => $this->ceDept->scope_label,
        'valid_from' => Carbon::now()->subDay(),
        'is_active' => true,
    ]);

    $this->meLecturer = User::create([
        'type' => 'staff',
        'name' => 'ME Lecturer',
        'email' => 'lec.me@lifecycle.test',
        'password' => 'Secret@123!',
        'must_change_password' => false,
        'status' => 'active',
    ]);
    RoleAssignment::create([
        'user_id' => $this->meLecturer->id,
        'role_id' => Role::where('key', 'lecturer')->firstOrFail()->id,
        'scope_type' => 'department',
        'scope_id' => $this->meDept->id,
        'scope_label' => $this->meDept->scope_label,
        'valid_from' => Carbon::now()->subDay(),
        'is_active' => true,
    ]);

    $this->student = User::create([
        'type' => 'student',
        'name' => 'CE Student',
        'email' => 'student@lifecycle.test',
        'password' => 'Secret@123!',
        'must_change_password' => false,
        'status' => 'active',
    ]);
    RoleAssignment::create([
        'user_id' => $this->student->id,
        'role_id' => Role::where('key', 'student')->firstOrFail()->id,
        'scope_type' => 'department',
        'scope_id' => $this->ceDept->id,
        'scope_label' => $this->ceDept->scope_label,
        'valid_from' => Carbon::now()->subDay(),
        'is_active' => true,
    ]);
});

afterEach(function () {
    $this->tenantContext->forget();
    $this->purgeAllTenantDatabases();
});

describe('Principal User Lifecycle & Policy Matrix', function () {
    it('enforces UserPolicy authority rank and scope across actors and targets and exposes abilities on UserResource', function () {
        $rank = app(RoleAuthorityRank::class);

        $unassigned = User::create([
            'type' => 'staff',
            'name' => 'Pending Staff',
            'email' => 'pending@lifecycle.test',
            'password' => 'Secret@123!',
            'must_change_password' => false,
            'status' => 'pending',
        ]);
        expect($rank->highestActiveRank($unassigned))->toBe(0);

        $principalGate = Gate::forUser($this->principal);
        expect($principalGate->allows('update', $this->principal))->toBeFalse()
            ->and($principalGate->allows('suspend', $this->principal))->toBeFalse()
            ->and($principalGate->allows('deactivate', $this->principal))->toBeFalse()
            ->and($principalGate->allows('suspend', $this->superAdmin))->toBeFalse()
            ->and($principalGate->allows('deactivate', $this->superAdmin))->toBeFalse()
            ->and($principalGate->allows('resetPassword', $this->superAdmin))->toBeFalse()
            ->and($principalGate->allows('unlock', $this->superAdmin))->toBeFalse()
            ->and($principalGate->allows('update', $this->superAdmin))->toBeFalse()
            ->and($principalGate->allows('suspend', $this->ceHod))->toBeTrue()
            ->and($principalGate->allows('deactivate', $this->ceHod))->toBeTrue()
            ->and($principalGate->allows('resetPassword', $this->meLecturer))->toBeTrue()
            ->and($principalGate->allows('approve', $unassigned))->toBeTrue()
            ->and($principalGate->allows('reject', $unassigned))->toBeTrue();

        $hodGate = Gate::forUser($this->ceHod);
        expect($hodGate->allows('suspend', $this->principal))->toBeFalse()
            ->and($hodGate->allows('suspend', $this->ceHod))->toBeFalse()
            ->and($hodGate->allows('suspend', $this->meLecturer))->toBeFalse()
            ->and($hodGate->allows('suspend', $unassigned))->toBeFalse();

        $lecturerGate = Gate::forUser($this->meLecturer);
        expect($lecturerGate->allows('suspend', $this->student))->toBeFalse()
            ->and($lecturerGate->allows('approve', $unassigned))->toBeFalse();

        // HTTP verification: Principal cannot act on self or superAdmin, can view them with abilities=false
        $pToken = $this->principal->createToken('p_tok')->plainTextToken;
        $listRes = $this->withHeaders([
            'Authorization' => "Bearer {$pToken}",
            'X-Tenant' => 'tenant_life_test',
        ])->getJson('http://lifecycle.test/api/v1/users');

        $listRes->assertOk();
        $saRow = collect($listRes->json('data'))->firstWhere('id', $this->superAdmin->id);
        $hodRow = collect($listRes->json('data'))->firstWhere('id', $this->ceHod->id);

        expect($saRow['abilities'])->toBe([
            'update' => false,
            'suspend' => false,
            'reactivate' => false,
            'deactivate' => false,
            'reset_password' => false,
            'unlock' => false,
            'approve' => false,
            'reject' => false,
        ]);
        expect($hodRow['abilities']['suspend'])->toBeTrue()
            ->and($hodRow['abilities']['deactivate'])->toBeTrue();

        // Direct HTTP 403 checks on self and superAdmin
        $this->withHeaders([
            'Authorization' => "Bearer {$pToken}",
            'X-Tenant' => 'tenant_life_test',
        ])->postJson("http://lifecycle.test/api/v1/users/{$this->superAdmin->id}/suspend")
            ->assertForbidden();

        $this->withHeaders([
            'Authorization' => "Bearer {$pToken}",
            'X-Tenant' => 'tenant_life_test',
        ])->postJson("http://lifecycle.test/api/v1/users/{$this->principal->id}/deactivate", [
            'reason' => 'Self deactivation attempt',
        ])->assertForbidden();

        $this->withHeaders([
            'Authorization' => "Bearer {$pToken}",
            'X-Tenant' => 'tenant_life_test',
        ])->putJson("http://lifecycle.test/api/v1/users/{$this->principal->id}", [
            'name' => 'Self Edit',
        ])->assertForbidden();
    });

    it('shows zero-assignment users to institution-scoped callers but hides them from department-scoped callers', function () {
        $pending = User::create([
            'type' => 'staff',
            'name' => 'Unassigned Pending',
            'email' => 'unassigned@lifecycle.test',
            'password' => 'Secret@123!',
            'must_change_password' => false,
            'status' => 'pending',
        ]);

        $pToken = $this->principal->createToken('p_tok')->plainTextToken;
        $this->tenantContext->setTenant($this->tenant);
        $hodToken = $this->ceHod->createToken('hod_tok')->plainTextToken;

        $pIds = collect($this->withHeaders([
            'Authorization' => "Bearer {$pToken}",
            'X-Tenant' => 'tenant_life_test',
        ])->getJson('http://lifecycle.test/api/v1/users')->assertOk()->json('data'))->pluck('id')->all();

        $this->app['auth']->forgetGuards();
        $hodIds = collect($this->withHeaders([
            'Authorization' => "Bearer {$hodToken}",
            'X-Tenant' => 'tenant_life_test',
        ])->getJson('http://lifecycle.test/api/v1/users')->assertOk()->json('data'))->pluck('id')->all();

        expect($pIds)->toContain($pending->id)
            ->and($hodIds)->not->toContain($pending->id);

        // GET /users/{id} on zero-assignment user: 200 for Principal, 403 for HOD
        $this->app['auth']->forgetGuards();
        $this->withHeaders([
            'Authorization' => "Bearer {$pToken}",
            'X-Tenant' => 'tenant_life_test',
        ])->getJson("http://lifecycle.test/api/v1/users/{$pending->id}")->assertOk();

        $this->app['auth']->forgetGuards();
        $this->withHeaders([
            'Authorization' => "Bearer {$hodToken}",
            'X-Tenant' => 'tenant_life_test',
        ])->getJson("http://lifecycle.test/api/v1/users/{$pending->id}")->assertForbidden();
    });

    it('lets Principal create active users with one-time temp password and no-store header without logging secrets', function () {
        $pToken = $this->principal->createToken('p_tok')->plainTextToken;

        $res = $this->withHeaders([
            'Authorization' => "Bearer {$pToken}",
            'X-Tenant' => 'tenant_life_test',
        ])->postJson('http://lifecycle.test/api/v1/users', [
            'type' => 'staff',
            'name' => 'New Faculty',
            'email' => 'faculty@lifecycle.test',
        ]);

        $res->assertCreated()
            ->assertHeader('Cache-Control', 'no-store, private');

        $tempPw = $res->json('data.temporary_password');
        expect($tempPw)->toBeString()->not->toBeEmpty()
            ->and($res->json('data.status'))->toBe('active')
            ->and($res->json('data.must_change_password'))->toBeTrue()
            ->and($res->json('data.assignments'))->toBe([]);

        $this->tenantContext->setTenant($this->tenant);
        $log = DB::connection('tenant')->table('activity_log')
            ->where('event', 'user.created')
            ->latest('id')
            ->first();
        expect($log)->not->toBeNull()
            ->and($log->properties)->not->toContain($tempPw);
    });

    it('enforces full status transitions for approve, reject, suspend, reactivate, and deactivate', function () {
        $pToken = $this->principal->createToken('p_tok')->plainTextToken;

        $pendingApprove = User::create([
            'type' => 'staff',
            'name' => 'Pending One',
            'email' => 'pending1@lifecycle.test',
            'password' => 'Secret@123!',
            'must_change_password' => false,
            'status' => 'pending',
        ]);

        $pendingReject = User::create([
            'type' => 'staff',
            'name' => 'Pending Two',
            'email' => 'pending2@lifecycle.test',
            'password' => 'Secret@123!',
            'must_change_password' => false,
            'status' => 'pending',
        ]);

        // Pending user cannot log in before approval
        $this->withHeaders(['X-Tenant' => 'tenant_life_test'])
            ->postJson('http://lifecycle.test/api/v1/auth/login', [
                'identifier' => 'pending1@lifecycle.test',
                'password' => 'Secret@123!',
                'device_name' => 'web',
                'client' => 'web',
            ])->assertUnauthorized();

        // Approve pending -> active (can now log in; approving again returns 409)
        $this->withHeaders([
            'Authorization' => "Bearer {$pToken}",
            'X-Tenant' => 'tenant_life_test',
        ])->postJson("http://lifecycle.test/api/v1/users/{$pendingApprove->id}/approve")
            ->assertOk()
            ->assertJsonPath('data.status', 'active');

        $this->withHeaders([
            'Authorization' => "Bearer {$pToken}",
            'X-Tenant' => 'tenant_life_test',
        ])->postJson("http://lifecycle.test/api/v1/users/{$pendingApprove->id}/approve")
            ->assertStatus(409);

        $this->withHeaders(['X-Tenant' => 'tenant_life_test'])
            ->postJson('http://lifecycle.test/api/v1/auth/login', [
                'identifier' => 'pending1@lifecycle.test',
                'password' => 'Secret@123!',
                'device_name' => 'web',
                'client' => 'web',
            ])->assertOk();

        // Reject pending -> rejected (cannot be reactivated by Principal)
        $this->withHeaders([
            'Authorization' => "Bearer {$pToken}",
            'X-Tenant' => 'tenant_life_test',
        ])->postJson("http://lifecycle.test/api/v1/users/{$pendingReject->id}/reject", [
            'reason' => 'Not an employee of this college',
        ])->assertOk()
            ->assertJsonPath('data.status', 'rejected');

        $this->withHeaders([
            'Authorization' => "Bearer {$pToken}",
            'X-Tenant' => 'tenant_life_test',
        ])->postJson("http://lifecycle.test/api/v1/users/{$pendingReject->id}/reactivate")
            ->assertStatus(409);

        // Suspend -> Reactivate -> Deactivate -> Reactivate (restores status only; assignments stay ended)
        $this->tenantContext->setTenant($this->tenant);
        $lecToken = $this->meLecturer->createToken('lec_tok')->plainTextToken;
        $this->withHeaders([
            'Authorization' => "Bearer {$pToken}",
            'X-Tenant' => 'tenant_life_test',
        ])->postJson("http://lifecycle.test/api/v1/users/{$this->meLecturer->id}/suspend")
            ->assertOk()
            ->assertJsonPath('data.status', 'suspended');

        // Suspending again -> 409
        $this->withHeaders([
            'Authorization' => "Bearer {$pToken}",
            'X-Tenant' => 'tenant_life_test',
        ])->postJson("http://lifecycle.test/api/v1/users/{$this->meLecturer->id}/suspend")
            ->assertStatus(409);

        // Revoked token cannot access /me
        $this->app['auth']->forgetGuards();
        $this->withHeaders([
            'Authorization' => "Bearer {$lecToken}",
            'X-Tenant' => 'tenant_life_test',
        ])->getJson('http://lifecycle.test/api/v1/me')->assertUnauthorized();

        $this->app['auth']->forgetGuards();
        $this->withHeaders([
            'Authorization' => "Bearer {$pToken}",
            'X-Tenant' => 'tenant_life_test',
        ])->postJson("http://lifecycle.test/api/v1/users/{$this->meLecturer->id}/reactivate")
            ->assertOk()
            ->assertJsonPath('data.status', 'active');

        // Deactivate CE HOD: validates reason, revokes tokens, ends HOD assignment, frees singleton slot
        $this->withHeaders([
            'Authorization' => "Bearer {$pToken}",
            'X-Tenant' => 'tenant_life_test',
        ])->postJson("http://lifecycle.test/api/v1/users/{$this->ceHod->id}/deactivate", [
            'reason' => 'No',
        ])->assertStatus(422);

        $this->tenantContext->setTenant($this->tenant);
        $hodToken = $this->ceHod->createToken('hod_tok')->plainTextToken;
        $this->withHeaders([
            'Authorization' => "Bearer {$pToken}",
            'X-Tenant' => 'tenant_life_test',
        ])->postJson("http://lifecycle.test/api/v1/users/{$this->ceHod->id}/deactivate", [
            'reason' => 'Transferred to another institution',
        ])->assertOk()
            ->assertJsonPath('data.status', 'deactivated')
            ->assertJsonPath('data.assignments', []);

        $this->app['auth']->forgetGuards();
        $this->withHeaders([
            'Authorization' => "Bearer {$hodToken}",
            'X-Tenant' => 'tenant_life_test',
        ])->getJson('http://lifecycle.test/api/v1/me')->assertUnauthorized();

        // Assignment history preserved with is_active=false
        $this->tenantContext->setTenant($this->tenant);
        $endedAssignment = RoleAssignment::where('user_id', $this->ceHod->id)->firstOrFail();
        expect($endedAssignment->is_active)->toBeFalse()
            ->and($endedAssignment->valid_to)->not->toBeNull()
            ->and($endedAssignment->reason)->toBe('Transferred to another institution');

        // Reactivating deactivated user restores status only; assignments remain ended
        $this->app['auth']->forgetGuards();
        $this->withHeaders([
            'Authorization' => "Bearer {$pToken}",
            'X-Tenant' => 'tenant_life_test',
        ])->postJson("http://lifecycle.test/api/v1/users/{$this->ceHod->id}/reactivate")
            ->assertOk()
            ->assertJsonPath('data.status', 'active');

        $this->tenantContext->setTenant($this->tenant);
        expect(RoleAssignment::where('user_id', $this->ceHod->id)->active()->count())->toBe(0);

        // Audit log for user.deactivated contains scope_path and department_id
        $deactLog = DB::connection('tenant')->table('activity_log')
            ->where('event', 'user.deactivated')
            ->latest('id')
            ->first();
        expect($deactLog)->not->toBeNull();
        $props = json_decode((string) $deactLog->properties, true);
        expect($props['department_id'])->toBe($this->ceDept->id)
            ->and($props['scope_path'])->toContain($this->ceDept->scope_label);
    });

    it('prevents deactivating the last active Super Admin', function () {
        $secondSa = User::create([
            'type' => 'staff',
            'name' => 'Second SA',
            'email' => 'sa2@lifecycle.test',
            'password' => 'Secret@123!',
            'must_change_password' => false,
            'status' => 'active',
        ]);
        RoleAssignment::create([
            'user_id' => $secondSa->id,
            'role_id' => Role::where('key', 'super_admin')->firstOrFail()->id,
            'scope_type' => 'institution',
            'scope_id' => null,
            'scope_label' => 'i_carmel',
            'valid_from' => Carbon::now()->subDay(),
            'is_active' => true,
        ]);

        // Even if a lower-rank check were bypassed, UserPolicy blocks equal-rank super_admin->super_admin;
        // verify DeactivateUserAction directly refuses last super_admin.
        $action = app(DeactivateUserAction::class);
        $action->execute($secondSa, $this->superAdmin, 'Removing first super admin');

        expect(fn () => $action->execute($this->superAdmin, $secondSa, 'Removing last super admin'))
            ->toThrow(UserLifecycleConflictException::class);
    });

    it('filters GET /users by role_key and department_id and restricts Principal to read-only departments/governance-rules', function () {
        $pToken = $this->principal->createToken('p_tok')->plainTextToken;

        $byRole = $this->withHeaders([
            'Authorization' => "Bearer {$pToken}",
            'X-Tenant' => 'tenant_life_test',
        ])->getJson('http://lifecycle.test/api/v1/users?role_key=hod')->assertOk();

        expect(collect($byRole->json('data'))->pluck('id')->all())->toBe([$this->ceHod->id]);

        $byDept = $this->withHeaders([
            'Authorization' => "Bearer {$pToken}",
            'X-Tenant' => 'tenant_life_test',
        ])->getJson("http://lifecycle.test/api/v1/users?department_id={$this->meDept->id}")->assertOk();

        expect(collect($byDept->json('data'))->pluck('id')->all())->toBe([$this->meLecturer->id]);

        // Principal can read governance-rules and departments, but cannot manage departments
        $this->withHeaders([
            'Authorization' => "Bearer {$pToken}",
            'X-Tenant' => 'tenant_life_test',
        ])->getJson('http://lifecycle.test/api/v1/governance-rules')->assertOk();

        $this->withHeaders([
            'Authorization' => "Bearer {$pToken}",
            'X-Tenant' => 'tenant_life_test',
        ])->postJson('http://lifecycle.test/api/v1/departments', [
            'name' => 'Blocked Dept',
            'code' => 'BLK',
            'stream_id' => $this->ceDept->stream_id,
        ])->assertForbidden();

        $this->withHeaders([
            'Authorization' => "Bearer {$pToken}",
            'X-Tenant' => 'tenant_life_test',
        ])->putJson("http://lifecycle.test/api/v1/departments/{$this->ceDept->id}", [
            'name' => 'Renamed Dept',
        ])->assertForbidden();

        $this->withHeaders([
            'Authorization' => "Bearer {$pToken}",
            'X-Tenant' => 'tenant_life_test',
        ])->deleteJson("http://lifecycle.test/api/v1/departments/{$this->ceDept->id}")
            ->assertForbidden();
    });

    it('keeps GET /users query count O(1) across 50 users when computing UserResource abilities', function () {
        $this->tenantContext->setTenant($this->tenant);
        for ($i = 0; $i < 50; $i++) {
            User::create([
                'type' => 'staff',
                'name' => "Bulk Staff {$i}",
                'email' => "bulk{$i}@lifecycle.test",
                'password' => 'Secret@123!',
                'must_change_password' => false,
                'status' => 'active',
            ]);
        }

        $pToken = $this->principal->createToken('p_bulk')->plainTextToken;

        DB::connection('tenant')->flushQueryLog();
        DB::connection('tenant')->enableQueryLog();

        $res = $this->withHeaders([
            'Authorization' => "Bearer {$pToken}",
            'X-Tenant' => 'tenant_life_test',
        ])->getJson('http://lifecycle.test/api/v1/users?per_page=50')->assertOk();

        $queries = DB::connection('tenant')->getQueryLog();
        DB::connection('tenant')->disableQueryLog();

        expect($res->json('data'))->toHaveCount(50)
            ->and(count($queries))->toBeLessThanOrEqual(12);
    });
});

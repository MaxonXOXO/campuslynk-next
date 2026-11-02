<?php

declare(strict_types=1);

namespace Tests\Feature\Identity;

use App\Core\Tenancy\Services\TenantProvisioner;
use App\Core\Tenancy\TenantContext;
use App\Modules\Identity\Actions\AssignRoleAction;
use App\Modules\Identity\Actions\RevokeRoleAction;
use App\Modules\Identity\Commands\PermissionsSyncCommand;
use App\Modules\Identity\Database\Seeders\RbacBaselineSeeder;
use App\Modules\Identity\Exceptions\SingletonRoleConflictException;
use App\Modules\Identity\Exceptions\UnauthorizedDelegationException;
use App\Modules\Identity\Models\Activity;
use App\Modules\Identity\Models\Role;
use App\Modules\Identity\Models\RoleAssignment;
use App\Modules\Identity\Models\User;
use App\Modules\Identity\Services\ScopeAuthorizer;
use App\Modules\Organisation\Actions\CreateBatchAction;
use App\Modules\Organisation\Actions\PromoteBatchSemesterAction;
use App\Modules\Organisation\Database\Seeders\KeralaPolytechnicProfileSeeder;
use App\Modules\Organisation\Models\AcademicYear;
use App\Modules\Organisation\Models\Batch;
use App\Modules\Organisation\Models\Department;
use App\Modules\Organisation\Models\Program;
use App\Modules\Organisation\Models\Regulation;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use InvalidArgumentException;
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

it('seeds 21 tenant roles and delegation rules cleanly', function () {
    config(['app_profile.deploy_profile' => 'cloud']);

    $tenant = $this->provisioner->provision('tenant_rbac_seed', 'RBAC Poly', 'rbac.test', 'cloud');
    $this->tenantContext->setTenant($tenant);

    try {
        app(RbacBaselineSeeder::class)->run();

        expect(Role::count())->toBe(21);

        $singletons = Role::whereRaw('is_singleton is true')->pluck('key')->all();
        expect($singletons)->toEqualCanonicalizing([
            'principal',
            'academic_coordinator',
            'gen_dept_coordinator',
            'hod',
            'workshop_superintendent',
            'tutor',
        ]);

        $nonSingletons = Role::whereRaw('is_singleton is false')->pluck('key')->all();
        expect($nonSingletons)->toContain('super_admin')
            ->toContain('lecturer')
            ->toContain('mentor')
            ->toContain('course_teacher')
            ->toContain('student')
            ->toContain('parent');
    } finally {
        $this->tenantContext->forget();
    }
});

it('syncs permissions and maps them to roles via permissions:sync command', function () {
    config(['app_profile.deploy_profile' => 'cloud']);

    $tenant = $this->provisioner->provision('tenant_perm_sync', 'Perm Poly', 'perm.test', 'cloud');
    $this->tenantContext->setTenant($tenant);

    try {
        app(RbacBaselineSeeder::class)->run();
        app(PermissionsSyncCommand::class)->syncCurrentTenant();

        $superAdminRole = Role::where('key', 'super_admin')->firstOrFail();
        $hodRole = Role::where('key', 'hod')->firstOrFail();

        $superAdminPerms = $superAdminRole->permissions()->pluck('key')->all();
        expect($superAdminPerms)->toContain('identity.user.view')
            ->toContain('identity.user.create')
            ->toContain('identity.role.assign')
            ->toContain('organisation.batch.view');

        $hodPerms = $hodRole->permissions()->pluck('key')->all();
        expect($hodPerms)->toContain('organisation.batch.create')
            ->toContain('organisation.batch.promote_semester')
            ->toContain('organisation.batch.assign_tutor');
    } finally {
        $this->tenantContext->forget();
    }
});

it('enforces btree_gist singleton exclusion constraint preventing two active HODs for the same department', function () {
    config(['app_profile.deploy_profile' => 'cloud']);

    $tenant = $this->provisioner->provision('tenant_singleton', 'Single Poly', 'single.test', 'cloud');
    $this->tenantContext->setTenant($tenant);

    try {
        app(KeralaPolytechnicProfileSeeder::class)->run();

        $principalUser = User::create([
            'type' => 'staff',
            'name' => 'Principal John',
            'email' => 'principal@test.poly',
            'password' => Hash::make('Password123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);

        $principalRole = Role::where('key', 'principal')->firstOrFail();
        RoleAssignment::create([
            'user_id' => $principalUser->id,
            'role_id' => $principalRole->id,
            'scope_type' => 'institution',
            'scope_label' => 'i_carmel',
            'is_singleton' => true,
            'valid_from' => Carbon::now()->subDay(),
            'is_active' => true,
        ]);

        $hodRole = Role::where('key', 'hod')->firstOrFail();

        $userA = User::create([
            'type' => 'staff',
            'name' => 'HOD Alice',
            'email' => 'alice@test.poly',
            'password' => Hash::make('Password123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);

        $userB = User::create([
            'type' => 'staff',
            'name' => 'HOD Bob',
            'email' => 'bob@test.poly',
            'password' => Hash::make('Password123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);

        /** @var AssignRoleAction $assignAction */
        $assignAction = app(AssignRoleAction::class);

        // Assign Alice as HOD of Civil (d_ce)
        $assignAction->execute(
            assigner: $principalUser,
            targetUser: $userA,
            targetRole: $hodRole,
            scopeType: 'department',
            scopeLabel: 'd_ce',
            validFrom: Carbon::now()
        );

        // Attempting to assign Bob as active HOD of Civil (d_ce) must trigger SingletonRoleConflictException
        expect(function () use ($assignAction, $principalUser, $userB, $hodRole) {
            $assignAction->execute(
                assigner: $principalUser,
                targetUser: $userB,
                targetRole: $hodRole,
                scopeType: 'department',
                scopeLabel: 'd_ce',
                validFrom: Carbon::now()
            );
        })->toThrow(SingletonRoleConflictException::class);

        // But Bob CAN be assigned as HOD of Mechanical (d_me)
        $assignmentBobMe = $assignAction->execute(
            assigner: $principalUser,
            targetUser: $userB,
            targetRole: $hodRole,
            scopeType: 'department',
            scopeLabel: 'd_me',
            validFrom: Carbon::now()
        );
        expect($assignmentBobMe->scope_label)->toBe('d_me');

        // Non-singleton role (Lecturer) allows multiple users in the same department
        $lecturerRole = Role::where('key', 'lecturer')->firstOrFail();
        $assignAction->execute(
            assigner: $principalUser,
            targetUser: $userA,
            targetRole: $lecturerRole,
            scopeType: 'department',
            scopeLabel: 'd_ce'
        );
        $assignAction->execute(
            assigner: $principalUser,
            targetUser: $userB,
            targetRole: $lecturerRole,
            scopeType: 'department',
            scopeLabel: 'd_ce'
        );

        expect(RoleAssignment::where('role_id', $lecturerRole->id)->where('scope_label', 'd_ce')->count())->toBe(2);
    } finally {
        $this->tenantContext->forget();
    }
});

it('enforces delegation matrix during role assignment', function () {
    config(['app_profile.deploy_profile' => 'cloud']);

    $tenant = $this->provisioner->provision('tenant_delegation', 'Delegation Poly', 'deleg.test', 'cloud');
    $this->tenantContext->setTenant($tenant);

    try {
        app(KeralaPolytechnicProfileSeeder::class)->run();

        $superAdminUser = User::create([
            'type' => 'staff',
            'name' => 'Super Admin',
            'email' => 'ithead@test.poly',
            'password' => Hash::make('Password123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);
        $superAdminRole = Role::where('key', 'super_admin')->firstOrFail();
        RoleAssignment::create([
            'user_id' => $superAdminUser->id,
            'role_id' => $superAdminRole->id,
            'scope_type' => 'institution',
            'scope_label' => 'i_carmel',
            'is_singleton' => false,
            'is_active' => true,
        ]);

        $hodUser = User::create([
            'type' => 'staff',
            'name' => 'CE HOD',
            'email' => 'cehod@test.poly',
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

        $lecturerUser = User::create([
            'type' => 'staff',
            'name' => 'Lecturer Sam',
            'email' => 'sam@test.poly',
            'password' => Hash::make('Password123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);

        /** @var AssignRoleAction $assignAction */
        $assignAction = app(AssignRoleAction::class);

        // 1. Super Admin assigning HOD without order reference must fail with InvalidArgumentException
        expect(function () use ($assignAction, $superAdminUser, $hodUser, $hodRole) {
            $assignAction->execute(
                assigner: $superAdminUser,
                targetUser: $hodUser,
                targetRole: $hodRole,
                scopeType: 'department',
                scopeLabel: 'd_me',
                orderRecord: null // Missing required order record
            );
        })->toThrow(InvalidArgumentException::class);

        // 2. Super Admin assigning HOD with order reference succeeds
        $assignment = $assignAction->execute(
            assigner: $superAdminUser,
            targetUser: $hodUser,
            targetRole: $hodRole,
            scopeType: 'department',
            scopeLabel: 'd_me',
            orderRecord: 'Order-2026/G.O.104'
        );
        expect($assignment->order_record)->toBe('Order-2026/G.O.104');

        // 3. HOD attempting to assign Principal must fail with UnauthorizedDelegationException
        $principalRole = Role::where('key', 'principal')->firstOrFail();
        expect(function () use ($assignAction, $hodUser, $lecturerUser, $principalRole) {
            $assignAction->execute(
                assigner: $hodUser,
                targetUser: $lecturerUser,
                targetRole: $principalRole,
                scopeType: 'institution',
                scopeLabel: 'i_carmel'
            );
        })->toThrow(UnauthorizedDelegationException::class);
    } finally {
        $this->tenantContext->forget();
    }
});

it('enforces ScopeAuthorizer read vs write path resolution for S1/S2 batches', function () {
    config(['app_profile.deploy_profile' => 'cloud']);

    $tenant = $this->provisioner->provision('tenant_dual_auth', 'Dual Auth Poly', 'dual.test', 'cloud');
    $this->tenantContext->setTenant($tenant);

    try {
        app(KeralaPolytechnicProfileSeeder::class)->run();

        // Create Users: Gen Dept Coordinator, CE HOD
        $genCoordUser = User::create([
            'type' => 'staff',
            'name' => 'Gen Coord Aided',
            'email' => 'gencoord@test.poly',
            'password' => Hash::make('Password123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);
        $genCoordRole = Role::where('key', 'gen_dept_coordinator')->firstOrFail();
        RoleAssignment::create([
            'user_id' => $genCoordUser->id,
            'role_id' => $genCoordRole->id,
            'scope_type' => 'department',
            'scope_label' => 'd_gen_aided',
            'is_singleton' => true,
            'is_active' => true,
        ]);

        $ceHodUser = User::create([
            'type' => 'staff',
            'name' => 'CE HOD',
            'email' => 'cehod@test.poly',
            'password' => Hash::make('Password123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);
        $hodRole = Role::where('key', 'hod')->firstOrFail();
        RoleAssignment::create([
            'user_id' => $ceHodUser->id,
            'role_id' => $hodRole->id,
            'scope_type' => 'department',
            'scope_label' => 'd_ce',
            'is_singleton' => true,
            'is_active' => true,
        ]);

        // Create Batches: CE S2 (governed by GEN_AIDED) and CE S4 (governed by CE)
        $progCE = Program::where('code', 'DCE')->firstOrFail();
        $deptCE = Department::where('code', 'CE')->firstOrFail();
        $acadYear = AcademicYear::where('label', '2026-27')->firstOrFail();
        $reg2021 = Regulation::where('code', 'REV2021')->firstOrFail();

        /** @var CreateBatchAction $createAction */
        $createAction = app(CreateBatchAction::class);
        $batchS2 = $createAction->execute(
            programId: $progCE->id,
            homeDepartmentId: $deptCE->id,
            academicYearId: $acadYear->id,
            regulationId: $reg2021->id,
            name: 'Civil 2026-29 S2',
            entryType: 'regular',
            currentSemester: 2
        );

        $batchS4 = $createAction->execute(
            programId: $progCE->id,
            homeDepartmentId: $deptCE->id,
            academicYearId: $acadYear->id,
            regulationId: $reg2021->id,
            name: 'Civil 2024-27 S4',
            entryType: 'regular',
            currentSemester: 4
        );

        /** @var ScopeAuthorizer $authorizer */
        $authorizer = app(ScopeAuthorizer::class);

        // 1. General Dept Coordinator on CE S2:
        // Governance/write (organisation.batch.assign_tutor): YES (managing_path contains d_gen_aided)
        expect($authorizer->can($genCoordUser, 'organisation.batch.assign_tutor', $batchS2))->toBeTrue();
        // Read (organisation.batch.view): YES
        expect($authorizer->can($genCoordUser, 'organisation.batch.view', $batchS2))->toBeTrue();

        // General Dept Coordinator on CE S4:
        // Governance/write: NO (managing_path is d_ce)
        expect($authorizer->can($genCoordUser, 'organisation.batch.assign_tutor', $batchS4))->toBeFalse();
        // Read: NO (neither managing_path nor home_path contains d_gen_aided)
        expect($authorizer->can($genCoordUser, 'organisation.batch.view', $batchS4))->toBeFalse();

        // 2. CE HOD on CE S2:
        // Governance/write (organisation.batch.assign_tutor): NO! (governance is locked to GEN_AIDED)
        expect($authorizer->can($ceHodUser, 'organisation.batch.assign_tutor', $batchS2))->toBeFalse();
        // Read (organisation.batch.view): YES! (home_path contains d_ce)
        expect($authorizer->can($ceHodUser, 'organisation.batch.view', $batchS2))->toBeTrue();

        // CE HOD on CE S4:
        // Governance/write: YES! (managing_path is d_ce)
        expect($authorizer->can($ceHodUser, 'organisation.batch.assign_tutor', $batchS4))->toBeTrue();
        // Read: YES!
        expect($authorizer->can($ceHodUser, 'organisation.batch.view', $batchS4))->toBeTrue();
    } finally {
        $this->tenantContext->forget();
    }
});

it('uses visibleTo query scope with ltree index and prevents N+1 queries', function () {
    config(['app_profile.deploy_profile' => 'cloud']);

    $tenant = $this->provisioner->provision('tenant_nplusone', 'NPlusOne Poly', 'n1.test', 'cloud');
    $this->tenantContext->setTenant($tenant);

    try {
        app(KeralaPolytechnicProfileSeeder::class)->run();

        $ceHodUser = User::create([
            'type' => 'staff',
            'name' => 'CE HOD',
            'email' => 'cehod@test.poly',
            'password' => Hash::make('Password123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);
        $hodRole = Role::where('key', 'hod')->firstOrFail();
        RoleAssignment::create([
            'user_id' => $ceHodUser->id,
            'role_id' => $hodRole->id,
            'scope_type' => 'department',
            'scope_label' => 'd_ce',
            'is_singleton' => true,
            'is_active' => true,
        ]);

        $progCE = Program::where('code', 'DCE')->firstOrFail();
        $progME = Program::where('code', 'DME')->firstOrFail();
        $deptCE = Department::where('code', 'CE')->firstOrFail();
        $deptME = Department::where('code', 'ME')->firstOrFail();
        $acadYear = AcademicYear::where('label', '2026-27')->firstOrFail();
        $reg2021 = Regulation::where('code', 'REV2021')->firstOrFail();

        /** @var CreateBatchAction $createAction */
        $createAction = app(CreateBatchAction::class);

        // 3 CE batches (2 in S1/S2, 1 in S3)
        $createAction->execute($progCE->id, $deptCE->id, $acadYear->id, $reg2021->id, 'CE Batch 1', 'regular', 1);
        $createAction->execute($progCE->id, $deptCE->id, $acadYear->id, $reg2021->id, 'CE Batch 2', 'regular', 2);
        $createAction->execute($progCE->id, $deptCE->id, $acadYear->id, $reg2021->id, 'CE Batch 3', 'regular', 3);

        // 2 ME batches
        $createAction->execute($progME->id, $deptME->id, $acadYear->id, $reg2021->id, 'ME Batch 1', 'regular', 1);
        $createAction->execute($progME->id, $deptME->id, $acadYear->id, $reg2021->id, 'ME Batch 2', 'regular', 3);

        expect(Batch::count())->toBe(5);

        // Execute visibleTo query and count queries executed
        DB::connection('tenant')->enableQueryLog();
        DB::connection('tenant')->flushQueryLog();

        $visibleBatches = Batch::visibleTo($ceHodUser, 'organisation.batch.view')->get();

        $queries = DB::connection('tenant')->getQueryLog();

        // Exactly 2 queries: 1 to resolve active user scope labels, 1 to fetch batches via ltree matching
        expect(count($queries))->toBe(2)
            ->and($visibleBatches->count())->toBe(3);

        foreach ($visibleBatches as $batch) {
            expect($batch->home_department_id)->toBe($deptCE->id);
        }
    } finally {
        $this->tenantContext->forget();
    }
});

it('archives S1/S2 tutor and mentor assignments when batch is promoted from S2 to S3', function () {
    config(['app_profile.deploy_profile' => 'cloud']);

    $tenant = $this->provisioner->provision('tenant_promo_arch', 'Promo Arch Poly', 'arch.test', 'cloud');
    $this->tenantContext->setTenant($tenant);

    try {
        app(KeralaPolytechnicProfileSeeder::class)->run();

        $tutorUser = User::create([
            'type' => 'staff',
            'name' => 'Lecturer Tutor',
            'email' => 'tutor@test.poly',
            'password' => Hash::make('Password123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);
        $tutorRole = Role::where('key', 'tutor')->firstOrFail();

        $progCE = Program::where('code', 'DCE')->firstOrFail();
        $deptCE = Department::where('code', 'CE')->firstOrFail();
        $acadYear = AcademicYear::where('label', '2026-27')->firstOrFail();
        $reg2021 = Regulation::where('code', 'REV2021')->firstOrFail();

        /** @var CreateBatchAction $createAction */
        $createAction = app(CreateBatchAction::class);
        $batch = $createAction->execute(
            programId: $progCE->id,
            homeDepartmentId: $deptCE->id,
            academicYearId: $acadYear->id,
            regulationId: $reg2021->id,
            name: 'Civil 2026-29 S2',
            entryType: 'regular',
            currentSemester: 2
        );

        // Assign Tutor to this S2 batch
        $assignment = RoleAssignment::create([
            'user_id' => $tutorUser->id,
            'role_id' => $tutorRole->id,
            'scope_type' => 'batch',
            'scope_id' => $batch->id,
            'scope_label' => $batch->scope_label,
            'is_singleton' => true,
            'valid_from' => Carbon::now(),
            'is_active' => true,
        ]);

        expect($assignment->is_active)->toBeTrue();

        // Promote batch from S2 to S3
        /** @var PromoteBatchSemesterAction $promoteAction */
        $promoteAction = app(PromoteBatchSemesterAction::class);
        $promoteAction->execute($batch);

        $assignment->refresh();
        expect($assignment->is_active)->toBeFalse()
            ->and($assignment->valid_to)->not->toBeNull();
    } finally {
        $this->tenantContext->forget();
    }
});

it('logs RBAC role assignments and revocations in activity_log', function () {
    config(['app_profile.deploy_profile' => 'cloud']);

    $tenant = $this->provisioner->provision('tenant_act_log', 'Activity Log Poly', 'actlog.test', 'cloud');
    $this->tenantContext->setTenant($tenant);

    try {
        app(KeralaPolytechnicProfileSeeder::class)->run();

        $principalUser = User::create([
            'type' => 'staff',
            'name' => 'Principal Paul',
            'email' => 'paul@test.poly',
            'password' => Hash::make('Password123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);
        $principalRole = Role::where('key', 'principal')->firstOrFail();
        RoleAssignment::create([
            'user_id' => $principalUser->id,
            'role_id' => $principalRole->id,
            'scope_type' => 'institution',
            'scope_label' => 'i_carmel',
            'is_singleton' => true,
            'is_active' => true,
        ]);

        $lecturerUser = User::create([
            'type' => 'staff',
            'name' => 'Lecturer Leo',
            'email' => 'leo@test.poly',
            'password' => Hash::make('Password123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);
        $lecturerRole = Role::where('key', 'lecturer')->firstOrFail();

        /** @var AssignRoleAction $assignAction */
        $assignAction = app(AssignRoleAction::class);
        $assignment = $assignAction->execute(
            assigner: $principalUser,
            targetUser: $lecturerUser,
            targetRole: $lecturerRole,
            scopeType: 'department',
            scopeLabel: 'd_ce'
        );

        /** @var RevokeRoleAction $revokeAction */
        $revokeAction = app(RevokeRoleAction::class);
        $revokeAction->execute(
            revoker: $principalUser,
            assignment: $assignment
        );

        $activities = Activity::where('log_name', 'rbac')->get();
        expect($activities->count())->toBe(2);

        $assignActivity = $activities->first();
        expect($assignActivity->description)->toContain('Assigned role [lecturer]')
            ->and($assignActivity->causer_id)->toBe($principalUser->id);

        $revokeActivity = $activities->last();
        expect($revokeActivity->description)->toContain('Revoked role assignment')
            ->and($revokeActivity->causer_id)->toBe($principalUser->id);
    } finally {
        $this->tenantContext->forget();
    }
});

it('allows singleton role to be reassigned after revoking the previous active assignment', function () {
    config(['app_profile.deploy_profile' => 'cloud']);

    $tenant = $this->provisioner->provision('tenant_reassign', 'Reassign Poly', 'reassign.test', 'cloud');
    $this->tenantContext->setTenant($tenant);

    try {
        app(KeralaPolytechnicProfileSeeder::class)->run();

        $principal = User::create([
            'type' => 'staff',
            'name' => 'Principal Patrick',
            'email' => 'principal@reassign.test',
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

        $alice = User::create([
            'type' => 'staff',
            'name' => 'Alice HOD',
            'email' => 'alice@reassign.test',
            'password' => Hash::make('Password123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);

        $bob = User::create([
            'type' => 'staff',
            'name' => 'Bob HOD',
            'email' => 'bob@reassign.test',
            'password' => Hash::make('Password123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);

        $hodRole = Role::where('key', 'hod')->firstOrFail();

        /** @var AssignRoleAction $assignAction */
        $assignAction = app(AssignRoleAction::class);
        /** @var RevokeRoleAction $revokeAction */
        $revokeAction = app(RevokeRoleAction::class);
        /** @var ScopeAuthorizer $authorizer */
        $authorizer = app(ScopeAuthorizer::class);

        // 1. Assign Alice as HOD of Civil (d_ce)
        $aliceAssignment = $assignAction->execute(
            assigner: $principal,
            targetUser: $alice,
            targetRole: $hodRole,
            scopeType: 'department',
            scopeLabel: 'd_ce'
        );

        expect($authorizer->canAtScope($alice, 'organisation.batch.create', 'd_ce'))->toBeTrue();

        // 2. Revoke Alice's HOD role (closes valid_to range to now and sets is_active = false)
        $revokeAction->execute(
            revoker: $principal,
            assignment: $aliceAssignment
        );

        $aliceAssignment->refresh();
        expect($aliceAssignment->is_active)->toBeFalse()
            ->and($aliceAssignment->valid_to)->not->toBeNull();

        // Alice no longer possesses HOD permissions
        expect($authorizer->canAtScope($alice, 'organisation.batch.create', 'd_ce'))->toBeFalse();

        // 3. Reassign Bob as HOD of Civil (d_ce) - must succeed because the validity range is closed
        $bobAssignment = $assignAction->execute(
            assigner: $principal,
            targetUser: $bob,
            targetRole: $hodRole,
            scopeType: 'department',
            scopeLabel: 'd_ce'
        );

        expect($bobAssignment->user_id)->toBe($bob->id)
            ->and($authorizer->canAtScope($bob, 'organisation.batch.create', 'd_ce'))->toBeTrue();
    } finally {
        $this->tenantContext->forget();
    }
});

it('enforces temporal validity so future valid_from does not grant access and expired valid_to denies access', function () {
    config(['app_profile.deploy_profile' => 'cloud']);

    $tenant = $this->provisioner->provision('tenant_temporal', 'Temporal Poly', 'temporal.test', 'cloud');
    $this->tenantContext->setTenant($tenant);

    try {
        app(KeralaPolytechnicProfileSeeder::class)->run();

        $lecturer = User::create([
            'type' => 'staff',
            'name' => 'Lecturer Time',
            'email' => 'time@temporal.test',
            'password' => Hash::make('Password123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);
        $lecturerRole = Role::where('key', 'lecturer')->firstOrFail();

        /** @var ScopeAuthorizer $authorizer */
        $authorizer = app(ScopeAuthorizer::class);

        // Future assignment (starts tomorrow)
        $futureAssignment = RoleAssignment::create([
            'user_id' => $lecturer->id,
            'role_id' => $lecturerRole->id,
            'scope_type' => 'department',
            'scope_label' => 'd_ce',
            'is_singleton' => false,
            'valid_from' => Carbon::now()->addDay(),
            'valid_to' => Carbon::now()->addMonth(),
            'is_active' => true,
        ]);

        // Access not yet active
        expect($authorizer->canAtScope($lecturer, 'organisation.batch.view', 'd_ce'))->toBeFalse();

        // Past expired assignment
        $futureAssignment->valid_from = Carbon::now()->subMonths(2);
        $futureAssignment->valid_to = Carbon::now()->subMinute();
        $futureAssignment->save();

        // Access has expired
        expect($authorizer->canAtScope($lecturer, 'organisation.batch.view', 'd_ce'))->toBeFalse();

        // Active assignment
        $futureAssignment->valid_to = Carbon::now()->addHour();
        $futureAssignment->save();

        expect($authorizer->canAtScope($lecturer, 'organisation.batch.view', 'd_ce'))->toBeTrue();
    } finally {
        $this->tenantContext->forget();
    }
});

it('strictly validates scope labels against malicious and malformed inputs', function () {
    $malformedLabels = [
        'x.*',
        'a|b',
        "' OR 1=1 --",
        '',
        'label with spaces',
        'invalid!char',
        'semi;colon',
        '../path/traversal',
        'quotes"inside',
    ];

    foreach ($malformedLabels as $label) {
        expect(fn () => ScopeAuthorizer::validateScopeLabel($label))
            ->toThrow(InvalidArgumentException::class);
    }

    // Valid labels succeed
    $validLabels = ['i_carmel', 'd_ce', 'b_2024_ce_s1', 'u_01j7abc123', 'stream_aided', 'sb_lab_1'];
    foreach ($validLabels as $label) {
        ScopeAuthorizer::validateScopeLabel($label);
        expect(true)->toBeTrue();
    }
});

it('verifies that Super Admin permission set contains no academic or leave approvals', function () {
    config(['app_profile.deploy_profile' => 'cloud']);

    $tenant = $this->provisioner->provision('tenant_super_perms', 'Super Perms Poly', 'superperms.test', 'cloud');
    $this->tenantContext->setTenant($tenant);

    try {
        app(KeralaPolytechnicProfileSeeder::class)->run();
        app(PermissionsSyncCommand::class)->syncCurrentTenant();

        $superAdminRole = Role::where('key', 'super_admin')->firstOrFail();
        $permissions = $superAdminRole->permissions()->pluck('key')->all();

        // Super Admin holds identity and system permissions
        expect($permissions)->toContain('identity.user.view')
            ->toContain('identity.user.create')
            ->toContain('identity.user.impersonate')
            ->toContain('identity.role.assign');

        // Super Admin NEVER holds assessment.* permissions
        $assessmentPerms = array_filter($permissions, fn ($p) => str_starts_with((string) $p, 'assessment.'));
        expect($assessmentPerms)->toBeEmpty();

        // Super Admin NEVER holds office.staff_leave.approve_* permissions
        $leaveApprovalPerms = array_filter($permissions, fn ($p) => str_starts_with((string) $p, 'office.staff_leave.approve_'));
        expect($leaveApprovalPerms)->toBeEmpty();

        // Super Admin NEVER holds marks permissions
        $marksPerms = array_filter($permissions, fn ($p) => str_contains((string) $p, 'marks'));
        expect($marksPerms)->toBeEmpty();
    } finally {
        $this->tenantContext->forget();
    }
});

it('enforces singleton exclusion constraint under real concurrency across two database connections', function () {
    config(['app_profile.deploy_profile' => 'cloud']);

    $tenant = $this->provisioner->provision('tenant_singleton_conc', 'Singleton Conc Poly', 'singletonconc.test', 'cloud');
    $this->tenantContext->setTenant($tenant);

    try {
        app(KeralaPolytechnicProfileSeeder::class)->run();

        $principal = User::create([
            'type' => 'staff',
            'name' => 'Principal Patrick',
            'email' => 'principal@singletonconc.test',
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

        $candidateA = User::create([
            'type' => 'staff',
            'name' => 'Candidate A HOD',
            'email' => 'candidateA@singletonconc.test',
            'password' => Hash::make('Password123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);

        $candidateB = User::create([
            'type' => 'staff',
            'name' => 'Candidate B HOD',
            'email' => 'candidateB@singletonconc.test',
            'password' => Hash::make('Password123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);

        $hodRole = Role::where('key', 'hod')->firstOrFail();

        // Establish two distinct PDO connections to the tenant database
        $dbConfig = config('database.connections.tenant');
        $dsn = sprintf('pgsql:host=%s;port=%d;dbname=%s', $dbConfig['host'], $dbConfig['port'], $dbConfig['database']);
        $pdoA = new \PDO($dsn, (string) $dbConfig['username'], (string) $dbConfig['password'], [\PDO::ATTR_ERRMODE => \PDO::ERRMODE_EXCEPTION]);
        $pdoB = new \PDO($dsn, (string) $dbConfig['username'], (string) $dbConfig['password'], [\PDO::ATTR_ERRMODE => \PDO::ERRMODE_EXCEPTION]);

        $assignmentUlidA = (string) Str::ulid();
        $assignmentUlidB = (string) Str::ulid();

        // Connection A inserts singleton assignment for Civil HOD (d_ce)
        $pdoA->beginTransaction();
        $stmtA = $pdoA->prepare("
            INSERT INTO role_assignments (id, user_id, role_id, scope_type, scope_label, is_singleton, valid_from, is_active, created_at, updated_at)
            VALUES (:id, :user_id, :role_id, 'department', 'd_ce', true, NOW(), true, NOW(), NOW())
        ");
        $stmtA->execute([
            'id' => $assignmentUlidA,
            'user_id' => $candidateA->id,
            'role_id' => $hodRole->id,
        ]);
        $pdoA->commit();

        // Connection B attempts to insert conflicting singleton assignment concurrently
        $pdoB->beginTransaction();
        $exceptionCaught = null;
        try {
            $stmtB = $pdoB->prepare("
                INSERT INTO role_assignments (id, user_id, role_id, scope_type, scope_label, is_singleton, valid_from, is_active, created_at, updated_at)
                VALUES (:id, :user_id, :role_id, 'department', 'd_ce', true, NOW(), true, NOW(), NOW())
            ");
            $stmtB->execute([
                'id' => $assignmentUlidB,
                'user_id' => $candidateB->id,
                'role_id' => $hodRole->id,
            ]);
            $pdoB->commit();
        } catch (\PDOException $e) {
            $exceptionCaught = $e;
            $pdoB->rollBack();
        }

        // Exactly one succeeds, the other fails with exclusion constraint violation (SQLSTATE 23P01)
        expect($exceptionCaught)->not->toBeNull();
        expect($exceptionCaught->getCode())->toBe('23P01'); // exclusion_violation
        expect($exceptionCaught->getMessage())->toContain('role_assignments_singleton_no_overlap');

        // Verify Candidate A is active HOD and has access
        /** @var ScopeAuthorizer $authorizer */
        $authorizer = app(ScopeAuthorizer::class);
        expect($authorizer->canAtScope($candidateA, 'organisation.batch.create', 'd_ce'))->toBeTrue();
        expect($authorizer->canAtScope($candidateB, 'organisation.batch.create', 'd_ce'))->toBeFalse();

        // Revoke Candidate A's assignment via RevokeRoleAction
        /** @var RevokeRoleAction $revokeAction */
        $revokeAction = app(RevokeRoleAction::class);
        $assignmentA = RoleAssignment::findOrFail($assignmentUlidA);
        $revokeAction->execute(revoker: $principal, assignment: $assignmentA);

        $assignmentA->refresh();
        expect($assignmentA->is_active)->toBeFalse()
            ->and($assignmentA->valid_to)->not->toBeNull();

        // Candidate A's access is now immediately denied
        expect($authorizer->canAtScope($candidateA, 'organisation.batch.create', 'd_ce'))->toBeFalse();

        // Now Candidate B can be assigned the singleton role successfully without conflict!
        /** @var AssignRoleAction $assignAction */
        $assignAction = app(AssignRoleAction::class);
        $assignmentB = $assignAction->execute(
            assigner: $principal,
            targetUser: $candidateB,
            targetRole: $hodRole,
            scopeType: 'department',
            scopeLabel: 'd_ce'
        );

        expect($assignmentB->is_active)->toBeTrue();
        expect($authorizer->canAtScope($candidateB, 'organisation.batch.create', 'd_ce'))->toBeTrue();
    } finally {
        $this->tenantContext->forget();
    }
});

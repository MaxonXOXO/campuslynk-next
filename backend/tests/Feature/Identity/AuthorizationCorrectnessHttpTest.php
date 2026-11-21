<?php

declare(strict_types=1);

namespace Tests\Feature\Identity;

use App\Core\Tenancy\Services\TenantProvisioner;
use App\Core\Tenancy\TenantContext;
use App\Modules\Identity\Models\DelegationRule;
use App\Modules\Identity\Models\Permission;
use App\Modules\Identity\Models\Role;
use App\Modules\Identity\Models\RoleAssignment;
use App\Modules\Identity\Models\User;
use App\Modules\Identity\Services\ScopeAuthorizer;
use App\Modules\Organisation\Actions\CreateBatchAction;
use App\Modules\Organisation\Actions\CreateSubBatchAction;
use App\Modules\Organisation\Actions\PromoteBatchSemesterAction;
use App\Modules\Organisation\Database\Seeders\KeralaPolytechnicProfileSeeder;
use App\Modules\Organisation\Models\AcademicYear;
use App\Modules\Organisation\Models\Department;
use App\Modules\Organisation\Models\Institution;
use App\Modules\Organisation\Models\Program;
use App\Modules\Organisation\Models\Regulation;
use App\Modules\Organisation\Models\Stream;
use App\Modules\Organisation\Models\WorkshopSection;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Tests\Feature\Tenancy\TenancyTestHelper;

uses(TenancyTestHelper::class, AuthorizationHttpTestHelper::class);

beforeEach(function () {
    $this->purgeAllTenantDatabases();
    Carbon::setTestNow(Carbon::now()->startOfSecond());
    config(['app_profile.deploy_profile' => 'cloud']);

    $this->tenantContext = app(TenantContext::class);
    $this->tenant = app(TenantProvisioner::class)->provision(
        'authorization_b1', 'Authorization B1 Poly', 'authorization-b1.test', 'cloud'
    );
    $this->tenantContext->setTenant($this->tenant);
    app(KeralaPolytechnicProfileSeeder::class)->run();

    $this->institution = Institution::firstOrFail();
    $this->departmentA = Department::where('code', 'CE')->firstOrFail();
    $this->departmentB = Department::where('code', 'ME')->firstOrFail();

    $year = AcademicYear::where('label', '2026-27')->firstOrFail();
    $regulation = Regulation::where('code', 'REV2021')->firstOrFail();
    $createBatch = app(CreateBatchAction::class);
    $this->batchA = $createBatch->execute(
        Program::where('code', 'DCE')->firstOrFail()->id, $this->departmentA->id,
        $year->id, $regulation->id, 'Civil B1', 'regular', 3
    );
    $this->batchB = $createBatch->execute(
        Program::where('code', 'DME')->firstOrFail()->id, $this->departmentB->id,
        $year->id, $regulation->id, 'Mechanical B1', 'regular', 3
    );

    $this->caller = $this->authorizationUser('Caller');
    $this->memberA = $this->authorizationUser('Member A');
    $this->memberB = $this->authorizationUser('Member B');
    $this->memberBoth = $this->authorizationUser('Cross Department Member');
    $this->candidate = $this->authorizationUser('Unassigned Candidate');
    $this->assignmentA = $this->authorizationGrant($this->memberA, 'lecturer', 'department', $this->departmentA);
    $this->assignmentB = $this->authorizationGrant($this->memberB, 'lecturer', 'department', $this->departmentB);
    $this->assignmentBothA = $this->authorizationGrant($this->memberBoth, 'lecturer', 'department', $this->departmentA);
    $this->assignmentBothB = $this->authorizationGrant($this->memberBoth, 'demonstrator', 'department', $this->departmentB);

    $this->captureAuthorizationWrites = false;
    $this->authorizationWrites = [];
    DB::connection('tenant')->listen(function (QueryExecuted $query): void {
        if ($this->captureAuthorizationWrites && $query->connectionName === 'tenant'
            && preg_match('/^\s*(insert|update|delete|create|alter|drop|truncate)\b/i', $query->sql)) {
            $this->authorizationWrites[] = $query->sql;
        }
    });
});

afterEach(function () {
    $this->captureAuthorizationWrites = false;
    Carbon::setTestNow();
    $this->purgeAllTenantDatabases();
});

it('isolates HOD department reads, writes, appointments and collection filters over HTTP', function () {
    $this->authorizationGrant($this->caller, 'hod', 'department', $this->departmentA);
    $this->authorizationActAs($this->caller);

    $this->getJson('http://authorization-b1.test/api/v1/departments')->assertOk()
        ->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $this->departmentA->id);

    $users = $this->getJson('http://authorization-b1.test/api/v1/users')->assertOk();
    expect(array_column($users->json('data'), 'id'))->toEqualCanonicalizing([
        $this->caller->id, $this->memberA->id, $this->memberBoth->id,
    ]);

    $assignments = $this->getJson('http://authorization-b1.test/api/v1/role-assignments?active_only=false')->assertOk();
    expect(array_column($assignments->json('data'), 'id'))->toContain($this->assignmentA->id)
        ->toContain($this->assignmentBothA->id)
        ->not->toContain($this->assignmentB->id)
        ->not->toContain($this->assignmentBothB->id);

    $this->getJson('http://authorization-b1.test/api/v1/users?search=Member%20B')->assertOk()->assertJsonPath('meta.total', 0);
    $this->getJson('http://authorization-b1.test/api/v1/role-assignments?scope_label='.$this->departmentB->scope_label)
        ->assertOk()->assertJsonPath('meta.total', 0);
    $this->getJson('http://authorization-b1.test/api/v1/role-assignments?user_id='.$this->memberB->id)
        ->assertOk()->assertJsonPath('meta.total', 0);

    $this->assertAuthorizationRejectedWithoutWrites(fn () => $this->getJson(
        'http://authorization-b1.test/api/v1/departments/'.$this->departmentB->id
    ));
    $this->assertAuthorizationRejectedWithoutWrites(fn () => $this->getJson(
        'http://authorization-b1.test/api/v1/users/'.$this->memberB->id
    ));
    $this->assertAuthorizationRejectedWithoutWrites(fn () => $this->putJson(
        'http://authorization-b1.test/api/v1/departments/'.$this->departmentB->id, ['name' => 'Rejected rename']
    ));
    $this->assertAuthorizationRejectedWithoutWrites(fn () => $this->deleteJson(
        'http://authorization-b1.test/api/v1/departments/'.$this->departmentB->id
    ));
    $this->assertAuthorizationRejectedWithoutWrites(fn () => $this->postJson(
        'http://authorization-b1.test/api/v1/departments', [
            'code' => 'NEW', 'name' => 'Rejected sibling', 'stream_id' => $this->departmentB->stream_id,
        ]
    ));
    $this->assertAuthorizationRejectedWithoutWrites(fn () => $this->postJson(
        'http://authorization-b1.test/api/v1/role-assignments',
        $this->authorizationAppointment($this->candidate, 'lecturer', 'department', $this->departmentB)
    ));
    $this->assertAuthorizationRejectedWithoutWrites(fn () => $this->deleteJson(
        'http://authorization-b1.test/api/v1/role-assignments/'.$this->assignmentB->id
    ));

    $this->putJson('http://authorization-b1.test/api/v1/departments/'.$this->departmentA->id, ['name' => 'Own department'])
        ->assertOk()->assertJsonPath('data.name', 'Own department');
});

it('applies user target policies with exactly the same predicates as user collection queries', function () {
    $permission = Permission::where('key', 'identity.user.update')->firstOrFail();
    Role::where('key', 'hod')->firstOrFail()->permissions()->attach($permission->id);
    $this->authorizationGrant($this->caller, 'hod', 'department', $this->departmentA);
    $this->authorizationActAs($this->caller);

    $list = $this->getJson('http://authorization-b1.test/api/v1/users')->assertOk();
    $visibleIds = array_column($list->json('data'), 'id');

    foreach ([$this->memberA, $this->memberB, $this->memberBoth, $this->candidate] as $user) {
        $visible = in_array($user->id, $visibleIds, true);
        $this->getJson('http://authorization-b1.test/api/v1/users/'.$user->id)->assertStatus($visible ? 200 : 403);
        $this->tenantContext->setTenant($this->tenant);
        expect(app(ScopeAuthorizer::class)->canAccessUser($this->caller, 'identity.user.view', $user))->toBe($visible);
    }

    $this->assertAuthorizationRejectedWithoutWrites(fn () => $this->putJson(
        'http://authorization-b1.test/api/v1/users/'.$this->memberB->id,
        ['name' => 'Rejected user update', 'email' => 'rejected@authorization-b1.test']
    ));
    $this->putJson('http://authorization-b1.test/api/v1/users/'.$this->memberA->id, ['name' => 'Updated member A'])
        ->assertOk()->assertJsonPath('data.name', 'Updated member A');
});

it('makes department and assignment point checks agree with scoped collections', function () {
    $this->authorizationGrant($this->caller, 'hod', 'department', $this->departmentA);
    $this->authorizationActAs($this->caller);
    $departmentIds = array_column($this->getJson('http://authorization-b1.test/api/v1/departments')->assertOk()->json('data'), 'id');
    $assignmentIds = array_column($this->getJson('http://authorization-b1.test/api/v1/role-assignments')->assertOk()->json('data'), 'id');
    $this->tenantContext->setTenant($this->tenant);
    $departments = Department::whereIn('code', ['CE', 'ME', 'EEE', 'EL', 'CT', 'AU'])->get();
    expect($departments)->toHaveCount(6);

    foreach ($departments as $department) {
        $expected = in_array($department->id, $departmentIds, true);
        expect(app(ScopeAuthorizer::class)->can($this->caller, 'organisation.batch.view', $department))->toBe($expected);
        $this->getJson('http://authorization-b1.test/api/v1/departments/'.$department->id)->assertStatus($expected ? 200 : 403);
        $this->tenantContext->setTenant($this->tenant);
    }

    foreach ([$this->assignmentA, $this->assignmentB, $this->assignmentBothA, $this->assignmentBothB] as $assignment) {
        expect(app(ScopeAuthorizer::class)->canAccessAssignment($this->caller, 'identity.role.assign', $assignment))
            ->toBe(in_array($assignment->id, $assignmentIds, true));
    }
});

it('does not borrow scope from a different assignment in either direction', function (bool $reverse) {
    $own = $reverse ? $this->departmentB : $this->departmentA;
    $other = $reverse ? $this->departmentA : $this->departmentB;
    $this->authorizationGrant($this->caller, 'hod', 'department', $own);
    $this->authorizationGrant($this->caller, 'gen_dept_coordinator', 'department', $other);
    $rulesBefore = DelegationRule::orderBy('id')->get()->toArray();
    $this->authorizationActAs($this->caller);

    $this->assertAuthorizationRejectedWithoutWrites(fn () => $this->postJson(
        'http://authorization-b1.test/api/v1/role-assignments',
        $this->authorizationAppointment($this->candidate, 'lecturer', 'department', $other)
    ));

    $this->postJson('http://authorization-b1.test/api/v1/role-assignments',
        $this->authorizationAppointment($this->candidate, 'lecturer', 'department', $own)
    )->assertCreated();

    $this->tenantContext->setTenant($this->tenant);
    expect(DelegationRule::orderBy('id')->get()->toArray())->toBe($rulesBefore);
})->with(['A delegation with B scope' => false, 'B delegation with A scope' => true]);

it('keeps home-path reads and managing-path assignment queries consistent through promotion', function () {
    $general = Department::where('code', 'GEN_AIDED')->firstOrFail();
    $coordinator = $this->authorizationUser('General Coordinator');
    $this->authorizationGrant($coordinator, 'gen_dept_coordinator', 'department', $general);
    $this->authorizationGrant($this->caller, 'hod', 'department', $this->departmentA);
    $firstYear = app(CreateBatchAction::class)->execute(
        Program::where('code', 'DCE')->firstOrFail()->id, $this->departmentA->id,
        AcademicYear::where('label', '2026-27')->firstOrFail()->id,
        Regulation::where('code', 'REV2021')->firstOrFail()->id, 'Civil dual paths B1', 'regular', 2
    );
    $tutor = $this->authorizationGrant($this->candidate, 'tutor', 'batch', $firstYear);
    $label = $tutor->scope_label;
    $historyUrl = 'http://authorization-b1.test/api/v1/role-assignments?active_only=false&user_id='.$this->candidate->id;

    $this->authorizationActAs($this->caller);
    $users = $this->getJson('http://authorization-b1.test/api/v1/users')->assertOk();
    expect(array_column($users->json('data'), 'id'))->toContain($this->candidate->id);
    $this->getJson('http://authorization-b1.test/api/v1/users/'.$this->candidate->id)->assertOk();
    $this->getJson($historyUrl)->assertOk()->assertJsonCount(0, 'data');
    $this->assertAuthorizationRejectedWithoutWrites(fn () => $this->deleteJson(
        'http://authorization-b1.test/api/v1/role-assignments/'.$tutor->id
    ));
    $this->tenantContext->setTenant($this->tenant);
    expect(app(ScopeAuthorizer::class)->canAccessUser($this->caller, 'identity.user.view', $this->candidate))->toBeTrue();
    expect(app(ScopeAuthorizer::class)->canAccessAssignment($this->caller, 'identity.role.assign', $tutor))->toBeFalse();

    $this->authorizationActAs($coordinator);
    $this->getJson($historyUrl)->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $tutor->id);
    $this->getJson('http://authorization-b1.test/api/v1/users/'.$this->candidate->id)->assertOk();
    $this->tenantContext->setTenant($this->tenant);
    expect(app(ScopeAuthorizer::class)->canAccessAssignment($coordinator, 'identity.role.assign', $tutor))->toBeTrue();

    app(PromoteBatchSemesterAction::class)->execute($firstYear);
    $tutor->refresh();
    expect($tutor->scope_label)->toBe($label)->and($tutor->is_active)->toBeFalse();

    $this->getJson($historyUrl)->assertOk()->assertJsonCount(0, 'data');
    $this->tenantContext->setTenant($this->tenant);
    expect(app(ScopeAuthorizer::class)->canAccessAssignment($coordinator, 'identity.role.assign', $tutor))->toBeFalse();

    $this->authorizationActAs($this->caller);
    $this->getJson($historyUrl)->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $tutor->id);
    $this->tenantContext->setTenant($this->tenant);
    expect(app(ScopeAuthorizer::class)->canAccessAssignment($this->caller, 'identity.role.assign', $tutor))->toBeTrue();
});

it('does not borrow permission from a different assignment even at the same scope', function () {
    $permission = Permission::where('key', 'identity.role.assign')->firstOrFail();
    Role::where('key', 'hod')->firstOrFail()->permissions()->detach($permission->id);
    $this->authorizationGrant($this->caller, 'hod', 'department', $this->departmentA);
    $this->authorizationGrant($this->caller, 'gen_dept_coordinator', 'department', $this->departmentA);
    $this->authorizationActAs($this->caller);

    $this->assertAuthorizationRejectedWithoutWrites(fn () => $this->postJson(
        'http://authorization-b1.test/api/v1/role-assignments',
        $this->authorizationAppointment($this->candidate, 'lecturer', 'department', $this->departmentA)
    ));
});

it('also rejects mixed-grant appointments through real bearer authentication', function () {
    $this->authorizationGrant($this->caller, 'hod', 'department', $this->departmentA);
    $this->authorizationGrant($this->caller, 'gen_dept_coordinator', 'department', $this->departmentB);
    $token = $this->caller->createToken('b1-real-http')->plainTextToken;
    $this->app['auth']->forgetGuards();

    $this->withToken($token)->postJson('http://authorization-b1.test/api/v1/role-assignments',
        $this->authorizationAppointment($this->candidate, 'lecturer', 'department', $this->departmentB)
    )->assertForbidden();

    $this->tenantContext->setTenant($this->tenant);
    expect(RoleAssignment::where('user_id', $this->candidate->id)->count())->toBe(0);
});

it('keeps foreign tenant targets and bearer tokens isolated over HTTP', function () {
    $this->authorizationGrant($this->caller, 'super_admin', 'institution', $this->institution);
    $token = $this->caller->createToken('b1-tenant-boundary')->plainTextToken;
    $otherTenant = app(TenantProvisioner::class)->provision(
        'authorization_b1_other', 'Other Authorization Poly', 'authorization-b1-other.test', 'cloud'
    );
    $this->tenantContext->setTenant($otherTenant);
    app(KeralaPolytechnicProfileSeeder::class)->run();
    $foreignUser = $this->authorizationUser('Other College Member');
    $foreignDepartment = Department::where('code', 'CE')->firstOrFail();
    $foreignAssignment = $this->authorizationGrant($foreignUser, 'lecturer', 'department', $foreignDepartment);
    $this->tenantContext->setTenant($this->tenant);
    $this->authorizationActAs($this->caller);

    $this->captureAuthorizationWrites = true;
    try {
        $this->getJson('http://authorization-b1.test/api/v1/users/'.$foreignUser->id)->assertNotFound();
        $this->putJson('http://authorization-b1.test/api/v1/users/'.$foreignUser->id, ['name' => 'Rejected foreign update'])
            ->assertNotFound();
        $this->putJson('http://authorization-b1.test/api/v1/departments/'.$foreignDepartment->id, ['name' => 'Rejected foreign rename'])
            ->assertNotFound();
        $this->deleteJson('http://authorization-b1.test/api/v1/role-assignments/'.$foreignAssignment->id)->assertNotFound();
        expect($this->authorizationWrites)->toBeEmpty();
    } finally {
        $this->captureAuthorizationWrites = false;
    }

    $this->tenantContext->setTenant($otherTenant);
    expect($foreignUser->fresh()->name)->toBe('Other College Member');
    expect($foreignDepartment->fresh()->name)->toBe($foreignDepartment->name);
    expect($foreignAssignment->fresh()->is_active)->toBeTrue();

    $this->app['auth']->forgetGuards();
    $this->withToken($token)->getJson('http://authorization-b1-other.test/api/v1/users')->assertUnauthorized();
});

it('rejects mismatched target scope IDs and labels without writes', function () {
    $this->authorizationGrant($this->caller, 'hod', 'department', $this->departmentA);
    $this->authorizationActAs($this->caller);
    $payload = $this->authorizationAppointment($this->candidate, 'lecturer', 'department', $this->departmentB);
    $payload['scope_label'] = $this->departmentA->scope_label;

    $this->assertAuthorizationRejectedWithoutWrites(fn () => $this->postJson(
        'http://authorization-b1.test/api/v1/role-assignments', $payload
    ));
});

it('grants nothing for ended, future, expired, disabled-role or suspended-account grants', function (string $state) {
    $grant = $this->authorizationGrant($this->caller, 'hod', 'department', $this->departmentA);

    match ($state) {
        'ended' => $grant->update(['is_active' => false, 'valid_to' => Carbon::now()->subHour()]),
        'future' => $grant->update(['valid_from' => Carbon::now()->addDay()]),
        'expired' => $grant->update(['valid_to' => Carbon::now()->subHour()]),
        'disabled role' => Role::where('key', 'hod')->update(['is_active' => false]),
        'suspended account' => User::whereKey($this->caller->id)->update(['status' => 'suspended']),
    };
    $this->authorizationActAs($this->caller);

    foreach (['users', 'role-assignments', 'departments'] as $collection) {
        $this->assertAuthorizationRejectedWithoutWrites(fn () => $this->getJson(
            'http://authorization-b1.test/api/v1/'.$collection
        ));
    }
    $this->assertAuthorizationRejectedWithoutWrites(fn () => $this->putJson(
        'http://authorization-b1.test/api/v1/departments/'.$this->departmentA->id, ['name' => 'Rejected inactive grant']
    ));
    $this->assertAuthorizationRejectedWithoutWrites(fn () => $this->postJson(
        'http://authorization-b1.test/api/v1/role-assignments',
        $this->authorizationAppointment($this->candidate, 'lecturer', 'department', $this->departmentA)
    ));

    $this->tenantContext->setTenant($this->tenant);
    $authorizer = app(ScopeAuthorizer::class);
    expect($authorizer->can($this->caller, 'organisation.batch.view', $this->departmentA))->toBeFalse();
    foreach ([User::query(), RoleAssignment::query(), Department::query()] as $query) {
        expect($authorizer->scopeQuery($query, $this->caller, 'identity.role.assign')->count())->toBe(0);
    }
})->with(['ended', 'future', 'expired', 'disabled role', 'suspended account']);

it('preserves General Coordinator appointments in the managing S1/S2 department', function () {
    $general = Department::where('code', 'GEN_AIDED')->firstOrFail();
    $this->authorizationGrant($this->caller, 'gen_dept_coordinator', 'department', $general);
    $firstYear = app(CreateBatchAction::class)->execute(
        Program::where('code', 'DCE')->firstOrFail()->id, $this->departmentA->id,
        AcademicYear::where('label', '2026-27')->firstOrFail()->id,
        Regulation::where('code', 'REV2021')->firstOrFail()->id, 'Civil first year B1', 'regular', 2
    );
    $this->authorizationActAs($this->caller);

    $this->postJson('http://authorization-b1.test/api/v1/role-assignments',
        $this->authorizationAppointment($this->candidate, 'tutor', 'batch', $firstYear)
    )->assertCreated();

    $this->assertAuthorizationRejectedWithoutWrites(fn () => $this->postJson(
        'http://authorization-b1.test/api/v1/role-assignments',
        $this->authorizationAppointment($this->candidate, 'mentor', 'batch', $this->batchA)
    ));
});

it('preserves Tutor to Mentor delegation for batch and sub-batch scopes', function () {
    $role = Role::where('key', 'tutor')->firstOrFail();
    expect($role->permissions()->where('key', 'identity.role.assign')->exists())->toBeFalse();
    $this->authorizationGrant($this->caller, 'tutor', 'batch', $this->batchA);
    $subBatch = app(CreateSubBatchAction::class)->execute($this->batchA, 'mentoring', 'Group A');
    $this->authorizationActAs($this->caller);

    $this->assertAuthorizationRejectedWithoutWrites(fn () => $this->postJson(
        'http://authorization-b1.test/api/v1/role-assignments',
        $this->authorizationAppointment($this->candidate, 'mentor', 'sub_batch', $subBatch)
    ));
    $this->tenantContext->setTenant($this->tenant);
    // Exercise the existing delegation rule with an explicit test-tenant permission.
    $role->permissions()->attach(Permission::where('key', 'identity.role.assign')->firstOrFail()->id);
    $this->authorizationActAs($this->caller);

    $this->postJson('http://authorization-b1.test/api/v1/role-assignments',
        $this->authorizationAppointment($this->candidate, 'mentor', 'sub_batch', $subBatch)
    )->assertCreated();
    $this->postJson('http://authorization-b1.test/api/v1/role-assignments',
        $this->authorizationAppointment($this->candidate, 'mentor', 'batch', $this->batchA)
    )->assertCreated();

    $this->assertAuthorizationRejectedWithoutWrites(fn () => $this->postJson(
        'http://authorization-b1.test/api/v1/role-assignments',
        $this->authorizationAppointment($this->candidate, 'mentor', 'batch', $this->batchB)
    ));
});

it('preserves the Principal to Workshop Superintendent to workshop-staff chain', function () {
    $workshop = WorkshopSection::firstOrFail();
    $otherWorkshop = WorkshopSection::where('id', '!=', $workshop->id)->firstOrFail();
    $principal = $this->authorizationUser('Principal');
    $this->authorizationGrant($principal, 'principal', 'institution', $this->institution);
    $this->authorizationActAs($principal);
    $this->postJson('http://authorization-b1.test/api/v1/role-assignments',
        $this->authorizationAppointment($this->caller, 'workshop_superintendent', 'workshop_section', $workshop)
    )->assertCreated();

    $this->tenantContext->setTenant($this->tenant);
    $role = Role::where('key', 'workshop_superintendent')->firstOrFail();
    expect($role->permissions()->where('key', 'identity.role.assign')->exists())->toBeFalse();
    $this->authorizationActAs($this->caller);

    $this->assertAuthorizationRejectedWithoutWrites(fn () => $this->postJson(
        'http://authorization-b1.test/api/v1/role-assignments',
        $this->authorizationAppointment($this->candidate, 'workshop_instructor', 'workshop_section', $workshop)
    ));
    $this->tenantContext->setTenant($this->tenant);
    $role->permissions()->attach(Permission::where('key', 'identity.role.assign')->firstOrFail()->id);
    $this->authorizationActAs($this->caller);

    $this->postJson('http://authorization-b1.test/api/v1/role-assignments',
        $this->authorizationAppointment($this->candidate, 'workshop_instructor', 'workshop_section', $workshop)
    )->assertCreated();
    $this->assertAuthorizationRejectedWithoutWrites(fn () => $this->postJson(
        'http://authorization-b1.test/api/v1/role-assignments',
        $this->authorizationAppointment($this->candidate, 'trade_instructor', 'workshop_section', $otherWorkshop)
    ));
});

it('preserves the Super Admin recorded-order exception and null-id bootstrap scope', function () {
    $grant = $this->authorizationGrant($this->caller, 'super_admin', 'institution', $this->institution);
    $grant->update(['scope_id' => null]);
    $this->authorizationActAs($this->caller);
    $payload = $this->authorizationAppointment($this->candidate, 'hod', 'department', $this->departmentB);

    $this->assertAuthorizationRejectedWithoutWrites(fn () => $this->postJson(
        'http://authorization-b1.test/api/v1/role-assignments', $payload
    ), 422)->assertJsonPath('detail', 'Assigning role [hod] requires an official order reference.');

    $payload['order_record'] = 'G.O.(Rt) No. 402/2026/HEDN';
    $this->postJson('http://authorization-b1.test/api/v1/role-assignments', $payload)
        ->assertCreated()->assertJsonPath('data.role_key', 'hod');

    $this->tenantContext->setTenant($this->tenant);
    expect(RoleAssignment::where('user_id', $this->candidate->id)->firstOrFail()->order_record)->toBe($payload['order_record']);
    expect(Role::count())->toBe(21);
});

it('accepts a complete Principal grant without borrowing the Super Admin order exception', function () {
    $this->authorizationGrant($this->caller, 'super_admin', 'institution', $this->institution);
    $this->authorizationGrant($this->caller, 'principal', 'institution', $this->institution);
    $this->authorizationActAs($this->caller);

    $this->postJson('http://authorization-b1.test/api/v1/role-assignments',
        $this->authorizationAppointment($this->candidate, 'hod', 'department', $this->departmentA)
    )->assertCreated();
});

it('rejects role and scope-type mismatches without writes', function (string $roleKey, string $type) {
    $this->authorizationGrant($this->caller, 'principal', 'institution', $this->institution);
    $this->authorizationActAs($this->caller);
    $scope = $type === 'institution' ? $this->institution : $this->departmentA;

    $this->assertAuthorizationRejectedWithoutWrites(fn () => $this->postJson(
        'http://authorization-b1.test/api/v1/role-assignments',
        $this->authorizationAppointment($this->candidate, $roleKey, $type, $scope)
    ), 422)->assertJsonPath('detail', "Scope type [{$type}] is not allowed for role [{$roleKey}].");
})->with([
    'institution-wide HOD' => ['hod', 'institution'],
    'departmental Principal' => ['principal', 'department'],
    'institution-wide Lecturer' => ['lecturer', 'institution'],
    'departmental Tutor' => ['tutor', 'department'],
    'departmental Mentor' => ['mentor', 'department'],
]);

it('preserves documented stream and institution scope alternatives', function (string $key, string $type) {
    $this->authorizationGrant($this->caller, 'principal', 'institution', $this->institution);
    $scope = $type === 'institution' ? $this->institution : Stream::where('code', 'SF')->firstOrFail();
    $this->authorizationActAs($this->caller);

    $this->postJson('http://authorization-b1.test/api/v1/role-assignments',
        $this->authorizationAppointment($this->candidate, $key, $type, $scope)
    )->assertCreated();
})->with([
    'Office Admin stream' => ['admin', 'stream'],
    'Physical Instructor stream' => ['physical_instructor', 'stream'],
    'Physical Instructor institution' => ['physical_instructor', 'institution'],
]);

it('keeps ended assignment history queryable only inside the authorized scope', function () {
    $this->authorizationGrant($this->caller, 'hod', 'department', $this->departmentA);
    $this->assignmentA->update(['is_active' => false, 'valid_to' => Carbon::now()->subHour()]);
    $this->assignmentB->update(['is_active' => false, 'valid_to' => Carbon::now()->subHour()]);
    $this->authorizationActAs($this->caller);

    $active = $this->getJson('http://authorization-b1.test/api/v1/role-assignments')->assertOk();
    expect(array_column($active->json('data'), 'id'))->not->toContain($this->assignmentA->id);
    $history = $this->getJson('http://authorization-b1.test/api/v1/role-assignments?active_only=false')->assertOk();
    expect(array_column($history->json('data'), 'id'))->toContain($this->assignmentA->id)->not->toContain($this->assignmentB->id);
});

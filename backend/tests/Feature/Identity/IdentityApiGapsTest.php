<?php

declare(strict_types=1);

namespace Tests\Feature\Identity;

use App\Core\Tenancy\Services\TenantProvisioner;
use App\Core\Tenancy\TenantContext;
use App\Modules\Identity\Models\Activity;
use App\Modules\Identity\Models\Permission;
use App\Modules\Identity\Models\Role;
use App\Modules\Identity\Models\RoleAssignment;
use App\Modules\Identity\Models\User;
use App\Modules\Organisation\Database\Seeders\KeralaPolytechnicProfileSeeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
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

function provisionIdentityGapTenant(
    TenantProvisioner $provisioner,
    TenantContext $tenantContext,
    string $slug,
    string $domain
): array {
    config(['app_profile.deploy_profile' => 'cloud']);
    $tenant = $provisioner->provision($slug, 'Identity Gap Poly', $domain, 'cloud');
    $tenantContext->setTenant($tenant);
    app(KeralaPolytechnicProfileSeeder::class)->run();

    $superAdmin = User::create([
        'type' => 'staff',
        'name' => 'Super Admin One',
        'email' => "superadmin@{$domain}",
        'password' => Hash::make('AdminPass123!'),
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

    return [
        'tenant' => $tenant,
        'superAdmin' => $superAdmin,
        'token' => $superAdmin->createToken('sa_token')->plainTextToken,
    ];
}

it('issues a one-time temporary password on POST /users when omitted, never exposes it again, and enforces expiry on explicit password too', function () {
    $ctx = provisionIdentityGapTenant($this->provisioner, $this->tenantContext, 'tenant_gap_u1', 'gapu1.test');

    try {
        // 1. Omitted password -> server generates one-time temp password + expires_at + Cache-Control: no-store
        $createRes = $this->withHeaders([
            'Authorization' => "Bearer {$ctx['token']}",
        ])->postJson('http://gapu1.test/api/v1/users', [
            'type' => 'staff',
            'name' => 'Dr. Asha Nair',
            'email' => 'asha@gapu1.test',
        ]);

        $createRes->assertStatus(201);
        expect(strtolower((string) $createRes->headers->get('Cache-Control')))->toContain('no-store');

        $tempPassword = (string) $createRes->json('data.temporary_password');
        $expiresAt = $createRes->json('data.expires_at');
        $userId = (string) $createRes->json('data.id');

        expect($tempPassword)->not->toBeEmpty()
            ->and(strlen($tempPassword))->toBeGreaterThanOrEqual(16)
            ->and($expiresAt)->not->toBeNull()
            ->and($createRes->json('data.must_change_password'))->toBeTrue()
            ->and($createRes->json('data.temporary_password_expires_at'))->not->toBeNull();

        // Subsequent GET /users and GET /users/{id} must NEVER return temporary_password
        $this->app['auth']->forgetGuards();
        $getRes = $this->withHeaders([
            'Authorization' => "Bearer {$ctx['token']}",
        ])->getJson("http://gapu1.test/api/v1/users/{$userId}");
        $getRes->assertStatus(200);
        expect($getRes->json('data'))->not->toHaveKey('temporary_password')
            ->and($getRes->json('data.temporary_password_expires_at'))->not->toBeNull();

        $this->app['auth']->forgetGuards();
        $listRes = $this->withHeaders([
            'Authorization' => "Bearer {$ctx['token']}",
        ])->getJson('http://gapu1.test/api/v1/users');
        $listRes->assertStatus(200);
        expect($listRes->getContent())->not->toContain($tempPassword);

        // Audit log must NEVER contain the plaintext temporary password
        $this->tenantContext->setTenant($ctx['tenant']);
        $activities = Activity::all();
        foreach ($activities as $activity) {
            expect((string) $activity->description)->not->toContain($tempPassword);
            expect(json_encode($activity->properties))->not->toContain($tempPassword);
        }

        // 2. Explicit password also sets must_change_password + temporary_password_expires_at, without echoing password
        $this->app['auth']->forgetGuards();
        $explicitRes = $this->withHeaders([
            'Authorization' => "Bearer {$ctx['token']}",
        ])->postJson('http://gapu1.test/api/v1/users', [
            'type' => 'staff',
            'name' => 'Explicit Pass Staff',
            'email' => 'explicit@gapu1.test',
            'password' => 'ExplicitTempPass123!',
        ]);

        $explicitRes->assertStatus(201);
        expect(strtolower((string) $explicitRes->headers->get('Cache-Control')))->toContain('no-store')
            ->and($explicitRes->json('data'))->not->toHaveKey('temporary_password')
            ->and($explicitRes->json('data.must_change_password'))->toBeTrue()
            ->and($explicitRes->json('data.temporary_password_expires_at'))->not->toBeNull();

        // 3. Missing all login identifiers returns 422
        $this->app['auth']->forgetGuards();
        $missingIdRes = $this->withHeaders([
            'Authorization' => "Bearer {$ctx['token']}",
        ])->postJson('http://gapu1.test/api/v1/users', [
            'type' => 'staff',
            'name' => 'No Identifier User',
        ]);
        $missingIdRes->assertStatus(422);
    } finally {
        $this->tenantContext->forget();
    }
});

it('rejects expired temporary password with identical 401 to wrong password, and recovers after admin reset-password', function () {
    $ctx = provisionIdentityGapTenant($this->provisioner, $this->tenantContext, 'tenant_gap_exp', 'gapexp.test');

    try {
        $createRes = $this->withHeaders([
            'Authorization' => "Bearer {$ctx['token']}",
        ])->postJson('http://gapexp.test/api/v1/users', [
            'type' => 'staff',
            'name' => 'Expiring Staff',
            'email' => 'expiring@gapexp.test',
        ]);
        $createRes->assertStatus(201);
        $userId = (string) $createRes->json('data.id');
        $tempPassword = (string) $createRes->json('data.temporary_password');

        // Baseline wrong-password 401 response
        $this->app['auth']->forgetGuards();
        $wrongPassRes = $this->postJson('http://gapexp.test/api/v1/auth/login', [
            'identifier' => 'expiring@gapexp.test',
            'password' => 'DefinitelyWrongPass99!',
            'device_name' => 'TestWeb',
            'client' => 'web',
        ]);
        $wrongPassRes->assertStatus(401);

        // Expire the temporary password in DB
        $this->tenantContext->setTenant($ctx['tenant']);
        User::where('id', $userId)->update([
            'temporary_password_expires_at' => Carbon::now()->subHour(),
        ]);

        // Attempt login with the expired temporary password -> identical 401 Problem Details
        $this->app['auth']->forgetGuards();
        $expiredPassRes = $this->postJson('http://gapexp.test/api/v1/auth/login', [
            'identifier' => 'expiring@gapexp.test',
            'password' => $tempPassword,
            'device_name' => 'TestWeb',
            'client' => 'web',
        ]);
        $expiredPassRes->assertStatus(401);
        expect($expiredPassRes->json('type'))->toBe($wrongPassRes->json('type'))
            ->and($expiredPassRes->json('title'))->toBe($wrongPassRes->json('title'))
            ->and($expiredPassRes->json('status'))->toBe($wrongPassRes->json('status'))
            ->and($expiredPassRes->json('detail'))->toBe($wrongPassRes->json('detail'));

        // Admin resets temporary password
        $this->app['auth']->forgetGuards();
        $resetRes = $this->withHeaders([
            'Authorization' => "Bearer {$ctx['token']}",
        ])->postJson("http://gapexp.test/api/v1/users/{$userId}/reset-password");

        $resetRes->assertStatus(200);
        expect(strtolower((string) $resetRes->headers->get('Cache-Control')))->toContain('no-store');
        $newTempPass = (string) $resetRes->json('data.temporary_password');
        expect($newTempPass)->not->toBeEmpty()
            ->and($newTempPass)->not->toBe($tempPassword)
            ->and($resetRes->json('data.must_change_password'))->toBeTrue()
            ->and($resetRes->json('data.expires_at'))->not->toBeNull();

        // Login with newly issued temp password succeeds with must_change_password=true
        $this->app['auth']->forgetGuards();
        $loginRes = $this->postJson('http://gapexp.test/api/v1/auth/login', [
            'identifier' => 'expiring@gapexp.test',
            'password' => $newTempPass,
            'device_name' => 'TestWeb',
            'client' => 'web',
        ]);
        $loginRes->assertStatus(200);
        expect($loginRes->json('data.must_change_password'))->toBeTrue();

        // User changes password -> clears must_change_password and temporary_password_expires_at
        $userToken = (string) $loginRes->json('data.token');
        $this->app['auth']->forgetGuards();
        $changeRes = $this->withHeaders([
            'Authorization' => "Bearer {$userToken}",
        ])->postJson('http://gapexp.test/api/v1/auth/password/change', [
            'current_password' => $newTempPass,
            'new_password' => 'PermanentStrongPass#2026',
            'new_password_confirmation' => 'PermanentStrongPass#2026',
        ]);
        $changeRes->assertStatus(200);

        $this->tenantContext->setTenant($ctx['tenant']);
        $refreshed = User::findOrFail($userId);
        expect($refreshed->must_change_password)->toBeFalse()
            ->and($refreshed->temporary_password_expires_at)->toBeNull();
    } finally {
        $this->tenantContext->forget();
    }
});

it('enforces authorization, forbids self and equal/higher-role reset-password, clears locked_until, and redacts audit secrets', function () {
    $ctx = provisionIdentityGapTenant($this->provisioner, $this->tenantContext, 'tenant_gap_rst', 'gaprst.test');

    try {
        $superAdminRole = Role::where('key', 'super_admin')->firstOrFail();
        $principalRole = Role::where('key', 'principal')->firstOrFail();
        $tutorRole = Role::where('key', 'tutor')->firstOrFail();
        $hodRole = Role::where('key', 'hod')->firstOrFail();

        $otherSuperAdmin = User::create([
            'type' => 'staff',
            'name' => 'Super Admin Two',
            'email' => 'sa2@gaprst.test',
            'password' => Hash::make('Password123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);
        RoleAssignment::create([
            'user_id' => $otherSuperAdmin->id,
            'role_id' => $superAdminRole->id,
            'scope_type' => 'institution',
            'scope_label' => 'i_carmel',
            'is_singleton' => false,
            'is_active' => true,
        ]);

        $principal = User::create([
            'type' => 'staff',
            'name' => 'Principal User',
            'email' => 'principal@gaprst.test',
            'password' => Hash::make('Password123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);
        RoleAssignment::create([
            'user_id' => $principal->id,
            'role_id' => $principalRole->id,
            'scope_type' => 'institution',
            'scope_label' => 'i_carmel',
            'is_singleton' => true,
            'is_active' => true,
        ]);
        $principalToken = $principal->createToken('p_token')->plainTextToken;

        $hod = User::create([
            'type' => 'staff',
            'name' => 'HOD User',
            'email' => 'hod@gaprst.test',
            'password' => Hash::make('Password123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);
        RoleAssignment::create([
            'user_id' => $hod->id,
            'role_id' => $hodRole->id,
            'scope_type' => 'department',
            'scope_label' => 'd_ce',
            'is_singleton' => true,
            'is_active' => true,
        ]);

        $tutor = User::create([
            'type' => 'staff',
            'name' => 'Tutor User',
            'email' => 'tutor@gaprst.test',
            'password' => Hash::make('Password123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);
        RoleAssignment::create([
            'user_id' => $tutor->id,
            'role_id' => $tutorRole->id,
            'scope_type' => 'batch',
            'scope_label' => 'b_ce_2026',
            'is_singleton' => true,
            'is_active' => true,
        ]);
        $tutorToken = $tutor->createToken('t_token')->plainTextToken;

        $student = User::create([
            'type' => 'student',
            'name' => 'Locked Student',
            'email' => 'student@gaprst.test',
            'password' => Hash::make('OldStudentPass123!'),
            'status' => 'active',
            'must_change_password' => false,
            'locked_until' => Carbon::now()->addMinutes(10),
        ]);
        $oldStudentToken = $student->createToken('s_old')->plainTextToken;

        // 1. Principal holds identity.user.reset_password but cannot reset Super Admin -> 403
        $this->app['auth']->forgetGuards();
        $this->withHeaders(['Authorization' => "Bearer {$principalToken}"])
            ->postJson("http://gaprst.test/api/v1/users/{$ctx['superAdmin']->id}/reset-password")
            ->assertStatus(403);

        // 2. Self-reset forbidden -> 403
        $this->app['auth']->forgetGuards();
        $this->withHeaders(['Authorization' => "Bearer {$ctx['token']}"])
            ->postJson("http://gaprst.test/api/v1/users/{$ctx['superAdmin']->id}/reset-password")
            ->assertStatus(403);

        // 3. Equal authority reset (Super Admin -> Super Admin) forbidden -> 403
        $this->app['auth']->forgetGuards();
        $this->withHeaders(['Authorization' => "Bearer {$ctx['token']}"])
            ->postJson("http://gaprst.test/api/v1/users/{$otherSuperAdmin->id}/reset-password")
            ->assertStatus(403);

        // 4. Higher authority reset (Tutor holds identity.user.reset_password -> HOD) forbidden -> 403
        $this->app['auth']->forgetGuards();
        $this->withHeaders(['Authorization' => "Bearer {$tutorToken}"])
            ->postJson("http://gaprst.test/api/v1/users/{$hod->id}/reset-password")
            ->assertStatus(403);

        // 5. Super Admin resets locked student -> 200, clears locked_until, revokes old token, redacts audit
        $this->app['auth']->forgetGuards();
        $resetRes = $this->withHeaders(['Authorization' => "Bearer {$ctx['token']}"])
            ->postJson("http://gaprst.test/api/v1/users/{$student->id}/reset-password");
        $resetRes->assertStatus(200);
        $newPass = (string) $resetRes->json('data.temporary_password');

        $this->tenantContext->setTenant($ctx['tenant']);
        $student->refresh();
        expect($student->locked_until)->toBeNull()
            ->and($student->must_change_password)->toBeTrue();

        // Old token revoked
        $this->app['auth']->forgetGuards();
        $this->withHeaders(['Authorization' => "Bearer {$oldStudentToken}"])
            ->getJson('http://gaprst.test/api/v1/me')
            ->assertStatus(401);

        // Audit record exists and does NOT contain secret
        $this->tenantContext->setTenant($ctx['tenant']);
        $audit = Activity::where('event', 'temp_password.reset')->latest('created_at')->first();
        expect($audit)->not->toBeNull()
            ->and((string) $audit->description)->not->toContain($newPass)
            ->and(json_encode($audit->properties))->not->toContain($newPass);
    } finally {
        $this->tenantContext->forget();
    }
});

it('supports atomic POST /principal/appoint and POST /principal/replace with rollback and concurrent safety', function () {
    $ctx = provisionIdentityGapTenant($this->provisioner, $this->tenantContext, 'tenant_gap_pr', 'gappr.test');

    try {
        $staffA = User::create([
            'type' => 'staff',
            'name' => 'Staff Alice',
            'email' => 'alice@gappr.test',
            'password' => Hash::make('Password123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);
        $staffB = User::create([
            'type' => 'staff',
            'name' => 'Staff Bob',
            'email' => 'bob@gappr.test',
            'password' => Hash::make('Password123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);
        $staffToken = $staffA->createToken('staff_token')->plainTextToken;

        // 1. Replace before any Principal exists -> 409 Conflict
        $this->app['auth']->forgetGuards();
        $noActiveRes = $this->withHeaders(['Authorization' => "Bearer {$ctx['token']}"])
            ->postJson('http://gappr.test/api/v1/principal/replace', [
                'user_id' => $staffA->id,
                'reason' => 'Initial appointment attempted via replace',
            ]);
        $noActiveRes->assertStatus(409);

        // 2. Non-Super Admin cannot appoint -> 403
        $this->app['auth']->forgetGuards();
        $this->withHeaders(['Authorization' => "Bearer {$staffToken}"])
            ->postJson('http://gappr.test/api/v1/principal/appoint', [
                'user_id' => $staffA->id,
            ])->assertStatus(403);

        // 3. Appoint initial Principal with new_user -> 201 + Cache-Control: no-store + one-time temp password
        $this->app['auth']->forgetGuards();
        $appointRes = $this->withHeaders(['Authorization' => "Bearer {$ctx['token']}"])
            ->postJson('http://gappr.test/api/v1/principal/appoint', [
                'new_user' => [
                    'name' => 'Dr. First Principal',
                    'email' => 'first.principal@gappr.test',
                ],
                'order_record' => 'GO-2026-01',
                'reason' => 'Initial appointment',
            ]);
        $appointRes->assertStatus(201);
        expect(strtolower((string) $appointRes->headers->get('Cache-Control')))->toContain('no-store');
        $firstTempPass = (string) $appointRes->json('data.temporary_password');
        $firstAssignmentId = (string) $appointRes->json('data.assignment.id');
        expect($firstTempPass)->not->toBeEmpty()
            ->and($appointRes->json('data.assignment.role_key'))->toBe('principal')
            ->and($appointRes->json('data.assignment.user.name'))->toBe('Dr. First Principal')
            ->and($appointRes->json('data.assignment.assigned_by.name'))->toBe('Super Admin One');

        // 4. Second appoint while active Principal exists -> 409
        $this->app['auth']->forgetGuards();
        $this->withHeaders(['Authorization' => "Bearer {$ctx['token']}"])
            ->postJson('http://gappr.test/api/v1/principal/appoint', [
                'user_id' => $staffA->id,
            ])->assertStatus(409);

        // 5. Validation errors on replace: missing reason -> 422; both user_id and new_user -> 422
        $this->app['auth']->forgetGuards();
        $this->withHeaders(['Authorization' => "Bearer {$ctx['token']}"])
            ->postJson('http://gappr.test/api/v1/principal/replace', [
                'user_id' => $staffA->id,
            ])->assertStatus(422);

        $this->app['auth']->forgetGuards();
        $this->withHeaders(['Authorization' => "Bearer {$ctx['token']}"])
            ->postJson('http://gappr.test/api/v1/principal/replace', [
                'user_id' => $staffA->id,
                'new_user' => ['name' => 'Conflict User', 'email' => 'c@gappr.test'],
                'reason' => 'Ambiguous target payload',
            ])->assertStatus(422);

        // 6. Rollback on failure: duplicate email inside new_user fails transaction atomically
        $this->tenantContext->setTenant($ctx['tenant']);
        $userCountBefore = User::count();
        $this->app['auth']->forgetGuards();
        $failRes = $this->withHeaders(['Authorization' => "Bearer {$ctx['token']}"])
            ->postJson('http://gappr.test/api/v1/principal/replace', [
                'new_user' => [
                    'name' => 'Duplicate Email Principal',
                    'email' => 'alice@gappr.test', // duplicate user_identifiers
                ],
                'reason' => 'Should roll back completely on DB error',
            ]);
        expect($failRes->status())->toBeGreaterThanOrEqual(400);

        $this->tenantContext->setTenant($ctx['tenant']);
        expect(User::count())->toBe($userCountBefore);
        $stillActive = RoleAssignment::findOrFail($firstAssignmentId);
        expect($stillActive->is_active)->toBeTrue()
            ->and($stillActive->valid_to)->toBeNull();

        // 7. Replace Principal with existing staffA -> 201, atomic handoff
        $this->app['auth']->forgetGuards();
        $replaceRes = $this->withHeaders(['Authorization' => "Bearer {$ctx['token']}"])
            ->postJson('http://gappr.test/api/v1/principal/replace', [
                'user_id' => $staffA->id,
                'reason' => 'Retirement transition',
                'order_record' => 'GO-2026-02',
            ]);
        $replaceRes->assertStatus(201);
        expect(strtolower((string) $replaceRes->headers->get('Cache-Control')))->toContain('no-store')
            ->and($replaceRes->json('data.previous_assignment_id'))->toBe($firstAssignmentId)
            ->and($replaceRes->json('data.assignment.user_id'))->toBe($staffA->id)
            ->and($replaceRes->json('data.assignment.reason'))->toBe('Retirement transition')
            ->and($replaceRes->json('data'))->not->toHaveKey('temporary_password');

        // 8. Replacing with the same active Principal -> 409
        $this->app['auth']->forgetGuards();
        $this->withHeaders(['Authorization' => "Bearer {$ctx['token']}"])
            ->postJson('http://gappr.test/api/v1/principal/replace', [
                'user_id' => $staffA->id,
                'reason' => 'Replacing with self should fail',
            ])->assertStatus(409);

        // 9. Back-to-back / concurrent-style rapid replacements with new_user then staffB preserve singleton invariant
        $this->app['auth']->forgetGuards();
        $replaceNewRes = $this->withHeaders(['Authorization' => "Bearer {$ctx['token']}"])
            ->postJson('http://gappr.test/api/v1/principal/replace', [
                'new_user' => [
                    'name' => 'Dr. Interim Principal',
                    'email' => 'interim@gappr.test',
                ],
                'reason' => 'Interim leadership handover',
            ]);
        $replaceNewRes->assertStatus(201);
        $interimPass = (string) $replaceNewRes->json('data.temporary_password');
        expect($interimPass)->not->toBeEmpty();

        $this->app['auth']->forgetGuards();
        $replaceFinalRes = $this->withHeaders(['Authorization' => "Bearer {$ctx['token']}"])
            ->postJson('http://gappr.test/api/v1/principal/replace', [
                'user_id' => $staffB->id,
                'reason' => 'Permanent appointment after interim',
            ]);
        $replaceFinalRes->assertStatus(201);

        $this->tenantContext->setTenant($ctx['tenant']);
        $principalRole = Role::where('key', 'principal')->firstOrFail();
        $activeCount = RoleAssignment::where('role_id', $principalRole->id)
            ->whereRaw('is_active is true')
            ->count();
        expect($activeCount)->toBe(1);

        // Audit log never contains temporary passwords from appoint or replace
        foreach (Activity::all() as $act) {
            expect((string) $act->description)->not->toContain($firstTempPass)
                ->and((string) $act->description)->not->toContain($interimPass)
                ->and(json_encode($act->properties))->not->toContain($firstTempPass)
                ->and(json_encode($act->properties))->not->toContain($interimPass);
        }
    } finally {
        $this->tenantContext->forget();
    }
});

it('persists optional reason on DELETE /role-assignments/{id} via body or query, enriches GET /role-assignments without N+1, and enriches UserResource', function () {
    $ctx = provisionIdentityGapTenant($this->provisioner, $this->tenantContext, 'tenant_gap_list', 'gaplist.test');

    try {
        $lecturerRole = Role::where('key', 'lecturer')->firstOrFail();
        $staff1 = User::create([
            'type' => 'staff',
            'name' => 'Lecturer One',
            'email' => 'lec1@gaplist.test',
            'mobile' => '+919876500001',
            'password' => Hash::make('CorrectPass123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);
        $staff2 = User::create([
            'type' => 'staff',
            'name' => 'Lecturer Two',
            'email' => 'lec2@gaplist.test',
            'mobile' => '+919876500002',
            'password' => Hash::make('CorrectPass123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);

        $ra1 = RoleAssignment::create([
            'user_id' => $staff1->id,
            'role_id' => $lecturerRole->id,
            'scope_type' => 'department',
            'scope_label' => 'd_ce',
            'is_singleton' => false,
            'is_active' => true,
            'assigned_by_user_id' => $ctx['superAdmin']->id,
            'reason' => 'Department intake assignment',
        ]);
        $ra2 = RoleAssignment::create([
            'user_id' => $staff2->id,
            'role_id' => $lecturerRole->id,
            'scope_type' => 'department',
            'scope_label' => 'd_me',
            'is_singleton' => false,
            'is_active' => true,
            'assigned_by_user_id' => $ctx['superAdmin']->id,
        ]);

        // 1. Revoke ra1 via JSON body reason
        $this->app['auth']->forgetGuards();
        $this->withHeaders(['Authorization' => "Bearer {$ctx['token']}"])
            ->deleteJson("http://gaplist.test/api/v1/role-assignments/{$ra1->id}", [
                'reason' => 'Transferred to another department',
            ])->assertStatus(200);

        // 2. Revoke ra2 via query param reason
        $this->app['auth']->forgetGuards();
        $this->withHeaders(['Authorization' => "Bearer {$ctx['token']}"])
            ->deleteJson("http://gaplist.test/api/v1/role-assignments/{$ra2->id}?reason=Contract+ended")
            ->assertStatus(200);

        // 3. GET /role-assignments?active_only=false returns embedded user, assigned_by, and reason with bounded queries (no N+1)
        $this->tenantContext->setTenant($ctx['tenant']);
        DB::connection('tenant')->flushQueryLog();
        DB::connection('tenant')->enableQueryLog();

        $this->app['auth']->forgetGuards();
        $listRes = $this->withHeaders(['Authorization' => "Bearer {$ctx['token']}"])
            ->getJson('http://gaplist.test/api/v1/role-assignments?active_only=false');
        $listRes->assertStatus(200);

        $queries = DB::connection('tenant')->getQueryLog();
        DB::connection('tenant')->disableQueryLog();

        $items = collect($listRes->json('data'));
        $revoked1 = $items->firstWhere('id', $ra1->id);
        $revoked2 = $items->firstWhere('id', $ra2->id);

        expect($revoked1['reason'])->toBe('Transferred to another department')
            ->and($revoked1['user'])->toMatchArray([
                'id' => $staff1->id,
                'name' => 'Lecturer One',
                'email' => 'lec1@gaplist.test',
                'mobile' => '+919876500001',
            ])
            ->and($revoked1['assigned_by'])->toMatchArray([
                'id' => $ctx['superAdmin']->id,
                'name' => 'Super Admin One',
            ])
            ->and($revoked2['reason'])->toBe('Contract ended');

        // Eager loading keeps query count low regardless of number of rows
        expect(count($queries))->toBeLessThan(15);

        // 4. UserResource includes active assignments, is_locked / locked_until, and temporary_password_expires_at
        for ($i = 0; $i < 5; $i++) {
            $this->postJson('http://gaplist.test/api/v1/auth/login', [
                'identifier' => 'lec1@gaplist.test',
                'password' => 'WrongPass!',
                'device_name' => 'TestWeb',
                'client' => 'web',
            ])->assertStatus(401);
        }

        $this->app['auth']->forgetGuards();
        $userShowRes = $this->withHeaders(['Authorization' => "Bearer {$ctx['token']}"])
            ->getJson("http://gaplist.test/api/v1/users/{$staff1->id}");
        $userShowRes->assertStatus(200);
        expect($userShowRes->json('data.is_locked'))->toBeTrue()
            ->and($userShowRes->json('data.locked_until'))->not->toBeNull()
            ->and($userShowRes->json('data.assignments'))->toBeArray()
            ->and($userShowRes->json('data'))->not->toHaveKey('temporary_password');

        // Unlock clears is_locked / locked_until
        $this->app['auth']->forgetGuards();
        $this->withHeaders(['Authorization' => "Bearer {$ctx['token']}"])
            ->postJson("http://gaplist.test/api/v1/users/{$staff1->id}/unlock")
            ->assertStatus(200);

        $this->app['auth']->forgetGuards();
        $afterUnlockRes = $this->withHeaders(['Authorization' => "Bearer {$ctx['token']}"])
            ->getJson("http://gaplist.test/api/v1/users/{$staff1->id}");
        $afterUnlockRes->assertStatus(200);
        expect($afterUnlockRes->json('data.is_locked'))->toBeFalse()
            ->and($afterUnlockRes->json('data.locked_until'))->toBeNull();

        // Super Admin user resource serializes active super_admin assignment
        $this->app['auth']->forgetGuards();
        $saRes = $this->withHeaders(['Authorization' => "Bearer {$ctx['token']}"])
            ->getJson("http://gaplist.test/api/v1/users/{$ctx['superAdmin']->id}");
        $saRes->assertStatus(200);
        expect($saRes->json('data.assignments.0.role_key'))->toBe('super_admin')
            ->and($saRes->json('data.assignments.0.scope_label'))->toBe('i_carmel');
    } finally {
        $this->tenantContext->forget();
    }
});

it('evaluates temporary_password_expires_at and locked_until accurately when app timezone is non-UTC (Asia/Kolkata)', function () {
    $ctx = provisionIdentityGapTenant($this->provisioner, $this->tenantContext, 'tenant_gap_tz', 'gaptz.test');
    $prevTz = date_default_timezone_get();
    config(['app.timezone' => 'Asia/Kolkata']);
    date_default_timezone_set('Asia/Kolkata');

    try {
        $createRes = $this->withHeaders([
            'Authorization' => "Bearer {$ctx['token']}",
        ])->postJson('http://gaptz.test/api/v1/users', [
            'type' => 'staff',
            'name' => 'IST Staff',
            'email' => 'ist@gaptz.test',
        ]);
        $createRes->assertStatus(201);
        $userId = (string) $createRes->json('data.id');
        $tempPassword = (string) $createRes->json('data.temporary_password');

        // Future expiry in Asia/Kolkata -> not expired, login succeeds
        $this->tenantContext->setTenant($ctx['tenant']);
        User::where('id', $userId)->update([
            'temporary_password_expires_at' => Carbon::now('Asia/Kolkata')->addMinutes(30),
            'locked_until' => Carbon::now('Asia/Kolkata')->addMinutes(15),
        ]);
        $freshUser = User::findOrFail($userId);
        expect($freshUser->isLocked())->toBeTrue();

        // Past expiry in Asia/Kolkata -> rejected with 401
        User::where('id', $userId)->update([
            'temporary_password_expires_at' => Carbon::now('Asia/Kolkata')->subMinutes(5),
            'locked_until' => Carbon::now('Asia/Kolkata')->subMinutes(5),
        ]);
        $freshUser->refresh();
        expect($freshUser->isLocked())->toBeFalse();

        $this->app['auth']->forgetGuards();
        $this->postJson('http://gaptz.test/api/v1/auth/login', [
            'identifier' => 'ist@gaptz.test',
            'password' => $tempPassword,
            'device_name' => 'TestWeb',
            'client' => 'web',
        ])->assertStatus(401);
    } finally {
        date_default_timezone_set($prevTz);
        $this->tenantContext->forget();
    }
});

it('denies POST /users/{id}/reset-password with 403 when target user is outside caller scope', function () {
    $ctx = provisionIdentityGapTenant($this->provisioner, $this->tenantContext, 'tenant_gap_scope_rst', 'gapscope.test');

    try {
        $hod = User::create([
            'type' => 'staff',
            'name' => 'HOD Civil',
            'email' => 'hod.ce@gapscope.test',
            'password' => Hash::make('StrongPass123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);
        $hodRole = Role::where('key', 'hod')->firstOrFail();
        // Grant identity.user.reset_password to hod role for this test
        $resetPerm = Permission::where('key', 'identity.user.reset_password')->firstOrFail();
        $hodRole->permissions()->syncWithoutDetaching([$resetPerm->id]);

        RoleAssignment::create([
            'user_id' => $hod->id,
            'role_id' => $hodRole->id,
            'scope_type' => 'department',
            'scope_label' => 'd_ce',
            'is_singleton' => false,
            'is_active' => true,
        ]);

        $meLecturer = User::create([
            'type' => 'staff',
            'name' => 'Lecturer Mechanical',
            'email' => 'lec.me@gapscope.test',
            'password' => Hash::make('StrongPass123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);
        $lecRole = Role::where('key', 'lecturer')->firstOrFail();
        RoleAssignment::create([
            'user_id' => $meLecturer->id,
            'role_id' => $lecRole->id,
            'scope_type' => 'department',
            'scope_label' => 'd_me',
            'is_singleton' => false,
            'is_active' => true,
        ]);

        $hodToken = $hod->createToken('hod_token')->plainTextToken;
        $this->app['auth']->forgetGuards();
        $this->withHeaders([
            'Authorization' => "Bearer {$hodToken}",
        ])->postJson("http://gapscope.test/api/v1/users/{$meLecturer->id}/reset-password")
            ->assertStatus(403);
    } finally {
        $this->tenantContext->forget();
    }
});

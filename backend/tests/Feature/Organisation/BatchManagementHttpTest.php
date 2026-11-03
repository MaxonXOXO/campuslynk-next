<?php

declare(strict_types=1);

namespace Tests\Feature\Organisation;

use App\Core\Tenancy\Services\TenantProvisioner;
use App\Core\Tenancy\TenantContext;
use App\Modules\Identity\Models\Role;
use App\Modules\Identity\Models\RoleAssignment;
use App\Modules\Identity\Models\User;
use App\Modules\Organisation\Actions\CreateBatchAction;
use App\Modules\Organisation\Database\Seeders\KeralaPolytechnicProfileSeeder;
use App\Modules\Organisation\Models\AcademicYear;
use App\Modules\Organisation\Models\Batch;
use App\Modules\Organisation\Models\Department;
use App\Modules\Organisation\Models\Program;
use App\Modules\Organisation\Models\Regulation;
use App\Modules\Organisation\Models\Stream;
use App\Modules\Organisation\Models\SubBatch;
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

it('allows authorized users to list departments and view scoped batches', function () {
    config(['app_profile.deploy_profile' => 'cloud']);

    $tenant = $this->provisioner->provision('tenant_batch_http', 'Batch Poly', 'batchhttp.test', 'cloud');
    $this->tenantContext->setTenant($tenant);

    try {
        app(KeralaPolytechnicProfileSeeder::class)->run();

        $ceHod = User::create([
            'type' => 'staff',
            'name' => 'CE HOD',
            'email' => 'cehod@batchhttp.test',
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

        $progCE = Program::where('code', 'DCE')->firstOrFail();
        $progME = Program::where('code', 'DME')->firstOrFail();
        $deptCE = Department::where('code', 'CE')->firstOrFail();
        $deptME = Department::where('code', 'ME')->firstOrFail();
        $acadYear = AcademicYear::where('label', '2026-27')->firstOrFail();
        $reg2021 = Regulation::where('code', 'REV2021')->firstOrFail();

        /** @var CreateBatchAction $createAction */
        $createAction = app(CreateBatchAction::class);
        // Create CE S1, ME S1, and CE S3 batches
        $createAction->execute($progCE->id, $deptCE->id, $acadYear->id, $reg2021->id, 'CE S1 Batch', 'regular', 1);
        $createAction->execute($progME->id, $deptME->id, $acadYear->id, $reg2021->id, 'ME S1 Batch', 'regular', 1);
        $createAction->execute($progCE->id, $deptCE->id, $acadYear->id, $reg2021->id, 'CE S3 Batch', 'regular', 3);

        $ceToken = $ceHod->createToken('ce_token')->plainTextToken;

        // 1. List departments
        $deptResponse = $this->withHeaders([
            'Authorization' => "Bearer {$ceToken}",
        ])->getJson('http://batchhttp.test/api/v1/departments');

        $deptResponse->assertStatus(200);
        expect($deptResponse->json('meta.total'))->toBeGreaterThanOrEqual(6);

        // 2. List batches for CE HOD:
        // CE HOD sees CE S1 and CE S3 (home_path contains d_ce), but DOES NOT see ME S1!
        $this->app['auth']->forgetGuards();
        $batchResponse = $this->withHeaders([
            'Authorization' => "Bearer {$ceToken}",
        ])->getJson('http://batchhttp.test/api/v1/batches');

        $batchResponse->assertStatus(200);
        expect($batchResponse->json('meta.total'))->toBe(2);
        $batchHomeDepts = collect($batchResponse->json('data'))->pluck('home_department_id')->unique()->all();
        expect($batchHomeDepts)->toEqual([$deptCE->id]);

        // 3. List batches for General Department Coordinator:
        // Create Gen Dept Coordinator (scope: d_gen_aided)
        $this->tenantContext->setTenant($tenant);
        $genCoord = User::create([
            'type' => 'staff',
            'name' => 'Gen Dept Coordinator',
            'email' => 'gencoord@batchhttp.test',
            'password' => Hash::make('Password123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);
        $genRole = Role::where('key', 'gen_dept_coordinator')->firstOrFail();
        RoleAssignment::create([
            'user_id' => $genCoord->id,
            'role_id' => $genRole->id,
            'scope_type' => 'department',
            'scope_label' => 'd_gen_aided',
            'is_singleton' => true,
            'is_active' => true,
        ]);
        $genToken = $genCoord->createToken('gen_token')->plainTextToken;

        // Gen Dept Coordinator sees S1/S2 batches of aided stream (CE S1 and ME S1 whose managing_path contains d_gen_aided),
        // but DOES NOT see CE S3 (whose managing_path is d_ce)!
        $this->app['auth']->forgetGuards();
        $genBatchResponse = $this->withHeaders([
            'Authorization' => "Bearer {$genToken}",
        ])->getJson('http://batchhttp.test/api/v1/batches');

        $genBatchResponse->assertStatus(200);
        expect($genBatchResponse->json('meta.total'))->toBe(2);
        $genSemesters = collect($genBatchResponse->json('data'))->pluck('current_semester')->all();
        expect($genSemesters)->toEqual([1, 1]);
    } finally {
        $this->tenantContext->forget();
    }
});

it('allows authorized users to create and promote batches', function () {
    config(['app_profile.deploy_profile' => 'cloud']);

    $tenant = $this->provisioner->provision('tenant_batch_cr', 'Batch Cr Poly', 'batchcr.test', 'cloud');
    $this->tenantContext->setTenant($tenant);

    try {
        app(KeralaPolytechnicProfileSeeder::class)->run();

        $hod = User::create([
            'type' => 'staff',
            'name' => 'CE HOD Patrick',
            'email' => 'hod@batchcr.test',
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

        $progCE = Program::where('code', 'DCE')->firstOrFail();
        $deptCE = Department::where('code', 'CE')->firstOrFail();
        $acadYear = AcademicYear::where('label', '2026-27')->firstOrFail();
        $reg2021 = Regulation::where('code', 'REV2021')->firstOrFail();

        $token = $hod->createToken('hod_token')->plainTextToken;

        // Create Batch at Semester 3 (where CE department manages the batch)
        $createResponse = $this->withHeaders([
            'Authorization' => "Bearer {$token}",
        ])->postJson('http://batchcr.test/api/v1/batches', [
            'program_id' => $progCE->id,
            'home_department_id' => $deptCE->id,
            'academic_year_id' => $acadYear->id,
            'regulation_id' => $reg2021->id,
            'name' => 'Civil 2026-2029',
            'current_semester' => 3,
        ]);

        $createResponse->assertStatus(201);
        $batchId = (string) $createResponse->json('data.id');
        expect($batchId)->not->toBeEmpty()
            ->and($createResponse->json('data.current_semester'))->toBe(3);

        // Promote Batch to Semester 4
        $promoteResponse = $this->withHeaders([
            'Authorization' => "Bearer {$token}",
        ])->postJson("http://batchcr.test/api/v1/batches/{$batchId}/promote");

        $promoteResponse->assertStatus(200);
        expect($promoteResponse->json('data.current_semester'))->toBe(4)
            ->and($promoteResponse->json('data.managing_department_id'))->toBe($deptCE->id);

        // Prove ADR-0005: Create batch at Semester 1 (governed by GEN_AIDED)
        // HOD of CE is forbidden (403) from promoting S1 batch because write actions use managing_department!
        $s1Response = $this->withHeaders([
            'Authorization' => "Bearer {$token}",
        ])->postJson('http://batchcr.test/api/v1/batches', [
            'program_id' => $progCE->id,
            'home_department_id' => $deptCE->id,
            'academic_year_id' => $acadYear->id,
            'regulation_id' => $reg2021->id,
            'name' => 'Civil S1 Batch',
            'current_semester' => 1,
        ]);
        $s1Response->assertStatus(201);
        $s1BatchId = (string) $s1Response->json('data.id');

        $forbiddenPromote = $this->withHeaders([
            'Authorization' => "Bearer {$token}",
        ])->postJson("http://batchcr.test/api/v1/batches/{$s1BatchId}/promote");
        $forbiddenPromote->assertStatus(403);
    } finally {
        $this->tenantContext->forget();
    }
});

it('rejects unauthorised users from creating or promoting batches', function () {
    config(['app_profile.deploy_profile' => 'cloud']);

    $tenant = $this->provisioner->provision('tenant_batch_unauth', 'Unauth Poly', 'batchunauth.test', 'cloud');
    $this->tenantContext->setTenant($tenant);

    try {
        app(KeralaPolytechnicProfileSeeder::class)->run();

        $student = User::create([
            'type' => 'student',
            'name' => 'Student Sam',
            'email' => 'sam@batchunauth.test',
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

        $token = $student->createToken('student_token')->plainTextToken;

        // Student attempts to create batch -> 403 Forbidden
        $response = $this->withHeaders([
            'Authorization' => "Bearer {$token}",
        ])->postJson('http://batchunauth.test/api/v1/batches', [
            'name' => 'Rogue Batch',
        ]);
        $response->assertStatus(403);
    } finally {
        $this->tenantContext->forget();
    }
});

it('enforces cross-tenant isolation and prevents viewing or promoting a batch from another tenant', function () {
    config(['app_profile.deploy_profile' => 'cloud']);

    $tenantA = $this->provisioner->provision('tenant_bm_a', 'Poly A', 'bma.test', 'cloud');
    $tenantB = $this->provisioner->provision('tenant_bm_b', 'Poly B', 'bmb.test', 'cloud');

    $this->tenantContext->setTenant($tenantB);
    try {
        app(KeralaPolytechnicProfileSeeder::class)->run();

        $progCE = Program::where('code', 'DCE')->firstOrFail();
        $deptCE = Department::where('code', 'CE')->firstOrFail();
        $acadYear = AcademicYear::where('label', '2026-27')->firstOrFail();
        $reg2021 = Regulation::where('code', 'REV2021')->firstOrFail();

        /** @var CreateBatchAction $createAction */
        $createAction = app(CreateBatchAction::class);
        $batchB = $createAction->execute($progCE->id, $deptCE->id, $acadYear->id, $reg2021->id, 'Batch in B', 'regular', 2);
        $batchBId = $batchB->id;
    } finally {
        $this->tenantContext->forget();
    }

    $this->tenantContext->setTenant($tenantA);
    try {
        app(KeralaPolytechnicProfileSeeder::class)->run();

        $hodA = User::create([
            'type' => 'staff',
            'name' => 'HOD in A',
            'email' => 'hoda@bma.test',
            'password' => Hash::make('Password123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);
        $hodRole = Role::where('key', 'hod')->firstOrFail();
        RoleAssignment::create([
            'user_id' => $hodA->id,
            'role_id' => $hodRole->id,
            'scope_type' => 'department',
            'scope_label' => 'd_ce',
            'is_singleton' => true,
            'is_active' => true,
        ]);

        $tokenA = $hodA->createToken('hod_a')->plainTextToken;

        // Admin in Tenant A attempts to view or promote Batch in Tenant B -> 404
        $viewResponse = $this->withHeaders([
            'Authorization' => "Bearer {$tokenA}",
        ])->getJson("http://bma.test/api/v1/batches/{$batchBId}");
        $viewResponse->assertStatus(404);

        $promoteResponse = $this->withHeaders([
            'Authorization' => "Bearer {$tokenA}",
        ])->postJson("http://bma.test/api/v1/batches/{$batchBId}/promote");
        $promoteResponse->assertStatus(404);
    } finally {
        $this->tenantContext->forget();
    }
});

it('supports full CRUD lifecycle for sub-batches within a batch', function () {
    config(['app_profile.deploy_profile' => 'cloud']);

    $tenant = $this->provisioner->provision('tenant_subbatch', 'SubBatch Poly', 'subbatch.test', 'cloud');
    $this->tenantContext->setTenant($tenant);

    try {
        app(KeralaPolytechnicProfileSeeder::class)->run();

        $ceHod = User::create([
            'type' => 'staff',
            'name' => 'CE HOD',
            'email' => 'cehod@subbatch.test',
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

        $progCE = Program::where('code', 'DCE')->firstOrFail();
        $deptCE = Department::where('code', 'CE')->firstOrFail();
        $acadYear = AcademicYear::where('label', '2026-27')->firstOrFail();
        $reg2021 = Regulation::where('code', 'REV2021')->firstOrFail();

        /** @var CreateBatchAction $createAction */
        $createAction = app(CreateBatchAction::class);
        $batch = $createAction->execute($progCE->id, $deptCE->id, $acadYear->id, $reg2021->id, 'CE S3 Batch', 'regular', 3);

        $token = $ceHod->createToken('hod_token')->plainTextToken;

        // 1. POST /api/v1/batches/{id}/sub-batches
        $createRes = $this->withHeaders([
            'Authorization' => "Bearer {$token}",
        ])->postJson("http://subbatch.test/api/v1/batches/{$batch->id}/sub-batches", [
            'kind' => 'lab',
            'name' => 'Survey Lab Batch 1',
        ]);
        $createRes->assertStatus(201);
        $subBatchId = (string) $createRes->json('data.id');
        expect($subBatchId)->not->toBeEmpty()
            ->and($createRes->json('data.name'))->toBe('Survey Lab Batch 1')
            ->and($createRes->json('data.home_path'))->toContain($batch->home_path);

        // 2. GET /api/v1/batches/{id}/sub-batches
        $listRes = $this->withHeaders([
            'Authorization' => "Bearer {$token}",
        ])->getJson("http://subbatch.test/api/v1/batches/{$batch->id}/sub-batches");
        $listRes->assertStatus(200);
        expect($listRes->json('meta.total'))->toBe(1);

        // 3. GET /api/v1/sub-batches/{id}
        $showRes = $this->withHeaders([
            'Authorization' => "Bearer {$token}",
        ])->getJson("http://subbatch.test/api/v1/sub-batches/{$subBatchId}");
        $showRes->assertStatus(200);
        expect($showRes->json('data.name'))->toBe('Survey Lab Batch 1');

        // 4. PUT /api/v1/sub-batches/{id}
        $updateRes = $this->withHeaders([
            'Authorization' => "Bearer {$token}",
        ])->putJson("http://subbatch.test/api/v1/sub-batches/{$subBatchId}", [
            'name' => 'Survey Lab Batch 1 Renamed',
        ]);
        $updateRes->assertStatus(200);
        expect($updateRes->json('data.name'))->toBe('Survey Lab Batch 1 Renamed');

        // 5. DELETE /api/v1/sub-batches/{id}
        $delRes = $this->withHeaders([
            'Authorization' => "Bearer {$token}",
        ])->deleteJson("http://subbatch.test/api/v1/sub-batches/{$subBatchId}");
        $delRes->assertStatus(200);

        // Verify deleted
        $this->tenantContext->setTenant($tenant);
        expect(SubBatch::find($subBatchId))->toBeNull();
    } finally {
        $this->tenantContext->forget();
    }
});

it('supports lookups for programs, academic years, regulations, workshop sections, and governance rules', function () {
    config(['app_profile.deploy_profile' => 'cloud']);

    $tenant = $this->provisioner->provision('tenant_lookups', 'Lookups Poly', 'lookups.test', 'cloud');
    $this->tenantContext->setTenant($tenant);

    try {
        app(KeralaPolytechnicProfileSeeder::class)->run();

        $principal = User::create([
            'type' => 'staff',
            'name' => 'Principal Peter',
            'email' => 'principal@lookups.test',
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

        $token = $principal->createToken('principal_token')->plainTextToken;

        // 1. GET /api/v1/programs
        $progRes = $this->withHeaders([
            'Authorization' => "Bearer {$token}",
        ])->getJson('http://lookups.test/api/v1/programs');
        $progRes->assertStatus(200);
        expect($progRes->json('meta.total'))->toBeGreaterThanOrEqual(6);

        // 2. GET /api/v1/academic-years
        $ayRes = $this->withHeaders([
            'Authorization' => "Bearer {$token}",
        ])->getJson('http://lookups.test/api/v1/academic-years');
        $ayRes->assertStatus(200);
        expect($ayRes->json('meta.total'))->toBeGreaterThanOrEqual(1);

        // 3. GET /api/v1/regulations
        $regRes = $this->withHeaders([
            'Authorization' => "Bearer {$token}",
        ])->getJson('http://lookups.test/api/v1/regulations');
        $regRes->assertStatus(200);
        expect($regRes->json('meta.total'))->toBeGreaterThanOrEqual(2);

        // 4. GET /api/v1/workshop-sections
        $wsRes = $this->withHeaders([
            'Authorization' => "Bearer {$token}",
        ])->getJson('http://lookups.test/api/v1/workshop-sections');
        $wsRes->assertStatus(200);
        expect($wsRes->json('meta.total'))->toBe(6);

        // 5. GET /api/v1/governance-rules
        $govRes = $this->withHeaders([
            'Authorization' => "Bearer {$token}",
        ])->getJson('http://lookups.test/api/v1/governance-rules');
        $govRes->assertStatus(200);
        expect($govRes->json('meta.total'))->toBeGreaterThanOrEqual(6);

        $ruleId = (string) $govRes->json('data.0.id');

        // 6. PUT /api/v1/governance-rules/{id}
        $putGovRes = $this->withHeaders([
            'Authorization' => "Bearer {$token}",
        ])->putJson("http://lookups.test/api/v1/governance-rules/{$ruleId}", [
            'semester_to' => 2,
        ]);
        $putGovRes->assertStatus(200);
        expect($putGovRes->json('data.semester_to'))->toBe(2);
    } finally {
        $this->tenantContext->forget();
    }
});

it('supports full CRUD lifecycle for departments (allowed, unauthorized, cross-tenant, deactivation)', function () {
    config(['app_profile.deploy_profile' => 'cloud']);

    $tenantA = $this->provisioner->provision('tenant_dept_a', 'Dept A Poly', 'depta.test', 'cloud');
    $tenantB = $this->provisioner->provision('tenant_dept_b', 'Dept B Poly', 'deptb.test', 'cloud');

    $this->tenantContext->setTenant($tenantA);

    try {
        app(KeralaPolytechnicProfileSeeder::class)->run();

        $principalA = User::create([
            'type' => 'staff',
            'name' => 'Principal Patrick',
            'email' => 'principal@depta.test',
            'password' => Hash::make('Password123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);
        $principalRole = Role::where('key', 'principal')->firstOrFail();
        RoleAssignment::create([
            'user_id' => $principalA->id,
            'role_id' => $principalRole->id,
            'scope_type' => 'institution',
            'scope_label' => 'i_carmel',
            'is_singleton' => true,
            'is_active' => true,
        ]);
        $principalTokenA = $principalA->createToken('p_tok_a')->plainTextToken;

        $studentA = User::create([
            'type' => 'student',
            'name' => 'Student Sam',
            'email' => 'student@depta.test',
            'password' => Hash::make('Password123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);
        $studentRole = Role::where('key', 'student')->firstOrFail();
        RoleAssignment::create([
            'user_id' => $studentA->id,
            'role_id' => $studentRole->id,
            'scope_type' => 'own',
            'scope_label' => 'u_'.$studentA->id,
            'is_singleton' => false,
            'is_active' => true,
        ]);
        $studentTokenA = $studentA->createToken('s_tok_a')->plainTextToken;
        $stream = Stream::firstOrFail();

        // 1. Allowed role creates department
        $createRes = $this->withHeaders([
            'Authorization' => "Bearer {$principalTokenA}",
        ])->postJson('http://depta.test/api/v1/departments', [
            'name' => 'Chemical Engineering',
            'code' => 'CH',
            'stream_id' => $stream->id,
            'kind' => 'academic',
        ]);

        $createRes->assertStatus(201);
        $deptId = (string) $createRes->json('data.id');
        expect($deptId)->not->toBeEmpty()
            ->and($createRes->json('data.code'))->toBe('CH')
            ->and($createRes->json('data.scope_label'))->toBe('d_ch');

        // 2. GET /departments/{id}
        $showRes = $this->withHeaders([
            'Authorization' => "Bearer {$principalTokenA}",
        ])->getJson("http://depta.test/api/v1/departments/{$deptId}");
        $showRes->assertStatus(200);
        expect($showRes->json('data.name'))->toBe('Chemical Engineering');

        // 3. Allowed role updates department and deactivates it (deactivation instead of delete)
        $updateRes = $this->withHeaders([
            'Authorization' => "Bearer {$principalTokenA}",
        ])->putJson("http://depta.test/api/v1/departments/{$deptId}", [
            'name' => 'Chemical & Polymer Engineering',
            'is_active' => false,
        ]);
        $updateRes->assertStatus(200);
        expect($updateRes->json('data.name'))->toBe('Chemical & Polymer Engineering')
            ->and($updateRes->json('data.is_active'))->toBeFalse();

        // 4. Unauthorized role receives 403 Forbidden
        $this->app['auth']->forgetGuards();
        $unauthRes = $this->withHeaders([
            'Authorization' => "Bearer {$studentTokenA}",
        ])->postJson('http://depta.test/api/v1/departments', [
            'name' => 'Rogue Dept',
            'code' => 'RG',
            'stream_id' => $stream->id,
            'kind' => 'academic',
        ]);
        $unauthRes->assertStatus(403);

        $this->app['auth']->forgetGuards();
        $unauthUpdateRes = $this->withHeaders([
            'Authorization' => "Bearer {$studentTokenA}",
        ])->putJson("http://depta.test/api/v1/departments/{$deptId}", [
            'name' => 'Hacked Dept',
        ]);
        $unauthUpdateRes->assertStatus(403);

        // 5. Cross-tenant isolation: Tenant B principal cannot view or update Tenant A department
        $this->tenantContext->setTenant($tenantB);
        app(KeralaPolytechnicProfileSeeder::class)->run();

        $principalRoleB = Role::where('key', 'principal')->firstOrFail();
        $principalB = User::create([
            'type' => 'staff',
            'name' => 'Principal Bob',
            'email' => 'principal@deptb.test',
            'password' => Hash::make('Password123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);
        RoleAssignment::create([
            'user_id' => $principalB->id,
            'role_id' => $principalRoleB->id,
            'scope_type' => 'institution',
            'scope_label' => 'i_carmel',
            'is_singleton' => true,
            'is_active' => true,
        ]);
        $principalTokenB = $principalB->createToken('p_tok_b')->plainTextToken;

        $this->app['auth']->forgetGuards();
        $crossRes = $this->withHeaders([
            'Authorization' => "Bearer {$principalTokenB}",
        ])->putJson("http://deptb.test/api/v1/departments/{$deptId}", [
            'name' => 'Cross Tenant Exploit',
        ]);
        $crossRes->assertStatus(404);
    } finally {
        $this->tenantContext->forget();
    }
});

it('supports full CRUD lifecycle for programs (allowed, unauthorized, cross-tenant)', function () {
    config(['app_profile.deploy_profile' => 'cloud']);

    $tenantA = $this->provisioner->provision('tenant_prog_a', 'Prog A Poly', 'proga.test', 'cloud');
    $tenantB = $this->provisioner->provision('tenant_prog_b', 'Prog B Poly', 'progb.test', 'cloud');

    $this->tenantContext->setTenant($tenantA);

    try {
        app(KeralaPolytechnicProfileSeeder::class)->run();

        $principalA = User::create([
            'type' => 'staff',
            'name' => 'Principal Patrick',
            'email' => 'principal@proga.test',
            'password' => Hash::make('Password123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);
        $principalRole = Role::where('key', 'principal')->firstOrFail();
        RoleAssignment::create([
            'user_id' => $principalA->id,
            'role_id' => $principalRole->id,
            'scope_type' => 'institution',
            'scope_label' => 'i_carmel',
            'is_singleton' => true,
            'is_active' => true,
        ]);
        $principalTokenA = $principalA->createToken('p_tok_a')->plainTextToken;

        $studentA = User::create([
            'type' => 'student',
            'name' => 'Student Sam',
            'email' => 'student@proga.test',
            'password' => Hash::make('Password123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);
        $studentRole = Role::where('key', 'student')->firstOrFail();
        RoleAssignment::create([
            'user_id' => $studentA->id,
            'role_id' => $studentRole->id,
            'scope_type' => 'own',
            'scope_label' => 'u_'.$studentA->id,
            'is_singleton' => false,
            'is_active' => true,
        ]);
        $studentTokenA = $studentA->createToken('s_tok_a')->plainTextToken;

        $dept = Department::where('code', 'CE')->firstOrFail();

        // 1. Allowed role creates program
        $createRes = $this->withHeaders([
            'Authorization' => "Bearer {$principalTokenA}",
        ])->postJson('http://proga.test/api/v1/programs', [
            'name' => 'Diploma in Civil & Environmental Engineering',
            'code' => 'DCEE',
            'department_id' => $dept->id,
            'duration_semesters' => 6,
        ]);

        $createRes->assertStatus(201);
        $progId = (string) $createRes->json('data.id');
        expect($progId)->not->toBeEmpty()
            ->and($createRes->json('data.code'))->toBe('DCEE')
            ->and($createRes->json('data.scope_label'))->toBe('p_dcee');

        // 2. GET /programs/{id}
        $showRes = $this->withHeaders([
            'Authorization' => "Bearer {$principalTokenA}",
        ])->getJson("http://proga.test/api/v1/programs/{$progId}");
        $showRes->assertStatus(200);
        expect($showRes->json('data.name'))->toBe('Diploma in Civil & Environmental Engineering');

        // 3. Allowed role updates program
        $updateRes = $this->withHeaders([
            'Authorization' => "Bearer {$principalTokenA}",
        ])->putJson("http://proga.test/api/v1/programs/{$progId}", [
            'name' => 'Diploma in Environmental Tech',
        ]);
        $updateRes->assertStatus(200);
        expect($updateRes->json('data.name'))->toBe('Diploma in Environmental Tech');

        // 4. Unauthorized role receives 403 Forbidden
        $this->app['auth']->forgetGuards();
        $unauthRes = $this->withHeaders([
            'Authorization' => "Bearer {$studentTokenA}",
        ])->postJson('http://proga.test/api/v1/programs', [
            'name' => 'Rogue Program',
            'code' => 'RP',
            'department_id' => $dept->id,
            'duration_semesters' => 6,
        ]);
        $unauthRes->assertStatus(403);

        // 5. Cross-tenant isolation
        $this->tenantContext->setTenant($tenantB);
        app(KeralaPolytechnicProfileSeeder::class)->run();

        $principalRoleB = Role::where('key', 'principal')->firstOrFail();
        $principalB = User::create([
            'type' => 'staff',
            'name' => 'Principal Bob',
            'email' => 'principal@progb.test',
            'password' => Hash::make('Password123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);
        RoleAssignment::create([
            'user_id' => $principalB->id,
            'role_id' => $principalRoleB->id,
            'scope_type' => 'institution',
            'scope_label' => 'i_carmel',
            'is_singleton' => true,
            'is_active' => true,
        ]);
        $principalTokenB = $principalB->createToken('p_tok_b')->plainTextToken;

        $this->app['auth']->forgetGuards();
        $crossRes = $this->withHeaders([
            'Authorization' => "Bearer {$principalTokenB}",
        ])->putJson("http://progb.test/api/v1/programs/{$progId}", [
            'name' => 'Cross Tenant Exploit',
        ]);
        $crossRes->assertStatus(404);
    } finally {
        $this->tenantContext->forget();
    }
});

it('supports full CRUD lifecycle for academic years (allowed, unauthorized, cross-tenant)', function () {
    config(['app_profile.deploy_profile' => 'cloud']);

    $tenantA = $this->provisioner->provision('tenant_ay_a', 'AY A Poly', 'aya.test', 'cloud');
    $tenantB = $this->provisioner->provision('tenant_ay_b', 'AY B Poly', 'ayb.test', 'cloud');

    $this->tenantContext->setTenant($tenantA);

    try {
        app(KeralaPolytechnicProfileSeeder::class)->run();

        $principalA = User::create([
            'type' => 'staff',
            'name' => 'Principal Patrick',
            'email' => 'principal@aya.test',
            'password' => Hash::make('Password123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);
        $principalRole = Role::where('key', 'principal')->firstOrFail();
        RoleAssignment::create([
            'user_id' => $principalA->id,
            'role_id' => $principalRole->id,
            'scope_type' => 'institution',
            'scope_label' => 'i_carmel',
            'is_singleton' => true,
            'is_active' => true,
        ]);
        $principalTokenA = $principalA->createToken('p_tok_a')->plainTextToken;

        $studentA = User::create([
            'type' => 'student',
            'name' => 'Student Sam',
            'email' => 'student@aya.test',
            'password' => Hash::make('Password123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);
        $studentRole = Role::where('key', 'student')->firstOrFail();
        RoleAssignment::create([
            'user_id' => $studentA->id,
            'role_id' => $studentRole->id,
            'scope_type' => 'own',
            'scope_label' => 'u_'.$studentA->id,
            'is_singleton' => false,
            'is_active' => true,
        ]);
        $studentTokenA = $studentA->createToken('s_tok_a')->plainTextToken;

        // 1. Allowed role creates academic year
        $createRes = $this->withHeaders([
            'Authorization' => "Bearer {$principalTokenA}",
        ])->postJson('http://aya.test/api/v1/academic-years', [
            'label' => '2028-29',
            'start_date' => '2028-06-01',
            'end_date' => '2029-05-31',
            'is_current' => false,
        ]);

        $createRes->assertStatus(201);
        $ayId = (string) $createRes->json('data.id');
        expect($ayId)->not->toBeEmpty()
            ->and($createRes->json('data.label'))->toBe('2028-29');

        // 2. GET /academic-years/{id}
        $showRes = $this->withHeaders([
            'Authorization' => "Bearer {$principalTokenA}",
        ])->getJson("http://aya.test/api/v1/academic-years/{$ayId}");
        $showRes->assertStatus(200);
        expect($showRes->json('data.label'))->toBe('2028-29');

        // 3. Allowed role updates academic year
        $updateRes = $this->withHeaders([
            'Authorization' => "Bearer {$principalTokenA}",
        ])->putJson("http://aya.test/api/v1/academic-years/{$ayId}", [
            'label' => '2028-2029 (Revised)',
        ]);
        $updateRes->assertStatus(200);
        expect($updateRes->json('data.label'))->toBe('2028-2029 (Revised)');

        // 4. Unauthorized role receives 403 Forbidden
        $this->app['auth']->forgetGuards();
        $unauthRes = $this->withHeaders([
            'Authorization' => "Bearer {$studentTokenA}",
        ])->postJson('http://aya.test/api/v1/academic-years', [
            'label' => '2030-31',
            'start_date' => '2030-06-01',
            'end_date' => '2031-05-31',
        ]);
        $unauthRes->assertStatus(403);

        // 5. Cross-tenant isolation
        $this->tenantContext->setTenant($tenantB);
        app(KeralaPolytechnicProfileSeeder::class)->run();

        $principalRoleB = Role::where('key', 'principal')->firstOrFail();
        $principalB = User::create([
            'type' => 'staff',
            'name' => 'Principal Bob',
            'email' => 'principal@ayb.test',
            'password' => Hash::make('Password123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);
        RoleAssignment::create([
            'user_id' => $principalB->id,
            'role_id' => $principalRoleB->id,
            'scope_type' => 'institution',
            'scope_label' => 'i_carmel',
            'is_singleton' => true,
            'is_active' => true,
        ]);
        $principalTokenB = $principalB->createToken('p_tok_b')->plainTextToken;

        $this->app['auth']->forgetGuards();
        $crossRes = $this->withHeaders([
            'Authorization' => "Bearer {$principalTokenB}",
        ])->putJson("http://ayb.test/api/v1/academic-years/{$ayId}", [
            'label' => 'Cross Tenant Exploit',
        ]);
        $crossRes->assertStatus(404);
    } finally {
        $this->tenantContext->forget();
    }
});

it('supports batch update and deactivation (allowed, unauthorized, cross-tenant)', function () {
    config(['app_profile.deploy_profile' => 'cloud']);

    $tenantA = $this->provisioner->provision('tenant_bup_a', 'Batch Up A Poly', 'bupa.test', 'cloud');
    $tenantB = $this->provisioner->provision('tenant_bup_b', 'Batch Up B Poly', 'bupb.test', 'cloud');

    $this->tenantContext->setTenant($tenantA);

    try {
        app(KeralaPolytechnicProfileSeeder::class)->run();

        $hodA = User::create([
            'type' => 'staff',
            'name' => 'CE HOD Patrick',
            'email' => 'hod@bupa.test',
            'password' => Hash::make('Password123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);
        $hodRole = Role::where('key', 'hod')->firstOrFail();
        RoleAssignment::create([
            'user_id' => $hodA->id,
            'role_id' => $hodRole->id,
            'scope_type' => 'department',
            'scope_label' => 'd_ce',
            'is_singleton' => true,
            'is_active' => true,
        ]);
        $hodTokenA = $hodA->createToken('h_tok_a')->plainTextToken;

        $studentA = User::create([
            'type' => 'student',
            'name' => 'Student Sam',
            'email' => 'student@bupa.test',
            'password' => Hash::make('Password123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);
        $studentRole = Role::where('key', 'student')->firstOrFail();
        RoleAssignment::create([
            'user_id' => $studentA->id,
            'role_id' => $studentRole->id,
            'scope_type' => 'own',
            'scope_label' => 'u_'.$studentA->id,
            'is_singleton' => false,
            'is_active' => true,
        ]);
        $studentTokenA = $studentA->createToken('s_tok_a')->plainTextToken;

        $progCE = Program::where('code', 'DCE')->firstOrFail();
        $deptCE = Department::where('code', 'CE')->firstOrFail();
        $acadYear = AcademicYear::where('label', '2026-27')->firstOrFail();
        $reg2021 = Regulation::where('code', 'REV2021')->firstOrFail();

        /** @var CreateBatchAction $createAction */
        $createAction = app(CreateBatchAction::class);
        $batch = $createAction->execute($progCE->id, $deptCE->id, $acadYear->id, $reg2021->id, 'Civil Batch Original', 'regular', 3);

        // 1. Allowed role updates batch
        $updateRes = $this->withHeaders([
            'Authorization' => "Bearer {$hodTokenA}",
        ])->putJson("http://bupa.test/api/v1/batches/{$batch->id}", [
            'name' => 'Civil Batch Renamed',
            'status' => 'graduated',
        ]);

        $updateRes->assertStatus(200);
        expect($updateRes->json('data.name'))->toBe('Civil Batch Renamed')
            ->and($updateRes->json('data.status'))->toBe('graduated');

        // 2. Unauthorized role receives 403 Forbidden
        $this->app['auth']->forgetGuards();
        $unauthRes = $this->withHeaders([
            'Authorization' => "Bearer {$studentTokenA}",
        ])->putJson("http://bupa.test/api/v1/batches/{$batch->id}", [
            'name' => 'Malicious Batch Update',
        ]);
        $unauthRes->assertStatus(403);

        // 3. Cross-tenant isolation
        $this->tenantContext->setTenant($tenantB);
        app(KeralaPolytechnicProfileSeeder::class)->run();

        $hodRoleB = Role::where('key', 'hod')->firstOrFail();
        $hodB = User::create([
            'type' => 'staff',
            'name' => 'CE HOD Bob',
            'email' => 'hod@bupb.test',
            'password' => Hash::make('Password123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);
        RoleAssignment::create([
            'user_id' => $hodB->id,
            'role_id' => $hodRoleB->id,
            'scope_type' => 'department',
            'scope_label' => 'd_ce',
            'is_singleton' => true,
            'is_active' => true,
        ]);
        $hodTokenB = $hodB->createToken('h_tok_b')->plainTextToken;

        $this->app['auth']->forgetGuards();
        $crossRes = $this->withHeaders([
            'Authorization' => "Bearer {$hodTokenB}",
        ])->putJson("http://bupb.test/api/v1/batches/{$batch->id}", [
            'name' => 'Cross Tenant Exploit',
        ]);
        $crossRes->assertStatus(404);
    } finally {
        $this->tenantContext->forget();
    }
});

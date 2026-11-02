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
        $createAction->execute($progCE->id, $deptCE->id, $acadYear->id, $reg2021->id, 'CE S1 Batch', 'regular', 1);
        $createAction->execute($progME->id, $deptME->id, $acadYear->id, $reg2021->id, 'ME S1 Batch', 'regular', 1);

        $token = $ceHod->createToken('ce_token')->plainTextToken;

        // 1. List departments
        $deptResponse = $this->withHeaders([
            'Authorization' => "Bearer {$token}",
        ])->getJson('http://batchhttp.test/api/v1/departments');

        $deptResponse->assertStatus(200);
        expect($deptResponse->json('meta.total'))->toBeGreaterThanOrEqual(6);

        // 2. List batches (visibleTo ensures CE HOD sees ONLY the CE batch, not the ME batch)
        $batchResponse = $this->withHeaders([
            'Authorization' => "Bearer {$token}",
        ])->getJson('http://batchhttp.test/api/v1/batches');

        $batchResponse->assertStatus(200);
        expect($batchResponse->json('meta.total'))->toBe(1)
            ->and($batchResponse->json('data.0.home_department_id'))->toBe($deptCE->id);
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

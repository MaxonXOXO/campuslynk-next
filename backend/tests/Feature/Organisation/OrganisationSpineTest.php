<?php

declare(strict_types=1);

namespace Tests\Feature\Organisation;

use App\Core\Tenancy\Services\TenantProvisioner;
use App\Core\Tenancy\TenantContext;
use App\Modules\Organisation\Actions\CreateBatchAction;
use App\Modules\Organisation\Actions\PromoteBatchSemesterAction;
use App\Modules\Organisation\Database\Seeders\KeralaPolytechnicProfileSeeder;
use App\Modules\Organisation\Database\Seeders\TenantBaselineSeeder;
use App\Modules\Organisation\Events\BatchSemesterPromoted;
use App\Modules\Organisation\Models\AcademicYear;
use App\Modules\Organisation\Models\Batch;
use App\Modules\Organisation\Models\Department;
use App\Modules\Organisation\Models\DepartmentSemesterGovernance;
use App\Modules\Organisation\Models\Program;
use App\Modules\Organisation\Models\Regulation;
use Carbon\Carbon;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
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

it('creates tenant database with ltree and btree_gist extensions enabled under tenant role', function () {
    config(['app_profile.deploy_profile' => 'cloud']);

    $tenant = $this->provisioner->provision('tenant_ext', 'Extension Poly', 'ext.test', 'cloud');
    $this->tenantContext->setTenant($tenant);

    try {
        $extensions = DB::connection('tenant')->select("SELECT extname FROM pg_extension WHERE extname IN ('ltree', 'btree_gist')");
        $names = array_map(fn ($row) => $row->extname, $extensions);

        expect($names)->toContain('ltree')
            ->toContain('btree_gist');
    } finally {
        $this->tenantContext->forget();
    }
});

it('constructs dual ltree scope paths correctly for S1 and S2 batches', function () {
    config(['app_profile.deploy_profile' => 'cloud']);

    $tenant = $this->provisioner->provision('tenant_paths', 'Path Poly', 'path.test', 'cloud');
    $this->tenantContext->setTenant($tenant);

    try {
        app(KeralaPolytechnicProfileSeeder::class)->run();

        $progCE = Program::where('code', 'DCE')->firstOrFail();
        $deptCE = Department::where('code', 'CE')->firstOrFail();
        $deptGenAided = Department::where('code', 'GEN_AIDED')->firstOrFail();
        $acadYear = AcademicYear::where('label', '2026-27')->firstOrFail();
        $reg2021 = Regulation::where('code', 'REV2021')->firstOrFail();

        /** @var CreateBatchAction $action */
        $action = app(CreateBatchAction::class);

        // Create CE Batch in Semester 2 (Governed by General Aided Department)
        $batch = $action->execute(
            programId: $progCE->id,
            homeDepartmentId: $deptCE->id,
            academicYearId: $acadYear->id,
            regulationId: $reg2021->id,
            name: 'Civil 2026-29',
            entryType: 'regular',
            currentSemester: 2
        );

        expect($batch->managing_department_id)->toBe($deptGenAided->id)
            ->and($batch->home_department_id)->toBe($deptCE->id)
            ->and($batch->home_path)->toContain('d_ce')
            ->and($batch->home_path)->not->toContain('d_gen_aided')
            ->and($batch->managing_path)->toContain('d_gen_aided')
            ->and($batch->managing_path)->not->toContain('d_ce');

        // Verify ltree queries work natively in PostgreSQL
        $homeMatch = DB::connection('tenant')->selectOne(
            "SELECT count(*) as cnt FROM batches WHERE id = ? AND home_path ~ '*.d_ce.*'",
            [$batch->id]
        );
        expect((int) $homeMatch->cnt)->toBe(1);

        $managingMatch = DB::connection('tenant')->selectOne(
            "SELECT count(*) as cnt FROM batches WHERE id = ? AND managing_path ~ '*.d_gen_aided.*'",
            [$batch->id]
        );
        expect((int) $managingMatch->cnt)->toBe(1);
    } finally {
        $this->tenantContext->forget();
    }
});

it('promotes batch semester and dynamically updates managing department and path', function () {
    config(['app_profile.deploy_profile' => 'cloud']);

    $tenant = $this->provisioner->provision('tenant_promo', 'Promotion Poly', 'promo.test', 'cloud');
    $this->tenantContext->setTenant($tenant);

    try {
        app(KeralaPolytechnicProfileSeeder::class)->run();

        Event::fake([BatchSemesterPromoted::class]);

        $progCE = Program::where('code', 'DCE')->firstOrFail();
        $deptCE = Department::where('code', 'CE')->firstOrFail();
        $deptGenAided = Department::where('code', 'GEN_AIDED')->firstOrFail();
        $acadYear = AcademicYear::where('label', '2026-27')->firstOrFail();
        $reg2021 = Regulation::where('code', 'REV2021')->firstOrFail();

        /** @var CreateBatchAction $createAction */
        $createAction = app(CreateBatchAction::class);
        $batch = $createAction->execute(
            programId: $progCE->id,
            homeDepartmentId: $deptCE->id,
            academicYearId: $acadYear->id,
            regulationId: $reg2021->id,
            name: 'Civil 2026-29',
            entryType: 'regular',
            currentSemester: 2
        );

        expect($batch->current_semester)->toBe(2)
            ->and($batch->managing_department_id)->toBe($deptGenAided->id)
            ->and($batch->managing_path)->toContain('d_gen_aided');

        /** @var PromoteBatchSemesterAction $promoteAction */
        $promoteAction = app(PromoteBatchSemesterAction::class);
        $promotedBatch = $promoteAction->execute($batch);

        expect($promotedBatch->current_semester)->toBe(3)
            ->and($promotedBatch->managing_department_id)->toBe($deptCE->id)
            ->and($promotedBatch->managing_path)->toContain('d_ce')
            ->and($promotedBatch->managing_path)->not->toContain('d_gen_aided')
            ->and($promotedBatch->home_path)->toContain('d_ce');

        Event::assertDispatched(BatchSemesterPromoted::class, function ($event) use ($batch, $deptGenAided, $deptCE) {
            return $event->batch->id === $batch->id
                && $event->previousSemester === 2
                && $event->newSemester === 3
                && $event->previousManagingDepartmentId === $deptGenAided->id
                && $event->newManagingDepartmentId === $deptCE->id;
        });
    } finally {
        $this->tenantContext->forget();
    }
});

it('rejects overlapping semester governance ranges for the same home department', function () {
    config(['app_profile.deploy_profile' => 'cloud']);

    $tenant = $this->provisioner->provision('tenant_excl_gov', 'Gov Poly', 'gov.test', 'cloud');
    $this->tenantContext->setTenant($tenant);

    try {
        app(KeralaPolytechnicProfileSeeder::class)->run();

        $deptCE = Department::where('code', 'CE')->firstOrFail();
        $deptGenAided = Department::where('code', 'GEN_AIDED')->firstOrFail();

        // S1 to S2 is already governed by GEN_AIDED.
        // Attempting to insert S2 to S4 for CE must trigger btree_gist exclusion violation
        expect(function () use ($deptCE, $deptGenAided) {
            DepartmentSemesterGovernance::create([
                'home_department_id' => $deptCE->id,
                'managing_department_id' => $deptGenAided->id,
                'semester_from' => 2,
                'semester_to' => 4,
            ]);
        })->toThrow(QueryException::class);
    } finally {
        $this->tenantContext->forget();
    }
});

it('rejects overlapping academic calendar year dates', function () {
    config(['app_profile.deploy_profile' => 'cloud']);

    $tenant = $this->provisioner->provision('tenant_excl_acad', 'Acad Poly', 'acad.test', 'cloud');
    $this->tenantContext->setTenant($tenant);

    try {
        AcademicYear::create([
            'label' => '2026-27',
            'start_date' => Carbon::parse('2026-06-01'),
            'end_date' => Carbon::parse('2027-05-31'),
            'is_current' => true,
        ]);

        // Attempting to insert overlapping calendar range
        expect(function () {
            AcademicYear::create([
                'label' => '2027-28-Conflict',
                'start_date' => Carbon::parse('2027-01-01'), // Overlaps with 2026-06-01 to 2027-05-31
                'end_date' => Carbon::parse('2027-12-31'),
                'is_current' => false,
            ]);
        })->toThrow(QueryException::class);
    } finally {
        $this->tenantContext->forget();
    }
});

it('runs TenantBaselineSeeder and KeralaPolytechnicProfileSeeder idempotently without duplicate rows or errors', function () {
    config(['app_profile.deploy_profile' => 'cloud']);

    $tenant = $this->provisioner->provision('tenant_idemp', 'Idemp Poly', 'idemp.test', 'cloud');
    $this->tenantContext->setTenant($tenant);

    try {
        // Run seeders first time
        app(TenantBaselineSeeder::class)->run();
        app(KeralaPolytechnicProfileSeeder::class)->run();

        $deptCount1 = Department::count();
        $progCount1 = Program::count();
        $govCount1 = DepartmentSemesterGovernance::count();
        $acadCount1 = AcademicYear::count();

        // Run seeders second time
        app(TenantBaselineSeeder::class)->run();
        app(KeralaPolytechnicProfileSeeder::class)->run();

        $deptCount2 = Department::count();
        $progCount2 = Program::count();
        $govCount2 = DepartmentSemesterGovernance::count();
        $acadCount2 = AcademicYear::count();

        expect($deptCount2)->toBe($deptCount1)
            ->and($progCount2)->toBe($progCount1)
            ->and($govCount2)->toBe($govCount1)
            ->and($acadCount2)->toBe($acadCount1);
    } finally {
        $this->tenantContext->forget();
    }
});

it('isolates batches and governance across different tenants', function () {
    config(['app_profile.deploy_profile' => 'cloud']);

    $tenantA = $this->provisioner->provision('tenant_iso_a', 'Iso A Poly', 'isoa.test', 'cloud');
    $tenantB = $this->provisioner->provision('tenant_iso_b', 'Iso B Poly', 'isob.test', 'cloud');

    // Seed Tenant A and create batch
    $this->tenantContext->setTenant($tenantA);
    try {
        app(KeralaPolytechnicProfileSeeder::class)->run();

        $progCE = Program::where('code', 'DCE')->firstOrFail();
        $deptCE = Department::where('code', 'CE')->firstOrFail();
        $acadYear = AcademicYear::where('label', '2026-27')->firstOrFail();
        $reg2021 = Regulation::where('code', 'REV2021')->firstOrFail();

        /** @var CreateBatchAction $action */
        $action = app(CreateBatchAction::class);
        $action->execute(
            programId: $progCE->id,
            homeDepartmentId: $deptCE->id,
            academicYearId: $acadYear->id,
            regulationId: $reg2021->id,
            name: 'Civil Batch A',
            entryType: 'regular',
            currentSemester: 1
        );

        expect(Batch::count())->toBe(1);
    } finally {
        $this->tenantContext->forget();
    }

    // Verify Tenant B has 0 batches and separate isolated database
    $this->tenantContext->setTenant($tenantB);
    try {
        app(KeralaPolytechnicProfileSeeder::class)->run();
        expect(Batch::count())->toBe(0);
    } finally {
        $this->tenantContext->forget();
    }
});

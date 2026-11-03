<?php

declare(strict_types=1);

namespace App\Modules\Organisation\Actions;

use App\Modules\Organisation\Events\BatchCreated;
use App\Modules\Organisation\Models\AcademicYear;
use App\Modules\Organisation\Models\Batch;
use App\Modules\Organisation\Models\Department;
use App\Modules\Organisation\Models\Institution;
use App\Modules\Organisation\Models\Program;
use App\Modules\Organisation\Models\Regulation;
use App\Modules\Organisation\Services\GovernanceResolver;
use App\Modules\Organisation\Services\ScopePathBuilder;
use Illuminate\Support\Str;

final class CreateBatchAction
{
    public function __construct(
        protected GovernanceResolver $governanceResolver,
        protected ScopePathBuilder $pathBuilder
    ) {}

    public function execute(
        string $programId,
        string $homeDepartmentId,
        string $academicYearId,
        string $regulationId,
        string $name,
        string $entryType = 'regular',
        int $currentSemester = 1
    ): Batch {
        /** @var Institution $institution */
        $institution = Institution::firstOrFail();

        /** @var Program $program */
        $program = Program::findOrFail($programId);

        /** @var Department $homeDept */
        $homeDept = Department::findOrFail($homeDepartmentId);

        /** @var AcademicYear $academicYear */
        $academicYear = AcademicYear::findOrFail($academicYearId);

        /** @var Regulation $regulation */
        $regulation = Regulation::findOrFail($regulationId);

        $managingDeptId = $this->governanceResolver->resolve($homeDepartmentId, $currentSemester);
        /** @var Department $managingDept */
        $managingDept = Department::findOrFail($managingDeptId);

        $scopeLabel = 'b_'.Str::lower((string) Str::ulid());

        $paths = $this->pathBuilder->buildBatchPaths(
            $institution,
            $homeDept,
            $managingDept,
            $program,
            $scopeLabel
        );

        /** @var Batch $batch */
        $batch = Batch::create([
            'program_id' => $program->id,
            'home_department_id' => $homeDept->id,
            'managing_department_id' => $managingDept->id,
            'academic_year_id' => $academicYear->id,
            'regulation_id' => $regulation->id,
            'name' => $name,
            'entry_type' => $entryType,
            'current_semester' => $currentSemester,
            'status' => 'active',
            'scope_label' => $scopeLabel,
            'home_path' => $paths['home_path'],
            'managing_path' => $paths['managing_path'],
        ]);

        BatchCreated::dispatch($batch);

        return $batch;
    }
}

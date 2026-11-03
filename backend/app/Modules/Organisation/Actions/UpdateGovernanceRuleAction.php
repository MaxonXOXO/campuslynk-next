<?php

declare(strict_types=1);

namespace App\Modules\Organisation\Actions;

use App\Modules\Organisation\Events\GovernanceRuleUpdated;
use App\Modules\Organisation\Models\Batch;
use App\Modules\Organisation\Models\Department;
use App\Modules\Organisation\Models\DepartmentSemesterGovernance;
use App\Modules\Organisation\Models\Institution;
use App\Modules\Organisation\Models\Program;
use App\Modules\Organisation\Models\SubBatch;
use App\Modules\Organisation\Services\GovernanceResolver;
use App\Modules\Organisation\Services\ScopePathBuilder;

final class UpdateGovernanceRuleAction
{
    public function __construct(
        protected GovernanceResolver $governanceResolver,
        protected ScopePathBuilder $pathBuilder
    ) {}

    public function execute(
        string $homeDepartmentId,
        int $semesterFrom,
        int $semesterTo,
        string $managingDepartmentId
    ): DepartmentSemesterGovernance {
        /** @var DepartmentSemesterGovernance $rule */
        $rule = DepartmentSemesterGovernance::updateOrCreate(
            [
                'home_department_id' => $homeDepartmentId,
                'semester_from' => $semesterFrom,
                'semester_to' => $semesterTo,
            ],
            [
                'managing_department_id' => $managingDepartmentId,
            ]
        );

        // Recompute all affected active batches
        $batches = Batch::where('home_department_id', $homeDepartmentId)
            ->whereBetween('current_semester', [$semesterFrom, $semesterTo])
            ->where('status', 'active')
            ->get();

        /** @var Institution $institution */
        $institution = Institution::firstOrFail();

        /** @var Department $homeDept */
        $homeDept = Department::findOrFail($homeDepartmentId);

        /** @var Department $managingDept */
        $managingDept = Department::findOrFail($managingDepartmentId);

        /** @var Batch $batch */
        foreach ($batches as $batch) {
            /** @var Program $program */
            $program = Program::findOrFail($batch->program_id);

            $paths = $this->pathBuilder->buildBatchPaths(
                $institution,
                $homeDept,
                $managingDept,
                $program,
                $batch->scope_label
            );

            $batch->managing_department_id = $managingDepartmentId;
            $batch->home_path = $paths['home_path'];
            $batch->managing_path = $paths['managing_path'];
            $batch->save();

            /** @var SubBatch $subBatch */
            foreach ($batch->subBatches as $subBatch) {
                $subPaths = $this->pathBuilder->buildSubBatchPaths($batch, $subBatch->scope_label);
                $subBatch->home_path = $subPaths['home_path'];
                $subBatch->managing_path = $subPaths['managing_path'];
                $subBatch->save();
            }
        }

        GovernanceRuleUpdated::dispatch($rule);

        return $rule;
    }
}

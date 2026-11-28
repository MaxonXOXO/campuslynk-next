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
use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Database\Eloquent\Model;

final class UpdateGovernanceRuleAction
{
    public function __construct(
        protected GovernanceResolver $governanceResolver,
        protected ScopePathBuilder $pathBuilder
    ) {}

    public function execute(
        DepartmentSemesterGovernance $rule,
        string $managingDepartmentId,
        ?int $semesterFrom = null,
        ?int $semesterTo = null,
        ?Authenticatable $actor = null
    ): DepartmentSemesterGovernance {
        $rule->managing_department_id = $managingDepartmentId;
        if ($semesterFrom !== null) {
            $rule->semester_from = $semesterFrom;
        }
        if ($semesterTo !== null) {
            $rule->semester_to = $semesterTo;
        }
        $rule->save();

        // Recompute all affected active batches
        $batches = Batch::where('home_department_id', $rule->home_department_id)
            ->whereBetween('current_semester', [$rule->semester_from, $rule->semester_to])
            ->where('status', 'active')
            ->get();

        /** @var Institution $institution */
        $institution = Institution::firstOrFail();

        /** @var Department $homeDept */
        $homeDept = Department::findOrFail($rule->home_department_id);

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

        if ($actor instanceof Model) {
            activity('organisation')
                ->performedOn($rule)
                ->causedBy($actor)
                ->log("Updated department semester governance rule [{$rule->id}].");
        }

        GovernanceRuleUpdated::dispatch($rule);

        return $rule;
    }
}

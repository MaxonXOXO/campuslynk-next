<?php

declare(strict_types=1);

namespace App\Modules\Organisation\Actions;

use App\Modules\Organisation\Events\BatchSemesterPromoted;
use App\Modules\Organisation\Models\Batch;
use App\Modules\Organisation\Models\Department;
use App\Modules\Organisation\Models\Institution;
use App\Modules\Organisation\Models\Program;
use App\Modules\Organisation\Models\SubBatch;
use App\Modules\Organisation\Services\GovernanceResolver;
use App\Modules\Organisation\Services\ScopePathBuilder;
use InvalidArgumentException;

class PromoteBatchSemesterAction
{
    public function __construct(
        protected GovernanceResolver $governanceResolver,
        protected ScopePathBuilder $pathBuilder
    ) {}

    public function execute(Batch $batch): Batch
    {
        if ($batch->current_semester >= 6) {
            throw new InvalidArgumentException("Batch [{$batch->name}] is already in semester 6 and cannot be promoted further.");
        }

        $prevSemester = $batch->current_semester;
        $prevManagingDeptId = $batch->managing_department_id;

        $newSemester = $prevSemester + 1;
        $newManagingDeptId = $this->governanceResolver->resolve($batch->home_department_id, $newSemester);

        /** @var Institution $institution */
        $institution = Institution::firstOrFail();

        /** @var Department $homeDept */
        $homeDept = Department::findOrFail($batch->home_department_id);

        /** @var Department $managingDept */
        $managingDept = Department::findOrFail($newManagingDeptId);

        /** @var Program $program */
        $program = Program::findOrFail($batch->program_id);

        $paths = $this->pathBuilder->buildBatchPaths(
            $institution,
            $homeDept,
            $managingDept,
            $program,
            $batch->scope_label
        );

        $batch->current_semester = $newSemester;
        $batch->managing_department_id = $newManagingDeptId;
        $batch->home_path = $paths['home_path'];
        $batch->managing_path = $paths['managing_path'];
        $batch->save();

        // Update paths for all child sub-batches
        /** @var SubBatch $subBatch */
        foreach ($batch->subBatches as $subBatch) {
            $subPaths = $this->pathBuilder->buildSubBatchPaths($batch, $subBatch->scope_label);
            $subBatch->home_path = $subPaths['home_path'];
            $subBatch->managing_path = $subPaths['managing_path'];
            $subBatch->save();
        }

        BatchSemesterPromoted::dispatch(
            $batch,
            $prevSemester,
            $newSemester,
            $prevManagingDeptId,
            $newManagingDeptId
        );

        return $batch;
    }
}


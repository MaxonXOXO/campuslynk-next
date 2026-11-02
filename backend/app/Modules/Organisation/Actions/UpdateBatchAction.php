<?php

declare(strict_types=1);

namespace App\Modules\Organisation\Actions;

use App\Modules\Organisation\Events\BatchUpdated;
use App\Modules\Organisation\Models\Batch;
use App\Modules\Organisation\Models\Department;
use App\Modules\Organisation\Models\Institution;
use App\Modules\Organisation\Models\Program;
use App\Modules\Organisation\Models\SubBatch;
use App\Modules\Organisation\Services\GovernanceResolver;
use App\Modules\Organisation\Services\ScopePathBuilder;

class UpdateBatchAction
{
    public function __construct(
        protected GovernanceResolver $governanceResolver,
        protected ScopePathBuilder $pathBuilder
    ) {}

    /**
     * @param array{
     *     name?: string,
     *     entry_type?: string,
     *     status?: string,
     *     academic_year_id?: string,
     *     regulation_id?: string,
     *     home_department_id?: string,
     *     current_semester?: int
     * } $attributes
     */
    public function execute(Batch $batch, array $attributes): Batch
    {
        $batch->fill($attributes);

        if ($batch->isDirty(['home_department_id', 'current_semester', 'program_id'])) {
            $newManagingDeptId = $this->governanceResolver->resolve(
                $batch->home_department_id,
                $batch->current_semester
            );

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

            $batch->managing_department_id = $newManagingDeptId;
            $batch->home_path = $paths['home_path'];
            $batch->managing_path = $paths['managing_path'];
        }

        $batch->save();

        if ($batch->wasChanged(['home_path', 'managing_path'])) {
            /** @var SubBatch $subBatch */
            foreach ($batch->subBatches as $subBatch) {
                $subPaths = $this->pathBuilder->buildSubBatchPaths($batch, $subBatch->scope_label);
                $subBatch->home_path = $subPaths['home_path'];
                $subBatch->managing_path = $subPaths['managing_path'];
                $subBatch->save();
            }
        }

        BatchUpdated::dispatch($batch);

        return $batch;
    }
}


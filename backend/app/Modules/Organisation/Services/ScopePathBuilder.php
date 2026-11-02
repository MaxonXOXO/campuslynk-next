<?php

declare(strict_types=1);

namespace App\Modules\Organisation\Services;

use App\Modules\Organisation\Contracts\ScopeTreeContract;
use App\Modules\Organisation\Models\Batch;
use App\Modules\Organisation\Models\Department;
use App\Modules\Organisation\Models\Institution;
use App\Modules\Organisation\Models\Program;
use App\Modules\Organisation\Models\Stream;

class ScopePathBuilder implements ScopeTreeContract
{
    /**
     * Build both home_path and managing_path for a batch.
     *
     * @return array{home_path: string, managing_path: string}
     */
    public function buildBatchPaths(
        Institution $institution,
        Department $homeDepartment,
        Department $managingDepartment,
        Program $program,
        string $batchScopeLabel
    ): array {
        /** @var Stream $homeStream */
        $homeStream = $homeDepartment->relationLoaded('stream')
            ? $homeDepartment->stream
            : Stream::findOrFail($homeDepartment->stream_id);

        /** @var Stream $managingStream */
        $managingStream = $managingDepartment->relationLoaded('stream')
            ? $managingDepartment->stream
            : Stream::findOrFail($managingDepartment->stream_id);

        $homePath = sprintf(
            '%s.%s.%s.%s.%s',
            $institution->scope_label,
            $homeStream->scope_label,
            $homeDepartment->scope_label,
            $program->scope_label,
            $batchScopeLabel
        );

        $managingPath = sprintf(
            '%s.%s.%s.%s.%s',
            $institution->scope_label,
            $managingStream->scope_label,
            $managingDepartment->scope_label,
            $program->scope_label,
            $batchScopeLabel
        );

        return [
            'home_path' => $homePath,
            'managing_path' => $managingPath,
        ];
    }

    /**
     * Build the home scope path for a batch.
     */
    public function buildBatchHomePath(string $programId, string $batchUlid): string
    {
        $program = Program::findOrFail($programId);
        $dept = Department::findOrFail($program->department_id);
        $stream = Stream::findOrFail($dept->stream_id);
        $institution = Institution::firstOrFail();

        $batchLabel = sprintf('b_%s', strtolower($batchUlid));

        return sprintf(
            '%s.%s.%s.%s.%s',
            $institution->scope_label,
            $stream->scope_label,
            $dept->scope_label,
            $program->scope_label,
            $batchLabel
        );
    }

    /**
     * Build the managing scope path for a batch.
     */
    public function buildBatchManagingPath(string $managingDepartmentId, string $batchUlid): string
    {
        $dept = Department::findOrFail($managingDepartmentId);
        $stream = Stream::findOrFail($dept->stream_id);
        $institution = Institution::firstOrFail();

        $batchLabel = sprintf('b_%s', strtolower($batchUlid));

        return sprintf(
            '%s.%s.%s.%s',
            $institution->scope_label,
            $stream->scope_label,
            $dept->scope_label,
            $batchLabel
        );
    }

    /**
     * Build scope path for a sub-batch.
     */
    public function buildSubBatchPath(string $parentBatchPath, string $subBatchUlid): string
    {
        return sprintf('%s.sb_%s', $parentBatchPath, strtolower($subBatchUlid));
    }

    /**
     * Build sub-batch paths by appending the sub-batch label to its parent batch paths.
     *
     * @return array{home_path: string, managing_path: string}
     */
    public function buildSubBatchPaths(Batch $batch, string $subBatchScopeLabel): array
    {
        return [
            'home_path' => sprintf('%s.%s', $batch->home_path, $subBatchScopeLabel),
            'managing_path' => sprintf('%s.%s', $batch->managing_path, $subBatchScopeLabel),
        ];
    }
}

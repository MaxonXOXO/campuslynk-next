<?php

declare(strict_types=1);

namespace App\Modules\Organisation\Contracts;

interface ScopeTreeContract
{
    /**
     * Build the home scope path for a batch.
     */
    public function buildBatchHomePath(string $programId, string $batchUlid): string;

    /**
     * Build the managing scope path for a batch.
     */
    public function buildBatchManagingPath(string $managingDepartmentId, string $batchUlid): string;

    /**
     * Build scope path for a sub-batch.
     */
    public function buildSubBatchPath(string $parentBatchPath, string $subBatchUlid): string;
}


<?php

declare(strict_types=1);

namespace App\Modules\Organisation\Actions;

use App\Modules\Organisation\Models\SubBatch;

final class UpdateSubBatchAction
{
    /**
     * @param array{
     *     name?: string,
     *     kind?: string,
     *     course_offering_id?: string|null
     * } $attributes
     */
    public function execute(SubBatch $subBatch, array $attributes): SubBatch
    {
        $subBatch->fill($attributes);
        $subBatch->save();

        return $subBatch;
    }
}

<?php

declare(strict_types=1);

namespace App\Modules\Organisation\Actions;

use App\Modules\Organisation\Models\SubBatch;

class DeleteSubBatchAction
{
    public function execute(SubBatch $subBatch): void
    {
        $subBatch->delete();
    }
}


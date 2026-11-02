<?php

declare(strict_types=1);

namespace App\Modules\Organisation\Events;

use App\Modules\Organisation\Models\Batch;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class BatchSemesterPromoted
{
    use Dispatchable;
    use SerializesModels;

    public function __construct(
        public Batch $batch,
        public int $previousSemester,
        public int $newSemester,
        public string $previousManagingDepartmentId,
        public string $newManagingDepartmentId
    ) {}
}


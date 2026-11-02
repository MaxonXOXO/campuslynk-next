<?php

declare(strict_types=1);

namespace App\Modules\Organisation\Events;

use App\Modules\Organisation\Models\Batch;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class BatchUpdated
{
    use Dispatchable;
    use SerializesModels;

    public function __construct(
        public Batch $batch
    ) {}
}

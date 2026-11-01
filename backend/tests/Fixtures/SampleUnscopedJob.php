<?php

declare(strict_types=1);

namespace Tests\Fixtures;

use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

class SampleUnscopedJob implements ShouldQueue
{
    use Queueable;

    public function handle(): void
    {
        // Should never execute because listener fails closed
    }
}

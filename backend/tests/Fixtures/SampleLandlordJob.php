<?php

declare(strict_types=1);

namespace Tests\Fixtures;

use App\Core\Tenancy\Contracts\LandlordJobContract;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

class SampleLandlordJob implements LandlordJobContract, ShouldQueue
{
    use Queueable;

    public static bool $executed = false;

    public function handle(): void
    {
        self::$executed = true;
    }
}

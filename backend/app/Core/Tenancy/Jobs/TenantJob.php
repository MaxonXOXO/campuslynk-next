<?php

declare(strict_types=1);

namespace App\Core\Tenancy\Jobs;

use App\Core\Tenancy\Concerns\TenantAwareJob;
use App\Core\Tenancy\Contracts\TenantAwareJobContract;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

abstract class TenantJob implements ShouldQueue, TenantAwareJobContract
{
    use Queueable;
    use TenantAwareJob;
}

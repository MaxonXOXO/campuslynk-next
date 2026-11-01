<?php

declare(strict_types=1);

namespace App\Core\Tenancy\Bootstrappers;

use App\Core\Tenancy\Models\Tenant;
use Illuminate\Support\Facades\Log;

class LoggingBootstrapper implements TenancyBootstrapperContract
{
    public function bootstrap(Tenant $tenant): void
    {
        Log::shareContext([
            'tenant_id' => $tenant->id,
            'tenant_slug' => $tenant->slug,
        ]);
    }

    public function revert(): void
    {
        Log::flushSharedContext();
    }
}

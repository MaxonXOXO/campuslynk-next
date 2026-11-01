<?php

declare(strict_types=1);

namespace App\Core\Tenancy\Bootstrappers;

use App\Core\Tenancy\Models\Tenant;

class CacheBootstrapper implements TenancyBootstrapperContract
{
    protected ?string $originalPrefix = null;

    public function bootstrap(Tenant $tenant): void
    {
        if ($this->originalPrefix === null) {
            $prefix = config('cache.prefix');
            $this->originalPrefix = is_string($prefix) ? $prefix : '';
        }

        config(['cache.prefix' => 'tenant_'.$tenant->id.'_']);
    }

    public function revert(): void
    {
        if ($this->originalPrefix !== null) {
            config(['cache.prefix' => $this->originalPrefix]);
        }
    }
}

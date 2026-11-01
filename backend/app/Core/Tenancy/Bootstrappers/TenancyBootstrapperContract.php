<?php

declare(strict_types=1);

namespace App\Core\Tenancy\Bootstrappers;

use App\Core\Tenancy\Models\Tenant;

interface TenancyBootstrapperContract
{
    /**
     * Bootstrap tenancy services for the given tenant.
     */
    public function bootstrap(Tenant $tenant): void;

    /**
     * Revert tenancy services back to their pre-tenant default state.
     */
    public function revert(): void;
}

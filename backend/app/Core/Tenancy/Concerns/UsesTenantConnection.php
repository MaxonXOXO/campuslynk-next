<?php

declare(strict_types=1);

namespace App\Core\Tenancy\Concerns;

trait UsesTenantConnection
{
    /**
     * Get the database connection for the model.
     */
    public function getConnectionName(): string
    {
        return 'tenant';
    }
}

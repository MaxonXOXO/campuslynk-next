<?php

declare(strict_types=1);

namespace App\Core\Tenancy\Contracts;

interface TenantAwareJobContract
{
    /**
     * Get the tenant ULID associated with this queued job.
     */
    public function getTenantId(): string;
}

<?php

declare(strict_types=1);

namespace App\Core\Tenancy\Concerns;

use App\Core\Tenancy\Exceptions\MissingTenantContextException;
use App\Core\Tenancy\TenantContext;

trait TenantAwareJob
{
    /**
     * The tenant ULID for this job.
     */
    public ?string $tenantId = null;

    /**
     * Bind the current active tenant context to this job instance.
     */
    public function bindTenantContext(): self
    {
        /** @var TenantContext $context */
        $context = app(TenantContext::class);

        $tenant = $context->getTenant();
        if ($tenant === null) {
            throw new MissingTenantContextException('Cannot dispatch a TenantAwareJob outside of an active tenant context.');
        }

        $this->tenantId = $tenant->id;

        return $this;
    }

    /**
     * Get the tenant ULID.
     */
    public function getTenantId(): string
    {
        if ($this->tenantId === null) {
            /** @var TenantContext $context */
            $context = app(TenantContext::class);
            $tenant = $context->getTenant();

            if ($tenant !== null) {
                $this->tenantId = $tenant->id;
            }
        }

        if ($this->tenantId === null) {
            throw new MissingTenantContextException('Tenant ID is not specified on this job.');
        }

        return $this->tenantId;
    }
}

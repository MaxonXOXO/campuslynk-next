<?php

declare(strict_types=1);

namespace App\Core\Tenancy;

use App\Core\Tenancy\Bootstrappers\TenancyBootstrapperContract;
use App\Core\Tenancy\Exceptions\MissingTenantContextException;
use App\Core\Tenancy\Models\Tenant;

class TenantContext
{
    protected ?Tenant $tenant = null;

    /**
     * @var list<TenancyBootstrapperContract>
     */
    protected array $bootstrappers;

    /**
     * @param  list<TenancyBootstrapperContract>  $bootstrappers
     */
    public function __construct(array $bootstrappers = [])
    {
        $this->bootstrappers = $bootstrappers;
    }

    /**
     * Determine if a tenant is currently set.
     */
    public function hasTenant(): bool
    {
        return $this->tenant !== null;
    }

    /**
     * Get the currently active tenant, or null if uninitialized.
     */
    public function getTenant(): ?Tenant
    {
        return $this->tenant;
    }

    /**
     * Get the currently active tenant, or throw if not set.
     *
     * @throws MissingTenantContextException
     */
    public function tenant(): Tenant
    {
        if ($this->tenant === null) {
            throw new MissingTenantContextException('Tenant context has not been initialized.');
        }

        return $this->tenant;
    }

    /**
     * Initialize tenancy for the specified tenant.
     */
    public function setTenant(Tenant $tenant): void
    {
        if ($this->tenant !== null && $this->tenant->id !== $tenant->id) {
            $this->forget();
        }

        $this->tenant = $tenant;

        foreach ($this->bootstrappers as $bootstrapper) {
            $bootstrapper->bootstrap($tenant);
        }
    }

    /**
     * Teardown tenancy context and restore default state.
     */
    public function forget(): void
    {
        foreach (array_reverse($this->bootstrappers) as $bootstrapper) {
            $bootstrapper->revert();
        }

        $this->tenant = null;
    }
}

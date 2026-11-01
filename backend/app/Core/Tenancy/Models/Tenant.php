<?php

declare(strict_types=1);

namespace App\Core\Tenancy\Models;

use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;

/**
 * @property string $id
 * @property string $slug
 * @property string $name
 * @property string $status
 * @property string $deploy_profile
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Collection<int, Domain> $domains
 * @property-read TenantDatabase|null $database
 * @property-read License|null $license
 * @property-read Collection<int, SchemaVersion> $schemaVersions
 */
class Tenant extends LandlordModel
{
    /**
     * The table associated with the model.
     *
     * @var string
     */
    protected $table = 'tenants';

    /**
     * @return HasMany<Domain, $this>
     */
    public function domains(): HasMany
    {
        return $this->hasMany(Domain::class);
    }

    /**
     * @return HasOne<Domain, $this>
     */
    public function primaryDomain(): HasOne
    {
        return $this->hasOne(Domain::class)->whereRaw('is_primary = true');
    }

    /**
     * @return HasOne<TenantDatabase, $this>
     */
    public function database(): HasOne
    {
        return $this->hasOne(TenantDatabase::class);
    }

    /**
     * @return HasOne<License, $this>
     */
    public function license(): HasOne
    {
        return $this->hasOne(License::class);
    }

    /**
     * @return HasMany<SchemaVersion, $this>
     */
    public function schemaVersions(): HasMany
    {
        return $this->hasMany(SchemaVersion::class);
    }

    /**
     * Check if the tenant is active.
     */
    public function isActive(): bool
    {
        return $this->status === 'active';
    }

    /**
     * Check if the tenant is suspended.
     */
    public function isSuspended(): bool
    {
        return $this->status === 'suspended';
    }

    /**
     * Check if the tenant is currently provisioning.
     */
    public function isProvisioning(): bool
    {
        return $this->status === 'provisioning';
    }

    /**
     * Check if tenant provisioning has failed.
     */
    public function hasFailed(): bool
    {
        return $this->status === 'failed';
    }

    /**
     * The "booted" method of the model.
     */
    protected static function booted(): void
    {
        static::saved(function (Tenant $tenant): void {
            Cache::forget('tenant:entity:'.$tenant->id);
            foreach ($tenant->domains as $domain) {
                Cache::forget('tenant:domain:'.$domain->domain);
            }
        });

        static::deleted(function (Tenant $tenant): void {
            Cache::forget('tenant:entity:'.$tenant->id);
            foreach ($tenant->domains as $domain) {
                Cache::forget('tenant:domain:'.$domain->domain);
            }
        });
    }

    /**
     * Check if the tenant has an active, unexpired license.
     */
    public function hasValidLicense(): bool
    {
        return $this->license !== null && ! $this->license->isExpired();
    }
}

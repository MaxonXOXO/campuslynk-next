<?php

declare(strict_types=1);

namespace App\Core\Tenancy\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;

/**
 * @property string $id
 * @property string $tenant_id
 * @property string $domain
 * @property bool $is_primary
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Tenant $tenant
 */
class Domain extends LandlordModel
{
    /**
     * The table associated with the model.
     *
     * @var string
     */
    protected $table = 'domains';

    /**
     * The attributes that should be cast.
     *
     * @var array<string, string>
     */
    protected $casts = [
        'is_primary' => 'boolean',
    ];

    /**
     * @return BelongsTo<Tenant, $this>
     */
    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    /**
     * The "booted" method of the model.
     */
    protected static function booted(): void
    {
        static::saved(function (Domain $domain): void {
            Cache::forget('tenant:domain:'.$domain->domain);
            if ($domain->isDirty('domain') && is_string($domain->getOriginal('domain'))) {
                Cache::forget('tenant:domain:'.$domain->getOriginal('domain'));
            }
            Cache::forget('tenant:entity:'.$domain->tenant_id);
        });

        static::deleted(function (Domain $domain): void {
            Cache::forget('tenant:domain:'.$domain->domain);
            Cache::forget('tenant:entity:'.$domain->tenant_id);
        });
    }
}

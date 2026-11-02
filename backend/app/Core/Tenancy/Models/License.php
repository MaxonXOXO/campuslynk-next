<?php

declare(strict_types=1);

namespace App\Core\Tenancy\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;

/**
 * @property string $id
 * @property string $tenant_id
 * @property string $plan
 * @property array<string>|array<string, mixed> $modules
 * @property Carbon $valid_until
 * @property string|null $signature
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Tenant $tenant
 */
class License extends LandlordModel
{
    /**
     * The table associated with the model.
     *
     * @var string
     */
    protected $table = 'licenses';

    /**
     * The attributes that should be cast.
     *
     * @var array<string, string>
     */
    protected $casts = [
        'modules' => 'array',
        'valid_until' => 'datetime',
    ];

    /**
     * @return BelongsTo<Tenant, $this>
     */
    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    /**
     * Configured grace period in days.
     */
    public function gracePeriodDays(): int
    {
        return (int) config('tenancy.license_grace_days', 30);
    }

    /**
     * Determine if the license is strictly expired (past valid_until).
     */
    public function isExpired(): bool
    {
        return $this->valid_until->isPast();
    }

    /**
     * Determine if the license is past its grace period.
     */
    public function isPastGrace(): bool
    {
        return $this->valid_until->copy()->addDays($this->gracePeriodDays())->isPast();
    }

    /**
     * Determine non-sensitive license status for public meta probe.
     * Status values: 'ok' | 'expiring' | 'grace' | 'expired'
     */
    public function status(): string
    {
        if ($this->isPastGrace()) {
            return 'expired';
        }

        if ($this->isExpired()) {
            return 'grace';
        }

        // Within 30 days of valid_until -> expiring
        if (now()->greaterThanOrEqualTo($this->valid_until->copy()->subDays(30))) {
            return 'expiring';
        }

        return 'ok';
    }

    /**
     * The "booted" method of the model.
     */
    protected static function booted(): void
    {
        static::saved(function (License $license): void {
            Cache::forget('tenant:entity:'.$license->tenant_id);
        });

        static::deleted(function (License $license): void {
            Cache::forget('tenant:entity:'.$license->tenant_id);
        });
    }
}

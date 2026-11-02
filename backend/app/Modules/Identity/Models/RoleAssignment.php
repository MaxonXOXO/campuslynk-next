<?php

declare(strict_types=1);

namespace App\Modules\Identity\Models;

use App\Core\Tenancy\Concerns\UsesTenantConnection;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * @property string $id
 * @property string $user_id
 * @property string $role_id
 * @property string $scope_type
 * @property string|null $scope_id
 * @property string $scope_label
 * @property bool $is_singleton
 * @property Carbon|null $valid_from
 * @property Carbon|null $valid_to
 * @property bool $is_active
 * @property string|null $assigned_by_user_id
 * @property string|null $order_record
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read User $user
 * @property-read Role $role
 * @property-read User|null $assignedByUser
 *
 * @method static Builder<static> active()
 */
class RoleAssignment extends Model
{
    use HasUlids;
    use UsesTenantConnection;

    protected $table = 'role_assignments';

    protected $fillable = [
        'user_id',
        'role_id',
        'scope_type',
        'scope_id',
        'scope_label',
        'is_singleton',
        'valid_from',
        'valid_to',
        'is_active',
        'assigned_by_user_id',
        'order_record',
    ];

    protected $casts = [
        'is_singleton' => 'boolean',
        'is_active' => 'boolean',
        'valid_from' => 'datetime',
        'valid_to' => 'datetime',
    ];

    protected static function booted(): void
    {
        static::creating(function (RoleAssignment $assignment): void {
            if ($assignment->valid_from === null) {
                $assignment->valid_from = Carbon::now();
            }
        });
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    /**
     * @return BelongsTo<Role, $this>
     */
    public function role(): BelongsTo
    {
        return $this->belongsTo(Role::class, 'role_id');
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function assignedByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_by_user_id');
    }

    /**
     * Scope currently active assignments (is_active = true and current time within valid_from and valid_to).
     *
     * @param  Builder<static>  $query
     * @return Builder<static>
     */
    public function scopeActive(Builder $query): Builder
    {
        $now = Carbon::now();

        return $query->whereRaw('is_active is true')
            ->where('valid_from', '<=', $now)
            ->where(function (Builder $sub) use ($now) {
                $sub->whereNull('valid_to')
                    ->orWhere('valid_to', '>', $now);
            });
    }
}

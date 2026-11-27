<?php

declare(strict_types=1);

namespace App\Modules\Identity\Models;

use App\Core\Tenancy\Concerns\UsesTenantConnection;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\HasApiTokens;

/**
 * @property string $id
 * @property string $type
 * @property string $name
 * @property string|null $first_name
 * @property string|null $last_name
 * @property string|null $email
 * @property string|null $mobile
 * @property string|null $registration_number
 * @property string $password
 * @property bool $must_change_password
 * @property Carbon|null $temporary_password_expires_at
 * @property string $status
 * @property string|null $status_reason
 * @property Carbon|null $deactivated_at
 * @property string|null $deactivated_by_user_id
 * @property Carbon|null $rejected_at
 * @property Carbon|null $last_login_at
 * @property Carbon|null $first_activated_at
 * @property Carbon|null $locked_until
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 */
class User extends Authenticatable
{
    use HasApiTokens;
    use HasUlids;
    use Notifiable;
    use UsesTenantConnection;

    /**
     * The table associated with the model.
     *
     * @var string
     */
    protected $table = 'users';

    /**
     * Indicates if the model's ID is auto-incrementing.
     *
     * @var bool
     */
    public $incrementing = false;

    /**
     * The data type of the primary key ID.
     *
     * @var string
     */
    protected $keyType = 'string';

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'type',
        'name',
        'first_name',
        'last_name',
        'email',
        'mobile',
        'registration_number',
        'password',
        'must_change_password',
        'temporary_password_expires_at',
        'status',
        'status_reason',
        'deactivated_at',
        'deactivated_by_user_id',
        'rejected_at',
        'last_login_at',
        'first_activated_at',
        'locked_until',
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var list<string>
     */
    protected $hidden = [
        'password',
        'remember_token',
    ];

    /**
     * The attributes that should be cast.
     *
     * @var array<string, string>
     */
    protected $casts = [
        'must_change_password' => 'boolean',
        'temporary_password_expires_at' => 'datetime',
        'last_login_at' => 'datetime',
        'first_activated_at' => 'datetime',
        'locked_until' => 'datetime',
        'deactivated_at' => 'datetime',
        'rejected_at' => 'datetime',
        'password' => 'hashed',
    ];

    /**
     * Check if the account is currently within a timed lockout window.
     */
    public function isLocked(): bool
    {
        return $this->locked_until !== null && $this->locked_until->isFuture();
    }

    /**
     * Check if the user is active.
     */
    public function isActive(): bool
    {
        return $this->status === 'active';
    }

    /**
     * Check if the user is suspended.
     */
    public function isSuspended(): bool
    {
        return $this->status === 'suspended';
    }

    /**
     * Check if the user is pending activation.
     */
    public function isPending(): bool
    {
        return $this->status === 'pending';
    }

    /**
     * @return HasMany<UserIdentifier, $this>
     */
    public function identifiers(): HasMany
    {
        return $this->hasMany(UserIdentifier::class);
    }

    /**
     * @return HasMany<RoleAssignment, $this>
     */
    public function roleAssignments(): HasMany
    {
        return $this->hasMany(RoleAssignment::class, 'user_id');
    }

    /**
     * @return HasOne<StaffProfile, $this>
     */
    public function staffProfile(): HasOne
    {
        return $this->hasOne(StaffProfile::class, 'user_id');
    }

    protected static function booted(): void
    {
        static::saved(function (User $user): void {
            $user->syncIdentifiers();
        });
    }

    /**
     * Synchronize normalised login identifiers into user_identifiers table.
     */
    public function syncIdentifiers(): void
    {
        // 1. Email
        if (is_string($this->email) && trim($this->email) !== '') {
            $norm = UserIdentifier::normalise($this->email, 'email');
            $this->identifiers()->updateOrCreate(
                ['kind' => 'email'],
                ['value' => $this->email, 'value_normalised' => $norm]
            );
        } else {
            $this->identifiers()->where('kind', 'email')->delete();
        }

        // 2. Mobile
        if (is_string($this->mobile) && trim($this->mobile) !== '') {
            $norm = UserIdentifier::normalise($this->mobile, 'mobile');
            $this->identifiers()->updateOrCreate(
                ['kind' => 'mobile'],
                ['value' => $this->mobile, 'value_normalised' => $norm]
            );
        } else {
            $this->identifiers()->where('kind', 'mobile')->delete();
        }

        // 3. Registration Number
        if (is_string($this->registration_number) && trim($this->registration_number) !== '') {
            $norm = UserIdentifier::normalise($this->registration_number, 'registration_number');
            $this->identifiers()->updateOrCreate(
                ['kind' => 'registration_number'],
                ['value' => $this->registration_number, 'value_normalised' => $norm]
            );
        } else {
            $this->identifiers()->where('kind', 'registration_number')->delete();
        }
    }
}

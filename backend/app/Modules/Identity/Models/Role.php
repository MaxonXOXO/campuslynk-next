<?php

declare(strict_types=1);

namespace App\Modules\Identity\Models;

use App\Core\Tenancy\Concerns\UsesTenantConnection;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;

/**
 * @property string $id
 * @property string $key
 * @property string $name
 * @property string $scope_type
 * @property string $stream
 * @property bool $is_singleton
 * @property bool $is_active
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Collection<int, Permission> $permissions
 * @property-read Collection<int, RoleAssignment> $assignments
 */
class Role extends Model
{
    use HasUlids;
    use UsesTenantConnection;

    protected $table = 'roles';

    protected $fillable = [
        'key',
        'name',
        'scope_type',
        'stream',
        'is_singleton',
        'is_active',
    ];

    protected $casts = [
        'is_singleton' => 'boolean',
        'is_active' => 'boolean',
    ];

    /**
     * @return BelongsToMany<Permission, $this>
     */
    public function permissions(): BelongsToMany
    {
        return $this->belongsToMany(
            Permission::class,
            'role_permission',
            'role_id',
            'permission_id'
        )->withTimestamps();
    }

    /**
     * @return HasMany<RoleAssignment, $this>
     */
    public function assignments(): HasMany
    {
        return $this->hasMany(RoleAssignment::class, 'role_id');
    }
}

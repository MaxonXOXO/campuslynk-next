<?php

declare(strict_types=1);

namespace App\Modules\Organisation\Models;

use App\Core\Tenancy\Concerns\UsesTenantConnection;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;

/**
 * @property string $id
 * @property string $code
 * @property string $name
 * @property string $scope_label
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 */
class Stream extends Model
{
    use HasUlids;
    use UsesTenantConnection;

    protected $table = 'streams';

    /**
     * @var list<string>
     */
    protected $fillable = [
        'code',
        'name',
        'scope_label',
    ];

    /**
     * @return HasMany<Department, $this>
     */
    public function departments(): HasMany
    {
        return $this->hasMany(Department::class);
    }
}


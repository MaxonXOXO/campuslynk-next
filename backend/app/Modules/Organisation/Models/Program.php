<?php

declare(strict_types=1);

namespace App\Modules\Organisation\Models;

use App\Core\Tenancy\Concerns\UsesTenantConnection;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;

/**
 * @property string $id
 * @property string $department_id
 * @property string $code
 * @property string $name
 * @property int $duration_semesters
 * @property string $scope_label
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Department $department
 */
class Program extends Model
{
    use HasUlids;
    use UsesTenantConnection;

    protected $table = 'programs';

    /**
     * @var list<string>
     */
    protected $fillable = [
        'department_id',
        'code',
        'name',
        'duration_semesters',
        'scope_label',
    ];

    /**
     * @var array<string, string>
     */
    protected $casts = [
        'duration_semesters' => 'integer',
    ];

    /**
     * @return BelongsTo<Department, $this>
     */
    public function department(): BelongsTo
    {
        return $this->belongsTo(Department::class);
    }

    /**
     * @return HasMany<Batch, $this>
     */
    public function batches(): HasMany
    {
        return $this->hasMany(Batch::class);
    }
}

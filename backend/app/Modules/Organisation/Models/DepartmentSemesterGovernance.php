<?php

declare(strict_types=1);

namespace App\Modules\Organisation\Models;

use App\Core\Tenancy\Concerns\UsesTenantConnection;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * @property string $id
 * @property string $home_department_id
 * @property int $semester_from
 * @property int $semester_to
 * @property string $managing_department_id
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Department $homeDepartment
 * @property-read Department $managingDepartment
 */
class DepartmentSemesterGovernance extends Model
{
    use HasUlids;
    use UsesTenantConnection;

    protected $table = 'department_semester_governance';

    /**
     * @var list<string>
     */
    protected $fillable = [
        'home_department_id',
        'semester_from',
        'semester_to',
        'managing_department_id',
    ];

    /**
     * @var array<string, string>
     */
    protected $casts = [
        'semester_from' => 'integer',
        'semester_to' => 'integer',
    ];

    /**
     * @return BelongsTo<Department, $this>
     */
    public function homeDepartment(): BelongsTo
    {
        return $this->belongsTo(Department::class, 'home_department_id');
    }

    /**
     * @return BelongsTo<Department, $this>
     */
    public function managingDepartment(): BelongsTo
    {
        return $this->belongsTo(Department::class, 'managing_department_id');
    }
}

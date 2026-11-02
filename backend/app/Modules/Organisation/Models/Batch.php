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
 * @property string $program_id
 * @property string $home_department_id
 * @property string $managing_department_id
 * @property string $academic_year_id
 * @property string $regulation_id
 * @property string $name
 * @property string $entry_type
 * @property int $current_semester
 * @property string $status
 * @property string $scope_label
 * @property string $home_path
 * @property string $managing_path
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Program $program
 * @property-read Department $homeDepartment
 * @property-read Department $managingDepartment
 * @property-read AcademicYear $academicYear
 * @property-read Regulation $regulation
 */
class Batch extends Model
{
    use HasUlids;
    use UsesTenantConnection;

    protected $table = 'batches';

    /**
     * @var list<string>
     */
    protected $fillable = [
        'program_id',
        'home_department_id',
        'managing_department_id',
        'academic_year_id',
        'regulation_id',
        'name',
        'entry_type',
        'current_semester',
        'status',
        'scope_label',
        'home_path',
        'managing_path',
    ];

    /**
     * @var array<string, string>
     */
    protected $casts = [
        'current_semester' => 'integer',
    ];

    /**
     * @return BelongsTo<Program, $this>
     */
    public function program(): BelongsTo
    {
        return $this->belongsTo(Program::class);
    }

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

    /**
     * @return BelongsTo<AcademicYear, $this>
     */
    public function academicYear(): BelongsTo
    {
        return $this->belongsTo(AcademicYear::class);
    }

    /**
     * @return BelongsTo<Regulation, $this>
     */
    public function regulation(): BelongsTo
    {
        return $this->belongsTo(Regulation::class);
    }

    /**
     * @return HasMany<SubBatch, $this>
     */
    public function subBatches(): HasMany
    {
        return $this->hasMany(SubBatch::class);
    }
}


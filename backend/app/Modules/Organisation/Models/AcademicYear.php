<?php

declare(strict_types=1);

namespace App\Modules\Organisation\Models;

use App\Core\Tenancy\Concerns\UsesTenantConnection;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * @property string $id
 * @property string $label
 * @property Carbon $start_date
 * @property Carbon $end_date
 * @property bool $is_current
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 */
class AcademicYear extends Model
{
    use HasUlids;
    use UsesTenantConnection;

    protected $table = 'academic_years';

    /**
     * @var list<string>
     */
    protected $fillable = [
        'label',
        'start_date',
        'end_date',
        'is_current',
    ];

    /**
     * @var array<string, string>
     */
    protected $casts = [
        'start_date' => 'date',
        'end_date' => 'date',
        'is_current' => 'boolean',
    ];
}

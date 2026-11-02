<?php

declare(strict_types=1);

namespace App\Modules\Organisation\Models;

use App\Core\Tenancy\Concerns\UsesTenantConnection;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * @property string $id
 * @property string $code
 * @property string $name
 * @property string $scope_label
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 */
class WorkshopSection extends Model
{
    use HasUlids;
    use UsesTenantConnection;

    protected $table = 'workshop_sections';

    /**
     * @var list<string>
     */
    protected $fillable = [
        'code',
        'name',
        'scope_label',
    ];
}


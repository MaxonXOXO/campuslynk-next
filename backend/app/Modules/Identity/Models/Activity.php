<?php

declare(strict_types=1);

namespace App\Modules\Identity\Models;

use App\Core\Tenancy\Concerns\UsesTenantConnection;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Support\Carbon;
use Spatie\Activitylog\Models\Activity as SpatieActivity;

/**
 * @property string $id
 * @property string|null $log_name
 * @property string $description
 * @property string|null $subject_type
 * @property string|null $subject_id
 * @property string|null $event
 * @property string|null $causer_type
 * @property string|null $causer_id
 * @property array<string, mixed>|null $attribute_changes
 * @property array<string, mixed>|null $properties
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 */
class Activity extends SpatieActivity
{
    use HasUlids;
    use UsesTenantConnection;

    protected $keyType = 'string';

    public $incrementing = false;
}

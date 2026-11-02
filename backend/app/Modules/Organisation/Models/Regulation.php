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
 * @property int $effective_from_year
 * @property array<string, mixed> $config_json
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 */
class Regulation extends Model
{
    use HasUlids;
    use UsesTenantConnection;

    protected $table = 'regulations';

    /**
     * @var list<string>
     */
    protected $fillable = [
        'code',
        'name',
        'effective_from_year',
        'config_json',
    ];

    /**
     * @var array<string, string>
     */
    protected $casts = [
        'effective_from_year' => 'integer',
        'config_json' => 'array',
    ];
}


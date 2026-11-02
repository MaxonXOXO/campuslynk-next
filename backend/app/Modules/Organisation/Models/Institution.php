<?php

declare(strict_types=1);

namespace App\Modules\Organisation\Models;

use App\Core\Tenancy\Concerns\UsesTenantConnection;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * @property string $id
 * @property string $name
 * @property string $code
 * @property string $scope_label
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 */
class Institution extends Model
{
    use HasUlids;
    use UsesTenantConnection;

    protected $table = 'institution';

    /**
     * @var list<string>
     */
    protected $fillable = [
        'name',
        'code',
        'scope_label',
    ];
}

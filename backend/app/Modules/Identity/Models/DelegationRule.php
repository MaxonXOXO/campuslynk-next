<?php

declare(strict_types=1);

namespace App\Modules\Identity\Models;

use App\Core\Tenancy\Concerns\UsesTenantConnection;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * @property string $id
 * @property string $assigner_role_key
 * @property string $assignee_role_key
 * @property string $scope_constraint
 * @property bool $requires_order_record
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 */
class DelegationRule extends Model
{
    use HasUlids;
    use UsesTenantConnection;

    protected $table = 'delegation_rules';

    protected $fillable = [
        'assigner_role_key',
        'assignee_role_key',
        'scope_constraint',
        'requires_order_record',
    ];

    protected $casts = [
        'requires_order_record' => 'boolean',
    ];
}

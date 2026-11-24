<?php

declare(strict_types=1);

namespace App\Modules\Identity\Models;

use App\Core\Tenancy\Concerns\UsesTenantConnection;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * @property string $id
 * @property string $batch_id
 * @property int $row_number
 * @property string $status
 * @property array<string, mixed> $payload
 * @property array<string, mixed>|null $errors
 * @property string|null $created_user_id
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read StaffImportBatch $batch
 */
class StaffImportRow extends Model
{
    use HasUlids;
    use UsesTenantConnection;

    protected $table = 'staff_import_rows';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'batch_id',
        'row_number',
        'status',
        'payload',
        'errors',
        'created_user_id',
    ];

    protected $casts = [
        'row_number' => 'integer',
        'payload' => 'array',
        'errors' => 'array',
    ];

    /**
     * @return BelongsTo<StaffImportBatch, $this>
     */
    public function batch(): BelongsTo
    {
        return $this->belongsTo(StaffImportBatch::class, 'batch_id');
    }
}

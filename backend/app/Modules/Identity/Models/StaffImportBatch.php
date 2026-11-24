<?php

declare(strict_types=1);

namespace App\Modules\Identity\Models;

use App\Core\Tenancy\Concerns\UsesTenantConnection;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;

/**
 * Staff bulk import batch tracking record.
 *
 * @property string $id
 * @property string $uploaded_by_user_id
 * @property string $filename
 * @property string $file_hash
 * @property string|null $idempotency_key
 * @property string $status
 * @property bool $auto_approve
 * @property int $total_rows
 * @property int $valid_rows
 * @property int $duplicate_rows
 * @property int $invalid_rows
 * @property int $created_count
 * @property int $skipped_duplicate_count
 * @property int $failed_count
 * @property array<int, array<string, mixed>>|null $error_summary
 * @property Carbon|null $started_at
 * @property Carbon|null $completed_at
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 */
class StaffImportBatch extends Model
{
    use HasUlids;
    use UsesTenantConnection;

    protected $table = 'staff_import_batches';

    /** @var list<string> */
    protected $fillable = [
        'uploaded_by_user_id',
        'filename',
        'file_hash',
        'idempotency_key',
        'status',
        'auto_approve',
        'total_rows',
        'valid_rows',
        'duplicate_rows',
        'invalid_rows',
        'created_count',
        'skipped_duplicate_count',
        'failed_count',
        'error_summary',
        'started_at',
        'completed_at',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'auto_approve' => 'boolean',
            'total_rows' => 'integer',
            'valid_rows' => 'integer',
            'duplicate_rows' => 'integer',
            'invalid_rows' => 'integer',
            'created_count' => 'integer',
            'skipped_duplicate_count' => 'integer',
            'failed_count' => 'integer',
            'error_summary' => 'array',
            'started_at' => 'datetime',
            'completed_at' => 'datetime',
        ];
    }

    /**
     * @return HasMany<StaffImportRow, $this>
     */
    public function rows(): HasMany
    {
        return $this->hasMany(StaffImportRow::class, 'batch_id');
    }
}

<?php

declare(strict_types=1);

namespace App\Modules\Organisation\Models;

use App\Core\Concerns\HasScopedVisibility;
use App\Core\Contracts\ScopedResource;
use App\Core\Tenancy\Concerns\UsesTenantConnection;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * @property string $id
 * @property string $batch_id
 * @property string $kind
 * @property string $name
 * @property string|null $course_offering_id
 * @property string $scope_label
 * @property string $home_path
 * @property string $managing_path
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Batch $batch
 */
class SubBatch extends Model implements ScopedResource
{
    use HasScopedVisibility;
    use HasUlids;
    use UsesTenantConnection;

    public function getManagingScopePath(): string
    {
        return $this->managing_path;
    }

    public function getHomeScopePath(): string
    {
        return $this->home_path;
    }

    protected $table = 'sub_batches';

    /**
     * @var list<string>
     */
    protected $fillable = [
        'batch_id',
        'kind',
        'name',
        'course_offering_id',
        'scope_label',
        'home_path',
        'managing_path',
    ];

    /**
     * @return BelongsTo<Batch, $this>
     */
    public function batch(): BelongsTo
    {
        return $this->belongsTo(Batch::class);
    }
}

<?php

declare(strict_types=1);

namespace App\Modules\Organisation\Models;

use App\Core\Concerns\HasScopedVisibility;
use App\Core\Contracts\ScopedResource;
use App\Core\Tenancy\Concerns\UsesTenantConnection;
use App\Modules\Organisation\Contracts\ScopeDirectoryContract;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;

/**
 * @property string $id
 * @property string $code
 * @property string $name
 * @property string $stream_id
 * @property string $kind
 * @property bool $is_active
 * @property string $scope_label
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Stream $stream
 */
class Department extends Model implements ScopedResource
{
    use HasScopedVisibility;
    use HasUlids;
    use UsesTenantConnection;

    protected $table = 'departments';

    /**
     * @var list<string>
     */
    protected $fillable = [
        'code',
        'name',
        'stream_id',
        'kind',
        'is_active',
        'scope_label',
    ];

    /**
     * @var array<string, string>
     */
    protected $casts = [
        'is_active' => 'boolean',
    ];

    /**
     * @return BelongsTo<Stream, $this>
     */
    public function stream(): BelongsTo
    {
        return $this->belongsTo(Stream::class);
    }

    /**
     * @return HasMany<Program, $this>
     */
    public function programs(): HasMany
    {
        return $this->hasMany(Program::class);
    }

    public function getManagingScopePath(): string
    {
        return (string) app(ScopeDirectoryContract::class)->query()
            ->where('scope_type', 'department')
            ->where('scope_id', $this->id)
            ->value('managing_path');
    }

    public function getHomeScopePath(): string
    {
        return $this->getManagingScopePath();
    }
}

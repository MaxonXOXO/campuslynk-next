<?php

declare(strict_types=1);

namespace App\Modules\Organisation\Models;

use App\Core\Tenancy\Concerns\UsesTenantConnection;
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
 * @property string $funding_stream
 * @property string $kind
 * @property bool $is_active
 * @property string $scope_label
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Stream $stream
 */
class Department extends Model
{
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
        'funding_stream',
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
}


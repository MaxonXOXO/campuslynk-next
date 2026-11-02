<?php

declare(strict_types=1);

namespace App\Core\Auth\Models;

use App\Core\Tenancy\Concerns\UsesTenantConnection;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property string $id
 * @property string $user_id
 * @property string $kind
 * @property string $value
 * @property string $value_normalised
 * @property-read User $user
 */
class UserIdentifier extends Model
{
    use HasUlids;
    use UsesTenantConnection;

    protected $table = 'user_identifiers';

    /**
     * @var list<string>
     */
    protected $fillable = [
        'user_id',
        'kind',
        'value',
        'value_normalised',
    ];

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Normalise an identifier value for exact case-insensitive, symbol-consistent matching.
     */
    public static function normalise(string $value, ?string $kind = null): string
    {
        $trimmed = trim($value);

        if ($kind === 'mobile') {
            // Strip whitespace and hyphens for mobile numbers
            $clean = preg_replace('/[\s\-]/', '', $trimmed);

            return strtolower((string) $clean);
        }

        // Standard canonical lowercasing for emails, registration numbers, and generic inputs
        return strtolower($trimmed);
    }
}

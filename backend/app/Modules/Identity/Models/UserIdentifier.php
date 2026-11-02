<?php

declare(strict_types=1);

namespace App\Modules\Identity\Models;

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
     * Normalise an identifier value into its unique canonical form.
     * Operates uniformly across emails, mobiles, and registration numbers / IDs
     * with zero kind-guessing at login time.
     */
    public static function normalise(string $value, ?string $kind = null): string
    {
        $trimmed = trim($value);

        // 1. Email addresses: lowercase and trimmed
        if (str_contains($trimmed, '@')) {
            return strtolower($trimmed);
        }

        // 2. Numeric / Phone representations:
        // Strip common formatting punctuation (spaces, hyphens, dots, parentheses)
        $cleanDigits = (string) preg_replace('/[\s\-\.\(\)]+/', '', $trimmed);

        // Strip leading +91 (E.164 India country code) or 0 (national trunk prefix)
        // when followed by exactly 10 digits
        if (preg_match('/^\+91([0-9]{10})$/', $cleanDigits, $matches)) {
            return $matches[1];
        }
        if (preg_match('/^0([0-9]{10})$/', $cleanDigits, $matches)) {
            return $matches[1];
        }

        // Standard 10-digit number (mobile phone or 10-digit registration number)
        if (preg_match('/^[0-9]{10}$/', $cleanDigits)) {
            return $cleanDigits;
        }

        // 3. Alphanumeric identifiers (staff IDs, registration codes, generic handles)
        // Trimmed and lowercased for case-insensitive uniqueness across all kinds
        return strtolower($trimmed);
    }
}

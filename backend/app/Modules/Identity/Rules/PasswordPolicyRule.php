<?php

declare(strict_types=1);

namespace App\Modules\Identity\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Translation\PotentiallyTranslatedString;

class PasswordPolicyRule implements ValidationRule
{
    /**
     * Local list of top common / breached passwords to reject (no composition theatre).
     *
     * @var array<string>
     */
    protected const COMMON_PASSWORDS = [
        'password',
        'password123',
        'password1234',
        'admin123',
        'admin1234',
        'administrator',
        '12345678',
        '123456789',
        '1234567890',
        'qwertyuiop',
        'carmel2026',
        'carmel123',
        'polytechnic',
        'campuslynk',
        'academic123',
        'welcome123',
        'welcome2026',
        'letmein123',
        'changeme',
        'changeme123',
        'iloveyou',
        'monkey123',
        'dragon123',
        'master123',
        'football',
        'superadmin',
        'superadmin123',
        'secret123',
        'test1234',
        'default123',
    ];

    /**
     * Run the validation rule.
     *
     * @param  Closure(string, ?string=): PotentiallyTranslatedString  $fail
     */
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (! is_string($value)) {
            $fail('The password must be a string.');

            return;
        }

        $length = strlen($value);

        // 1. Length constraint: minimum 8 characters, maximum 128 characters
        if ($length < 8) {
            $fail('The password must be at least 8 characters in length.');

            return;
        }

        if ($length > 128) {
            $fail('The password must not exceed 128 characters.');

            return;
        }

        // 2. Reject trivial repeating characters (e.g. 'aaaaaaaa')
        if (preg_match('/^(.)\1+$/', $value)) {
            $fail('The password is too simple and easily guessed.');

            return;
        }

        // 3. Reject common / breached passwords
        $lower = strtolower($value);
        if (in_array($lower, self::COMMON_PASSWORDS, true)) {
            $fail('This password is on a known list of breached or common passwords. Please choose a more secure password.');
        }
    }
}

<?php

declare(strict_types=1);

namespace App\Modules\Identity\Services;

final class AuditPropertyRedactor
{
    /** @var list<string> */
    private const SENSITIVE_KEY_FRAGMENTS = [
        'password',
        'token',
        'secret',
        'hash',
        'authorization',
        'cookie',
        'credential',
    ];

    /**
     * Recursively redact sensitive keys in audit properties (used on both write and read).
     *
     * @param  array<string, mixed>  $properties
     * @return array<string, mixed>
     */
    public static function redact(array $properties): array
    {
        $sanitized = [];

        foreach ($properties as $key => $value) {
            $keyStr = (string) $key;
            if (self::isSensitiveKey($keyStr)) {
                $sanitized[$keyStr] = '[REDACTED]';

                continue;
            }

            if (is_array($value)) {
                /** @var array<string, mixed> $nested */
                $nested = $value;
                $sanitized[$keyStr] = self::redact($nested);
            } else {
                $sanitized[$keyStr] = $value;
            }
        }

        return $sanitized;
    }

    private static function isSensitiveKey(string $key): bool
    {
        $lower = strtolower($key);
        foreach (self::SENSITIVE_KEY_FRAGMENTS as $fragment) {
            if (str_contains($lower, $fragment)) {
                return true;
            }
        }

        return false;
    }
}

<?php

declare(strict_types=1);

namespace App\Core\Authorization;

use InvalidArgumentException;

class ScopeLabelValidator
{
    /**
     * Strict validation of PostgreSQL ltree scope labels (ADR-0013).
     * Must be a 1-63 character ASCII alphanumeric identifier with underscores only.
     *
     * @throws InvalidArgumentException
     */
    public static function validate(string $label): void
    {
        if ($label === '' || ! preg_match('/^[a-zA-Z0-9_]{1,63}$/', $label)) {
            throw new InvalidArgumentException(
                "Invalid scope label [{$label}]. Scope labels must match /^[a-zA-Z0-9_]{1,63}$/."
            );
        }
    }
}

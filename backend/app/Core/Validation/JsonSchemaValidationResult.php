<?php

declare(strict_types=1);

namespace App\Core\Validation;

final class JsonSchemaValidationResult
{
    /**
     * @param  array<string, string>  $errors
     */
    public function __construct(
        private readonly bool $valid,
        private readonly array $errors = []
    ) {}

    public function isValid(): bool
    {
        return $this->valid;
    }

    /**
     * @return array<string, string>
     */
    public function errors(): array
    {
        return $this->errors;
    }

    public function firstError(): ?string
    {
        if (empty($this->errors)) {
            return null;
        }

        $values = array_values($this->errors);

        return $values[0];
    }
}

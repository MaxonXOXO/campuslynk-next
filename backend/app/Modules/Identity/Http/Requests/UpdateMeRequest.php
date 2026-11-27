<?php

declare(strict_types=1);

namespace App\Modules\Identity\Http\Requests;

use Closure;
use Illuminate\Foundation\Http\FormRequest;

class UpdateMeRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        $updates = [];

        foreach (['first_name', 'last_name'] as $field) {
            if (! $this->exists($field)) {
                continue;
            }

            $raw = $this->input($field);
            if (! is_string($raw)) {
                continue;
            }

            // Preserve control characters so the validation rule rejects them explicitly.
            if (preg_match('/\p{C}/u', $raw) === 1) {
                continue;
            }

            $trimmed = trim($raw);
            $updates[$field] = $trimmed === '' ? null : $trimmed;
        }

        if ($updates !== []) {
            $this->merge($updates);
        }
    }

    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        $nameRule = function (string $attribute, mixed $value, Closure $fail): void {
            if ($value === null) {
                return;
            }
            if (! is_string($value)) {
                $fail("The {$attribute} must be a string.");

                return;
            }
            if (preg_match('/\p{C}/u', $value) === 1) {
                $fail("The {$attribute} must not contain control characters.");

                return;
            }
            if (mb_strlen($value) > 100) {
                $fail("The {$attribute} must not exceed 100 characters.");

                return;
            }
            if (preg_match('/^[\p{L}\p{M}\s.\-\']+$/u', $value) !== 1) {
                $fail("The {$attribute} may only contain letters, spaces, dots, hyphens, and apostrophes.");
            }
        };

        return [
            'first_name' => ['sometimes', 'nullable', 'string', 'max:100', $nameRule],
            'last_name' => ['sometimes', 'nullable', 'string', 'max:100', $nameRule],
            'name' => ['prohibited'],
            'email' => ['prohibited'],
            'mobile' => ['prohibited'],
            'status' => ['prohibited'],
        ];
    }
}


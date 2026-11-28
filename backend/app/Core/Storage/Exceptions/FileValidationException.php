<?php

declare(strict_types=1);

namespace App\Core\Storage\Exceptions;

use App\Core\Http\ProblemDetails;
use Illuminate\Http\JsonResponse;
use RuntimeException;

final class FileValidationException extends RuntimeException
{
    /**
     * @param  array<string, list<string>>  $errors
     */
    public function __construct(
        string $message,
        public readonly array $errors = [],
    ) {
        parent::__construct($message);
    }

    public function render(): JsonResponse
    {
        return ProblemDetails::response(
            title: 'File Validation Failed',
            detail: $this->getMessage(),
            status: 422,
            type: ProblemDetails::type('file-validation-failed'),
            errors: $this->errors,
        );
    }
}

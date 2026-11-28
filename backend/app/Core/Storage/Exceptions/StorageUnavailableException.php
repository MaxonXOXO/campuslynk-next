<?php

declare(strict_types=1);

namespace App\Core\Storage\Exceptions;

use App\Core\Http\ProblemDetails;
use Illuminate\Http\JsonResponse;
use RuntimeException;
use Throwable;

final class StorageUnavailableException extends RuntimeException
{
    public function __construct(string $message = 'File storage is temporarily unavailable.', ?Throwable $previous = null)
    {
        parent::__construct($message, 0, $previous);
    }

    public function render(): JsonResponse
    {
        return ProblemDetails::response(
            title: 'Storage Unavailable',
            detail: $this->getMessage(),
            status: 503,
            type: ProblemDetails::type('storage-unavailable'),
        );
    }
}

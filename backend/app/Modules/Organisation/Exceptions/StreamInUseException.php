<?php

declare(strict_types=1);

namespace App\Modules\Organisation\Exceptions;

use App\Core\Http\ProblemDetails;
use Illuminate\Http\JsonResponse;
use RuntimeException;
use Symfony\Component\HttpFoundation\Response;

class StreamInUseException extends RuntimeException
{
    public function render(): JsonResponse
    {
        return ProblemDetails::response(
            title: 'Conflict',
            detail: $this->getMessage(),
            status: Response::HTTP_CONFLICT,
            type: ProblemDetails::type('stream-in-use')
        );
    }
}

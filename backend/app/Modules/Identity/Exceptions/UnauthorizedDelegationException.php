<?php

declare(strict_types=1);

namespace App\Modules\Identity\Exceptions;

use App\Core\Http\ProblemDetails;
use Illuminate\Http\JsonResponse;
use RuntimeException;
use Symfony\Component\HttpFoundation\Response;

class UnauthorizedDelegationException extends RuntimeException
{
    public function render(): JsonResponse
    {
        return ProblemDetails::response(
            title: 'Forbidden',
            detail: $this->getMessage(),
            status: Response::HTTP_FORBIDDEN
        );
    }
}

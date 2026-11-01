<?php

declare(strict_types=1);

namespace App\Core\Auth\Exceptions;

use App\Core\Http\ProblemDetails;
use Exception;
use Illuminate\Http\JsonResponse;
use Symfony\Component\HttpFoundation\Response;

class AuthenticationException extends Exception
{
    public function render(): JsonResponse
    {
        return ProblemDetails::response(
            title: 'Unauthorized',
            detail: $this->getMessage() ?: 'Invalid credentials provided.',
            status: Response::HTTP_UNAUTHORIZED
        );
    }
}

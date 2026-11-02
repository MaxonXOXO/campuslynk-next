<?php

declare(strict_types=1);

namespace App\Modules\Identity\Exceptions;

use App\Core\Http\ProblemDetails;
use Illuminate\Http\JsonResponse;
use RuntimeException;
use Symfony\Component\HttpFoundation\Response;

class SingletonRoleConflictException extends RuntimeException
{
    public function render(): JsonResponse
    {
        return ProblemDetails::response(
            title: 'Conflict',
            detail: $this->getMessage(),
            status: Response::HTTP_CONFLICT
        );
    }
}

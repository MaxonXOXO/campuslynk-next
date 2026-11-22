<?php

declare(strict_types=1);

namespace App\Modules\Identity\Exceptions;

use App\Core\Http\ProblemDetails;
use Illuminate\Http\JsonResponse;
use RuntimeException;
use Symfony\Component\HttpFoundation\Response;

class PrincipalConflictException extends RuntimeException
{
    public function __construct(
        string $message,
        protected string $problemType = 'conflict',
    ) {
        parent::__construct($message);
    }

    public function render(): JsonResponse
    {
        return ProblemDetails::response(
            title: 'Conflict',
            detail: $this->getMessage(),
            status: Response::HTTP_CONFLICT,
            type: ProblemDetails::type($this->problemType),
        );
    }
}

<?php

declare(strict_types=1);

namespace App\Modules\Identity\Exceptions;

use App\Core\Http\ProblemDetails;
use Exception;
use Illuminate\Http\JsonResponse;
use Symfony\Component\HttpFoundation\Response;

class LockoutException extends Exception
{
    public function __construct(
        public int $seconds,
        string $message = 'Too many login attempts.'
    ) {
        parent::__construct($message);
    }

    public function render(): JsonResponse
    {
        $response = ProblemDetails::response(
            title: 'Too Many Requests',
            detail: sprintf('Too many login attempts. Please try again in %d seconds.', $this->seconds),
            status: Response::HTTP_TOO_MANY_REQUESTS
        );

        $response->headers->set('Retry-After', (string) $this->seconds);

        return $response;
    }
}

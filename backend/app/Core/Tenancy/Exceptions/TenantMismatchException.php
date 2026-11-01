<?php

declare(strict_types=1);

namespace App\Core\Tenancy\Exceptions;

use RuntimeException;
use Symfony\Component\HttpFoundation\Response;

class TenantMismatchException extends RuntimeException
{
    protected int $statusCode = Response::HTTP_BAD_REQUEST;

    public function getStatusCode(): int
    {
        return $this->statusCode;
    }
}

<?php

declare(strict_types=1);

namespace App\Core\Tenancy\Exceptions;

use RuntimeException;
use Symfony\Component\HttpFoundation\Response;

class TenantSuspendedException extends RuntimeException
{
    protected int $statusCode = Response::HTTP_FORBIDDEN;

    public function getStatusCode(): int
    {
        return $this->statusCode;
    }
}

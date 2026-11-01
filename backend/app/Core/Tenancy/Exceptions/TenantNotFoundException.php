<?php

declare(strict_types=1);

namespace App\Core\Tenancy\Exceptions;

use RuntimeException;
use Symfony\Component\HttpFoundation\Response;

class TenantNotFoundException extends RuntimeException
{
    protected int $statusCode = Response::HTTP_NOT_FOUND;

    public function getStatusCode(): int
    {
        return $this->statusCode;
    }
}

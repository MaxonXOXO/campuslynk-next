<?php

declare(strict_types=1);

namespace App\Core\Tenancy\Exceptions;

use RuntimeException;
use Symfony\Component\HttpFoundation\Response;

class TenantProvisioningException extends RuntimeException
{
    protected int $statusCode = Response::HTTP_SERVICE_UNAVAILABLE;

    public function getStatusCode(): int
    {
        return $this->statusCode;
    }
}

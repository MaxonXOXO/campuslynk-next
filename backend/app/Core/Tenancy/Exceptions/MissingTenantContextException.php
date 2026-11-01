<?php

declare(strict_types=1);

namespace App\Core\Tenancy\Exceptions;

use RuntimeException;
use Symfony\Component\HttpFoundation\Response;

class MissingTenantContextException extends RuntimeException
{
    protected int $statusCode = Response::HTTP_INTERNAL_SERVER_ERROR;

    public function getStatusCode(): int
    {
        return $this->statusCode;
    }
}

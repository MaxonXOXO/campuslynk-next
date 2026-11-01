<?php

declare(strict_types=1);

namespace App\Core\Tenancy\Exceptions;

use RuntimeException;

class UnconfiguredDefaultConnectionException extends RuntimeException
{
    public function __construct(
        string $message = 'No tenant context has been established. Direct queries on the default database connection are prohibited. Establish tenant context or explicitly specify the landlord connection.'
    ) {
        parent::__construct($message);
    }
}

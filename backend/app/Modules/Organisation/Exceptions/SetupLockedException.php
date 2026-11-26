<?php

declare(strict_types=1);

namespace App\Modules\Organisation\Exceptions;

use App\Core\Http\ProblemDetails;
use Illuminate\Http\JsonResponse;
use RuntimeException;

class SetupLockedException extends RuntimeException
{
    public function render(): JsonResponse
    {
        return ProblemDetails::response(
            title: 'Locked',
            detail: $this->getMessage(),
            status: 423,
            type: ProblemDetails::type('setup-locked')
        );
    }
}

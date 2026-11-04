<?php

declare(strict_types=1);

namespace App\Modules\Organisation\Exceptions;

use App\Core\Http\ProblemDetails;
use Illuminate\Http\JsonResponse;
use RuntimeException;
use Symfony\Component\HttpFoundation\Response;

class SetupPrerequisitesMissingException extends RuntimeException
{
    /**
     * @param  list<string>  $missing
     */
    public function __construct(
        protected array $missing,
        string $message = 'First-run setup requirements not met.'
    ) {
        parent::__construct($message);
    }

    /**
     * @return list<string>
     */
    public function getMissing(): array
    {
        return $this->missing;
    }

    public function render(): JsonResponse
    {
        return ProblemDetails::response(
            title: 'Unprocessable Content',
            detail: $this->getMessage().' '.implode(' ', $this->missing),
            status: Response::HTTP_UNPROCESSABLE_ENTITY,
            type: ProblemDetails::type('setup-prerequisites-missing'),
            errors: ['missing' => $this->missing]
        );
    }
}

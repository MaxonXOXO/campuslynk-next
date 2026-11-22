<?php

declare(strict_types=1);

namespace App\Modules\Identity\Services;

use App\Modules\Identity\Models\RoleAssignment;
use Illuminate\Support\Carbon;

final readonly class PrincipalActionResult
{
    public function __construct(
        public RoleAssignment $assignment,
        public ?string $previousAssignmentId,
        public ?string $temporaryPassword,
        public ?Carbon $temporaryPasswordExpiresAt,
    ) {}
}

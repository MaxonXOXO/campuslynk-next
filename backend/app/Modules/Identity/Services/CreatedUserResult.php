<?php

declare(strict_types=1);

namespace App\Modules\Identity\Services;

use App\Modules\Identity\Models\User;
use Illuminate\Support\Carbon;

final readonly class CreatedUserResult
{
    public function __construct(
        public User $user,
        public ?string $temporaryPassword,
        public Carbon $temporaryPasswordExpiresAt,
    ) {}
}

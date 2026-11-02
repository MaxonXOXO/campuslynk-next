<?php

declare(strict_types=1);

namespace App\Modules\Identity\Contracts;

use App\Modules\Identity\Models\PersonalAccessToken;
use App\Modules\Identity\Models\User;

interface ChangesPasswordContract
{
    /**
     * Change password for the given authenticated user and revoke other tokens.
     */
    public function execute(
        User $user,
        string $currentPassword,
        string $newPassword,
        string $ip,
        ?PersonalAccessToken $currentToken = null
    ): void;
}

<?php

declare(strict_types=1);

namespace App\Modules\Identity\Contracts;

use App\Modules\Identity\Models\User;
use App\Modules\Identity\Services\TemporaryPasswordResult;
use Illuminate\Support\Carbon;

interface IssuesTemporaryPasswordContract
{
    /**
     * Generate a cryptographically random temporary password meeting policy complexity.
     */
    public function generatePassword(): string;

    /**
     * Compute the expiry timestamp for a newly issued temporary password.
     */
    public function resolveExpiresAt(): Carbon;

    /**
     * Issue and persist a temporary password on an existing user account.
     */
    public function issue(User $user, ?string $explicitPassword = null): TemporaryPasswordResult;
}

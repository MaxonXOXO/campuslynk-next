<?php

declare(strict_types=1);

namespace App\Modules\Identity\Actions;

use App\Modules\Identity\Models\User;

class SuspendUserAction
{
    public function execute(User $suspender, User $user): User
    {
        $user->status = 'suspended';
        $user->save();

        // Immediately revoke all personal access tokens (ADR-0011)
        $user->tokens()->delete();

        activity('security')
            ->performedOn($user)
            ->causedBy($suspender)
            ->log("Suspended user [{$user->name}] and revoked active tokens.");

        return $user;
    }
}

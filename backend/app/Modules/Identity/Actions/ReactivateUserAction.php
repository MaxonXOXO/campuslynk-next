<?php

declare(strict_types=1);

namespace App\Modules\Identity\Actions;

use App\Modules\Identity\Models\User;

class ReactivateUserAction
{
    public function execute(User $actor, User $user): User
    {
        $user->status = 'active';
        $user->save();

        activity('security')
            ->performedOn($user)
            ->causedBy($actor)
            ->log("Reactivated user [{$user->name}].");

        return $user;
    }
}


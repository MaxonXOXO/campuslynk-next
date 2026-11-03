<?php

declare(strict_types=1);

namespace App\Modules\Identity\Actions;

use App\Modules\Identity\Models\User;

final class UpdateUserAction
{
    /**
     * @param  array<string, mixed>  $attributes
     */
    public function execute(User $updater, User $user, array $attributes): User
    {
        $user->fill($attributes);
        $user->save();

        activity('identity')
            ->performedOn($user)
            ->causedBy($updater)
            ->log("Updated user [{$user->name}].");

        return $user;
    }
}

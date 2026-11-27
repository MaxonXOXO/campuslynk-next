<?php

declare(strict_types=1);

namespace App\Modules\Identity\Actions;

use App\Modules\Identity\Models\User;

final class UpdateMeAction
{
    /**
     * @param  array{first_name?: string|null, last_name?: string|null}  $attributes
     */
    public function execute(User $user, array $attributes): User
    {
        $oldValues = [];
        $newValues = [];

        foreach (['first_name', 'last_name'] as $field) {
            if (! array_key_exists($field, $attributes)) {
                continue;
            }

            $next = $attributes[$field];
            $prev = $user->{$field};

            if ($prev !== $next) {
                $oldValues[$field] = $prev;
                $newValues[$field] = $next;
                $user->{$field} = $next;
            }
        }

        if ($newValues !== []) {
            $user->save();

            activity('identity')
                ->event('user.profile_updated')
                ->performedOn($user)
                ->causedBy($user)
                ->withProperties([
                    'target_user_id' => $user->id,
                    'old_values' => $oldValues,
                    'new_values' => $newValues,
                ])
                ->log("Updated profile name fields for [{$user->name}].");
        }

        return $user;
    }
}

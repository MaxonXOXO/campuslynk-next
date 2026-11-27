<?php

declare(strict_types=1);

namespace App\Modules\Identity\Actions;

use App\Modules\Identity\Models\User;
use App\Modules\Identity\Services\UserAuditScopeResolver;

final class UpdateUserAction
{
    public function __construct(private readonly UserAuditScopeResolver $scopeResolver) {}

    /**
     * @param  array<string, mixed>  $attributes
     */
    public function execute(User $updater, User $user, array $attributes): User
    {
        $user->fill($attributes);

        $oldValues = [];
        $newValues = [];
        foreach (['name', 'first_name', 'last_name'] as $field) {
            if ($user->isDirty($field)) {
                $oldValues[$field] = $user->getOriginal($field);
                $newValues[$field] = $user->getAttribute($field);
            }
        }

        $user->save();

        $scope = $this->scopeResolver->resolveForUser($user);

        $properties = [
            'target_user_id' => $user->id,
            'scope_path' => $scope['scope_path'],
            'department_id' => $scope['department_id'],
        ];
        if ($newValues !== []) {
            $properties['old_values'] = $oldValues;
            $properties['new_values'] = $newValues;
        }

        activity('identity')
            ->event('user.updated')
            ->performedOn($user)
            ->causedBy($updater)
            ->withProperties($properties)
            ->log("Updated user [{$user->name}].");

        return $user;
    }
}

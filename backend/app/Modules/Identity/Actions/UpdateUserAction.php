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
        $user->save();

        $scope = $this->scopeResolver->resolveForUser($user);

        activity('identity')
            ->event('user.updated')
            ->performedOn($user)
            ->causedBy($updater)
            ->withProperties([
                'target_user_id' => $user->id,
                'scope_path' => $scope['scope_path'],
                'department_id' => $scope['department_id'],
            ])
            ->log("Updated user [{$user->name}].");

        return $user;
    }
}

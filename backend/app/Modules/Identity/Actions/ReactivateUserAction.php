<?php

declare(strict_types=1);

namespace App\Modules\Identity\Actions;

use App\Modules\Identity\Exceptions\UserLifecycleConflictException;
use App\Modules\Identity\Models\User;
use App\Modules\Identity\Services\UserAuditScopeResolver;

final class ReactivateUserAction
{
    public function __construct(private readonly UserAuditScopeResolver $scopeResolver) {}

    public function execute(User $actor, User $user): User
    {
        if (! in_array($user->status, ['suspended', 'deactivated'], true)) {
            throw new UserLifecycleConflictException(
                "Only suspended or deactivated user accounts can be reactivated (current status: {$user->status}).",
                'invalid-status-transition'
            );
        }

        $previousStatus = $user->status;
        $user->status = 'active';
        $user->status_reason = null;
        $user->save();

        $scope = $this->scopeResolver->resolveForUser($user);

        activity('security')
            ->event('user.reactivated')
            ->performedOn($user)
            ->causedBy($actor)
            ->withProperties([
                'target_user_id' => $user->id,
                'previous_status' => $previousStatus,
                'new_status' => 'active',
                'scope_path' => $scope['scope_path'],
                'department_id' => $scope['department_id'],
            ])
            ->log("Reactivated user [{$user->name}].");

        return $user;
    }
}

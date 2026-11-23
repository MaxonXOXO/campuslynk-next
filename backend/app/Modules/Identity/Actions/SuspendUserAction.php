<?php

declare(strict_types=1);

namespace App\Modules\Identity\Actions;

use App\Modules\Identity\Exceptions\UserLifecycleConflictException;
use App\Modules\Identity\Models\User;
use App\Modules\Identity\Services\UserAuditScopeResolver;

final class SuspendUserAction
{
    public function __construct(private readonly UserAuditScopeResolver $scopeResolver) {}

    public function execute(User $suspender, User $user): User
    {
        if (! $user->isActive()) {
            throw new UserLifecycleConflictException(
                "Only active user accounts can be suspended (current status: {$user->status}).",
                'invalid-status-transition'
            );
        }

        $user->status = 'suspended';
        $user->save();

        // Immediately revoke all personal access tokens (ADR-0011)
        $user->tokens()->delete();

        $scope = $this->scopeResolver->resolveForUser($user);

        activity('security')
            ->event('user.suspended')
            ->performedOn($user)
            ->causedBy($suspender)
            ->withProperties([
                'target_user_id' => $user->id,
                'previous_status' => 'active',
                'new_status' => 'suspended',
                'scope_path' => $scope['scope_path'],
                'department_id' => $scope['department_id'],
            ])
            ->log("Suspended user [{$user->name}] and revoked active tokens.");

        return $user;
    }
}

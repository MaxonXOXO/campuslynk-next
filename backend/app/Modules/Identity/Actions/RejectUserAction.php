<?php

declare(strict_types=1);

namespace App\Modules\Identity\Actions;

use App\Modules\Identity\Exceptions\UserLifecycleConflictException;
use App\Modules\Identity\Models\User;
use App\Modules\Identity\Services\UserAuditScopeResolver;

final class RejectUserAction
{
    public function __construct(private readonly UserAuditScopeResolver $scopeResolver) {}

    public function execute(User $actor, User $target, string $reason): User
    {
        if (! $target->isPending()) {
            throw new UserLifecycleConflictException(
                "Only pending user accounts can be rejected (current status: {$target->status}).",
                'invalid-status-transition'
            );
        }

        $target->status = 'rejected';
        $target->status_reason = $reason;
        $target->save();

        $target->tokens()->delete();

        $scope = $this->scopeResolver->resolveForUser($target);

        activity('identity')
            ->event('user.rejected')
            ->performedOn($target)
            ->causedBy($actor)
            ->withProperties([
                'target_user_id' => $target->id,
                'previous_status' => 'pending',
                'new_status' => 'rejected',
                'reason' => $reason,
                'scope_path' => $scope['scope_path'],
                'department_id' => $scope['department_id'],
            ])
            ->log("Rejected pending user [{$target->name}].");

        return $target;
    }
}

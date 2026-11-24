<?php

declare(strict_types=1);

namespace App\Modules\Identity\Actions;

use App\Modules\Identity\Contracts\IssuesTemporaryPasswordContract;
use App\Modules\Identity\Events\UserApproved;
use App\Modules\Identity\Exceptions\UserLifecycleConflictException;
use App\Modules\Identity\Models\User;
use App\Modules\Identity\Services\UserAuditScopeResolver;
use Illuminate\Support\Facades\DB;

final class ApproveUserAction
{
    public function __construct(
        private readonly UserAuditScopeResolver $scopeResolver,
        private readonly IssuesTemporaryPasswordContract $temporaryPasswordIssuer,
    ) {}

    public function execute(User $actor, User $target): User
    {
        if (! $target->isPending()) {
            throw new UserLifecycleConflictException(
                "Only pending user accounts can be approved (current status: {$target->status}).",
                'invalid-status-transition'
            );
        }

        $target->status = 'active';
        $target->status_reason = null;
        $target->rejected_at = null;

        // Start temporary password expiry clock at approval for bulk-imported staff
        if ($target->must_change_password) {
            $target->temporary_password_expires_at = $this->temporaryPasswordIssuer->resolveExpiresAt();
        }

        $target->save();

        $scope = $this->scopeResolver->resolveForUser($target);

        activity('identity')
            ->event('user.approved')
            ->performedOn($target)
            ->causedBy($actor)
            ->withProperties([
                'target_user_id' => $target->id,
                'previous_status' => 'pending',
                'new_status' => 'active',
                'scope_path' => $scope['scope_path'],
                'department_id' => $scope['department_id'],
            ])
            ->log("Approved pending user [{$target->name}].");

        DB::connection('tenant')->afterCommit(function () use ($target, $actor): void {
            UserApproved::dispatch($target, $actor);
        });

        return $target;
    }
}

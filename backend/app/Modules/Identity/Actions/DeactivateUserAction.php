<?php

declare(strict_types=1);

namespace App\Modules\Identity\Actions;

use App\Modules\Identity\Events\RoleRevoked;
use App\Modules\Identity\Exceptions\UserLifecycleConflictException;
use App\Modules\Identity\Models\RoleAssignment;
use App\Modules\Identity\Models\User;
use App\Modules\Identity\Services\UserAuditScopeResolver;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

final class DeactivateUserAction
{
    public function __construct(private readonly UserAuditScopeResolver $scopeResolver) {}

    public function execute(User $actor, User $target, string $reason): User
    {
        if ($target->status === 'deactivated') {
            throw new UserLifecycleConflictException(
                'User account is already deactivated.',
                'invalid-status-transition'
            );
        }

        $previousStatus = $target->status;
        $scope = $this->scopeResolver->resolveForUser($target);

        DB::connection('tenant')->transaction(function () use ($actor, $target, $reason): void {
            $hasActiveSuperAdmin = RoleAssignment::query()
                ->where('user_id', $target->id)
                ->active()
                ->whereHas('role', fn ($q) => $q->where('key', 'super_admin'))
                ->exists();

            if ($hasActiveSuperAdmin) {
                $activeSuperAdminUserCount = RoleAssignment::query()
                    ->active()
                    ->whereHas('role', fn ($q) => $q->where('key', 'super_admin'))
                    ->whereHas('user', fn ($q) => $q->where('status', 'active'))
                    ->distinct('user_id')
                    ->count('user_id');

                if ($activeSuperAdminUserCount <= 1) {
                    throw new UserLifecycleConflictException(
                        'Cannot deactivate the last active Super Admin account.',
                        'last-super-admin'
                    );
                }
            }

            $now = Carbon::now();

            /** @var Collection<int, RoleAssignment> $activeAssignments */
            $activeAssignments = RoleAssignment::query()
                ->where('user_id', $target->id)
                ->whereRaw('is_active is true')
                ->lockForUpdate()
                ->get();

            foreach ($activeAssignments as $assignment) {
                $effectiveEnd = ($assignment->valid_from !== null && $assignment->valid_from->gte($now))
                    ? $assignment->valid_from->copy()->addMicrosecond()
                    : $now;

                $assignment->is_active = false;
                $assignment->valid_to = $effectiveEnd;
                $assignment->reason = $reason;
                $assignment->save();

                RoleRevoked::dispatch($assignment);
            }

            $target->status = 'deactivated';
            $target->status_reason = $reason;
            $target->deactivated_at = $now;
            $target->deactivated_by_user_id = $actor->id;
            $target->save();

            $target->tokens()->delete();
        });

        activity('security')
            ->event('user.deactivated')
            ->performedOn($target)
            ->causedBy($actor)
            ->withProperties([
                'target_user_id' => $target->id,
                'previous_status' => $previousStatus,
                'new_status' => 'deactivated',
                'reason' => $reason,
                'scope_path' => $scope['scope_path'],
                'department_id' => $scope['department_id'],
            ])
            ->log("Deactivated user [{$target->name}] and ended active role assignments.");

        return $target;
    }
}

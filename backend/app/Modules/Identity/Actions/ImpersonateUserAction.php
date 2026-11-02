<?php

declare(strict_types=1);

namespace App\Modules\Identity\Actions;

use App\Modules\Identity\Models\Role;
use App\Modules\Identity\Models\RoleAssignment;
use App\Modules\Identity\Models\User;
use Illuminate\Support\Carbon;
use InvalidArgumentException;

class ImpersonateUserAction
{
    /**
     * Academic and HR-approval roles requiring mandatory read-only impersonation per ADR-0004.
     *
     * @var list<string>
     */
    protected const ACADEMIC_APPROVAL_ROLES = [
        'principal',
        'hod',
        'gen_dept_coordinator',
        'academic_coordinator',
        'tutor',
        'course_teacher',
    ];

    /**
     * @return array{
     *     token: string,
     *     user: User,
     *     read_only: bool,
     *     expires_at: Carbon,
     *     ticket: string
     * }
     */
    public function execute(User $admin, string $targetUserId, string $ticket, string $reason): array
    {
        /** @var User $targetUser */
        $targetUser = User::findOrFail($targetUserId);

        if ($targetUser->id === $admin->id) {
            throw new InvalidArgumentException('Cannot impersonate self.');
        }

        // Fetch active role keys of the target user
        /** @var list<string> $targetRoleKeys */
        $targetRoleKeys = Role::whereIn(
            'id',
            RoleAssignment::where('user_id', $targetUser->id)->active()->pluck('role_id')
        )->pluck('key')->all();

        if (in_array('super_admin', $targetRoleKeys, true)) {
            throw new InvalidArgumentException('Impersonation of another Super Admin is prohibited.');
        }

        // Check if user holds any academic or HR approval role
        $hasAcademicRole = ! empty(array_intersect(self::ACADEMIC_APPROVAL_ROLES, $targetRoleKeys));
        $isReadOnly = $hasAcademicRole;

        $abilities = $isReadOnly ? ['impersonation:read_only'] : ['*'];
        $expiresAt = Carbon::now()->addMinutes(30);

        // Issue time-limited Sanctum token
        $token = $targetUser->createToken(
            name: "impersonation:{$admin->id}:{$ticket}",
            abilities: $abilities,
            expiresAt: $expiresAt
        );

        // Security audit trail (visible in target user's security log and tenant audit log)
        activity('security')
            ->performedOn($targetUser)
            ->causedBy($admin)
            ->withProperties([
                'admin_id' => $admin->id,
                'target_user_id' => $targetUser->id,
                'ticket' => $ticket,
                'reason' => $reason,
                'read_only' => $isReadOnly,
                'roles' => $targetRoleKeys,
                'expires_at' => $expiresAt->toIso8601String(),
            ])
            ->log("Started impersonation session for [{$targetUser->name}] ({$ticket}) - read_only: ".($isReadOnly ? 'true' : 'false'));

        return [
            'token' => $token->plainTextToken,
            'user' => $targetUser,
            'read_only' => $isReadOnly,
            'expires_at' => $expiresAt,
            'ticket' => $ticket,
        ];
    }
}

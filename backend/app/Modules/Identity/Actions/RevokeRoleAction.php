<?php

declare(strict_types=1);

namespace App\Modules\Identity\Actions;

use App\Modules\Identity\Events\RoleRevoked;
use App\Modules\Identity\Exceptions\UnauthorizedDelegationException;
use App\Modules\Identity\Models\RoleAssignment;
use App\Modules\Identity\Models\User;
use App\Modules\Identity\Services\ScopeAuthorizer;
use Illuminate\Support\Carbon;

final class RevokeRoleAction
{
    public function __construct(
        protected ScopeAuthorizer $authorizer
    ) {}

    public function execute(
        User $revoker,
        RoleAssignment $assignment,
        ?string $reason = null,
        bool $bypassAuthorization = false
    ): RoleAssignment {
        if (! $bypassAuthorization) {
            if (! $this->authorizer->canAccessAssignment($revoker, 'identity.role.assign', $assignment)) {
                throw new UnauthorizedDelegationException(
                    "Revoker does not possess role authority at scope [{$assignment->scope_label}]."
                );
            }
        }

        $now = Carbon::now();
        $validTo = ($assignment->valid_from !== null && $assignment->valid_from->gte($now))
            ? $assignment->valid_from->copy()->addMicrosecond()
            : $now;

        $assignment->is_active = false;
        $assignment->valid_to = $validTo;
        if ($reason !== null && trim($reason) !== '') {
            $assignment->reason = trim($reason);
        }
        $assignment->save();

        // Activity audit logging
        activity('rbac')
            ->event('role_assignment.revoked')
            ->performedOn($assignment)
            ->causedBy($revoker)
            ->withProperties([
                'user_id' => $assignment->user_id,
                'role_id' => $assignment->role_id,
                'scope_label' => $assignment->scope_label,
                'reason' => $assignment->reason,
            ])
            ->log("Revoked role assignment [{$assignment->id}] at scope [{$assignment->scope_label}].");

        RoleRevoked::dispatch($assignment);

        return $assignment;
    }
}

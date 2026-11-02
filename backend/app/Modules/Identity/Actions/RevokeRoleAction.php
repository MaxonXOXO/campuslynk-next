<?php

declare(strict_types=1);

namespace App\Modules\Identity\Actions;

use App\Modules\Identity\Events\RoleRevoked;
use App\Modules\Identity\Exceptions\UnauthorizedDelegationException;
use App\Modules\Identity\Models\RoleAssignment;
use App\Modules\Identity\Models\User;
use App\Modules\Identity\Services\ScopeAuthorizer;
use Illuminate\Support\Carbon;

class RevokeRoleAction
{
    public function __construct(
        protected ScopeAuthorizer $authorizer
    ) {}

    public function execute(
        User $revoker,
        RoleAssignment $assignment,
        bool $bypassAuthorization = false
    ): RoleAssignment {
        if (! $bypassAuthorization) {
            if (! $this->authorizer->canAtScope($revoker, 'identity.role.assign', $assignment->scope_label)) {
                throw new UnauthorizedDelegationException(
                    "Revoker does not possess role authority at scope [{$assignment->scope_label}]."
                );
            }
        }

        $assignment->is_active = false;
        $assignment->valid_to = Carbon::now();
        $assignment->save();

        // Activity audit logging
        activity('rbac')
            ->performedOn($assignment)
            ->causedBy($revoker)
            ->withProperties([
                'user_id' => $assignment->user_id,
                'role_id' => $assignment->role_id,
                'scope_label' => $assignment->scope_label,
            ])
            ->log("Revoked role assignment [{$assignment->id}] at scope [{$assignment->scope_label}].");

        RoleRevoked::dispatch($assignment);

        return $assignment;
    }
}

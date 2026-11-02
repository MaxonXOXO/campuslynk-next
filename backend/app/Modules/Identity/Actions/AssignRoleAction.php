<?php

declare(strict_types=1);

namespace App\Modules\Identity\Actions;

use App\Modules\Identity\Events\RoleAssigned;
use App\Modules\Identity\Exceptions\SingletonRoleConflictException;
use App\Modules\Identity\Exceptions\UnauthorizedDelegationException;
use App\Modules\Identity\Models\DelegationRule;
use App\Modules\Identity\Models\Role;
use App\Modules\Identity\Models\RoleAssignment;
use App\Modules\Identity\Models\User;
use App\Modules\Identity\Services\ScopeAuthorizer;
use Illuminate\Database\QueryException;
use Illuminate\Support\Carbon;
use InvalidArgumentException;

class AssignRoleAction
{
    public function __construct(
        protected ScopeAuthorizer $authorizer
    ) {}

    public function execute(
        User $assigner,
        User $targetUser,
        Role $targetRole,
        string $scopeType,
        string $scopeLabel,
        ?string $scopeId = null,
        ?Carbon $validFrom = null,
        ?Carbon $validTo = null,
        ?string $orderRecord = null,
        bool $bypassDelegationCheck = false
    ): RoleAssignment {
        // 1. Delegation matrix verification (unless explicitly bypassed during system bootstrap)
        if (! $bypassDelegationCheck) {
            $this->verifyDelegation($assigner, $targetRole, $scopeLabel, $orderRecord);
        }

        // 2. Insert assignment with singleton exclusion constraint safety
        try {
            /** @var RoleAssignment $assignment */
            $assignment = RoleAssignment::create([
                'user_id' => $targetUser->id,
                'role_id' => $targetRole->id,
                'scope_type' => $scopeType,
                'scope_id' => $scopeId,
                'scope_label' => $scopeLabel,
                'is_singleton' => $targetRole->is_singleton,
                'valid_from' => $validFrom ?? Carbon::now(),
                'valid_to' => $validTo,
                'is_active' => true,
                'assigned_by_user_id' => $assigner->id,
                'order_record' => $orderRecord,
            ]);
        } catch (QueryException $e) {
            if (str_contains($e->getMessage(), 'role_assignments_singleton_no_overlap')) {
                throw new SingletonRoleConflictException(
                    "Role [{$targetRole->name}] is a singleton and is already actively assigned for scope [{$scopeLabel}]."
                );
            }
            throw $e;
        }

        // 3. Activity audit logging (spatie/laravel-activitylog)
        activity('rbac')
            ->performedOn($assignment)
            ->causedBy($assigner)
            ->withProperties([
                'target_user_id' => $targetUser->id,
                'role_key' => $targetRole->key,
                'scope_label' => $scopeLabel,
                'order_record' => $orderRecord,
            ])
            ->log("Assigned role [{$targetRole->key}] to user [{$targetUser->name}] at scope [{$scopeLabel}].");

        // 4. Dispatch domain event
        RoleAssigned::dispatch($assignment);

        return $assignment;
    }

    /**
     * Verify delegation rules and scope authority.
     */
    protected function verifyDelegation(
        User $assigner,
        Role $targetRole,
        string $scopeLabel,
        ?string $orderRecord
    ): void {
        /** @var list<string> $assignerRoleKeys */
        $assignerRoleKeys = Role::whereIn(
            'id',
            RoleAssignment::where('user_id', $assigner->id)->active()->pluck('role_id')
        )->pluck('key')->all();

        if (empty($assignerRoleKeys)) {
            throw new UnauthorizedDelegationException('Assigner holds no active roles.');
        }

        /** @var DelegationRule|null $rule */
        $rule = DelegationRule::whereIn('assigner_role_key', $assignerRoleKeys)
            ->where('assignee_role_key', $targetRole->key)
            ->first();

        if ($rule === null) {
            throw new UnauthorizedDelegationException(
                "None of the assigner's roles are permitted to assign role [{$targetRole->key}]."
            );
        }

        if ($rule->requires_order_record && (empty($orderRecord) || trim($orderRecord) === '')) {
            throw new InvalidArgumentException(
                "Assigning role [{$targetRole->key}] requires an official order reference."
            );
        }

        // Check if assigner has authority over scope
        if (! $this->authorizer->canAtScope($assigner, 'identity.role.assign', $scopeLabel)) {
            throw new UnauthorizedDelegationException(
                "Assigner does not possess role assignment authority at scope [{$scopeLabel}]."
            );
        }
    }
}

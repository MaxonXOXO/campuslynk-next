<?php

declare(strict_types=1);

namespace App\Modules\Identity\Actions;

use App\Modules\Identity\Events\RoleAssigned;
use App\Modules\Identity\Events\RoleRevoked;
use App\Modules\Identity\Exceptions\PrincipalConflictException;
use App\Modules\Identity\Exceptions\SingletonRoleConflictException;
use App\Modules\Identity\Exceptions\UnauthorizedDelegationException;
use App\Modules\Identity\Models\Role;
use App\Modules\Identity\Models\RoleAssignment;
use App\Modules\Identity\Models\User;
use App\Modules\Identity\Services\PrincipalActionResult;
use App\Modules\Identity\Services\ScopeAuthorizer;
use Illuminate\Database\QueryException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

final class ReplacePrincipalAction
{
    public function __construct(
        protected CreateUserAction $createUserAction,
        protected ScopeAuthorizer $authorizer,
    ) {}

    /**
     * Atomically end the current Principal assignment and appoint a replacement Principal
     * within a single database transaction so there is never a window without a Principal.
     *
     * @param  array{name: string, email?: string|null, mobile?: string|null, registration_number?: string|null}|null  $newUserAttributes
     */
    public function execute(
        User $actor,
        ?string $userId,
        ?array $newUserAttributes,
        string $reason,
        ?string $orderRecord = null,
    ): PrincipalActionResult {
        $superAdminAssignment = $this->resolveSuperAdminInstitutionAssignment($actor);
        $scopeLabel = $superAdminAssignment->scope_label;

        /** @var Role $principalRole */
        $principalRole = Role::where('key', 'principal')->firstOrFail();

        return DB::connection('tenant')->transaction(function () use (
            $actor,
            $userId,
            $newUserAttributes,
            $reason,
            $orderRecord,
            $principalRole,
            $scopeLabel,
        ): PrincipalActionResult {
            // Serialize concurrent principal replacements per institution scope
            DB::connection('tenant')->statement(
                'SELECT pg_advisory_xact_lock(hashtext(?))',
                ['principal:'.$scopeLabel]
            );

            /** @var RoleAssignment|null $outgoing */
            $outgoing = RoleAssignment::query()
                ->where('role_id', $principalRole->id)
                ->where('scope_label', $scopeLabel)
                ->whereRaw('is_active is true')
                ->lockForUpdate()
                ->first();

            if ($outgoing === null) {
                throw new PrincipalConflictException(
                    "No active Principal exists for scope [{$scopeLabel}] to replace. Use POST /principal/appoint for initial appointment.",
                    'no-active-principal'
                );
            }

            $temporaryPassword = null;
            $temporaryPasswordExpiresAt = null;

            if ($newUserAttributes !== null) {
                $created = $this->createUserAction->execute($actor, [
                    'type' => 'staff',
                    'name' => $newUserAttributes['name'],
                    'email' => $newUserAttributes['email'] ?? null,
                    'mobile' => $newUserAttributes['mobile'] ?? null,
                    'registration_number' => $newUserAttributes['registration_number'] ?? null,
                ]);
                $targetUser = $created->user;
                $temporaryPassword = $created->temporaryPassword;
                $temporaryPasswordExpiresAt = $created->temporaryPasswordExpiresAt;
            } else {
                /** @var User|null $targetUser */
                $targetUser = User::find((string) $userId);
                if ($targetUser === null) {
                    throw ValidationException::withMessages([
                        'user_id' => ['The specified replacement user does not exist.'],
                    ]);
                }
                if (! $targetUser->isActive()) {
                    throw ValidationException::withMessages([
                        'user_id' => ['Only an active user account can be appointed as Principal.'],
                    ]);
                }
                if ($targetUser->id === $outgoing->user_id) {
                    throw new PrincipalConflictException(
                        'The specified user is already the active Principal.',
                        'same-principal'
                    );
                }
            }

            $now = Carbon::now();
            $effectiveAt = ($outgoing->valid_from !== null && $outgoing->valid_from->gte($now))
                ? $outgoing->valid_from->copy()->addMicrosecond()
                : $now;

            $outgoing->is_active = false;
            $outgoing->valid_to = $effectiveAt;
            $outgoing->reason = $reason;
            $outgoing->save();

            try {
                /** @var RoleAssignment $incoming */
                $incoming = RoleAssignment::create([
                    'user_id' => $targetUser->id,
                    'role_id' => $principalRole->id,
                    'scope_type' => 'institution',
                    'scope_id' => $outgoing->scope_id,
                    'scope_label' => $scopeLabel,
                    'is_singleton' => true,
                    'valid_from' => $effectiveAt,
                    'valid_to' => null,
                    'is_active' => true,
                    'assigned_by_user_id' => $actor->id,
                    'order_record' => $orderRecord,
                    'reason' => $reason,
                ]);
            } catch (QueryException $e) {
                if (str_contains($e->getMessage(), 'role_assignments_singleton_no_overlap')) {
                    throw new SingletonRoleConflictException(
                        "Concurrent Principal assignment conflict at scope [{$scopeLabel}]."
                    );
                }
                throw $e;
            }

            activity('rbac')
                ->event('principal.replaced')
                ->performedOn($incoming)
                ->causedBy($actor)
                ->withProperties([
                    'previous_assignment_id' => $outgoing->id,
                    'previous_user_id' => $outgoing->user_id,
                    'new_assignment_id' => $incoming->id,
                    'new_user_id' => $targetUser->id,
                    'scope_label' => $scopeLabel,
                    'reason' => $reason,
                    'order_record' => $orderRecord,
                ])
                ->log("Replaced Principal at scope [{$scopeLabel}] with [{$targetUser->name}].");

            RoleRevoked::dispatch($outgoing);
            RoleAssigned::dispatch($incoming);

            return new PrincipalActionResult(
                assignment: $incoming,
                previousAssignmentId: $outgoing->id,
                temporaryPassword: $temporaryPassword,
                temporaryPasswordExpiresAt: $temporaryPasswordExpiresAt,
            );
        });
    }

    protected function resolveSuperAdminInstitutionAssignment(User $actor): RoleAssignment
    {
        /** @var RoleAssignment|null $assignment */
        $assignment = $this->authorizer
            ->activeAssignmentsForPermission($actor, 'identity.role.assign')
            ->first(fn (RoleAssignment $a): bool => $a->scope_type === 'institution' && $a->role->key === 'super_admin');

        if ($assignment === null) {
            throw new UnauthorizedDelegationException(
                'Only a Super Admin at institution scope can replace the Principal.'
            );
        }

        return $assignment;
    }
}

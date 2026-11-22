<?php

declare(strict_types=1);

namespace App\Modules\Identity\Actions;

use App\Modules\Identity\Events\RoleAssigned;
use App\Modules\Identity\Exceptions\SingletonRoleConflictException;
use App\Modules\Identity\Exceptions\UnauthorizedDelegationException;
use App\Modules\Identity\Models\Role;
use App\Modules\Identity\Models\RoleAssignment;
use App\Modules\Identity\Models\User;
use App\Modules\Identity\Services\PrincipalActionResult;
use Illuminate\Database\QueryException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

final class AppointPrincipalAction
{
    public function __construct(
        protected CreateUserAction $createUserAction,
    ) {}

    /**
     * Atomically appoint the initial institution Principal (existing active user or newly created staff user).
     *
     * @param  array{name: string, email?: string|null, mobile?: string|null, registration_number?: string|null}|null  $newUserAttributes
     */
    public function execute(
        User $actor,
        ?string $userId,
        ?array $newUserAttributes,
        ?string $orderRecord = null,
        ?string $reason = null,
    ): PrincipalActionResult {
        $superAdminAssignment = $this->resolveSuperAdminInstitutionAssignment($actor);
        $scopeLabel = $superAdminAssignment->scope_label;
        $scopeId = $superAdminAssignment->scope_id;

        /** @var Role $principalRole */
        $principalRole = Role::where('key', 'principal')->firstOrFail();

        return DB::connection('tenant')->transaction(function () use (
            $actor,
            $userId,
            $newUserAttributes,
            $orderRecord,
            $reason,
            $principalRole,
            $scopeLabel,
            $scopeId,
        ): PrincipalActionResult {
            // Serialize concurrent principal mutations per institution scope
            DB::connection('tenant')->statement(
                'SELECT pg_advisory_xact_lock(hashtext(?))',
                ['principal:'.$scopeLabel]
            );

            $existingActive = RoleAssignment::query()
                ->where('role_id', $principalRole->id)
                ->where('scope_label', $scopeLabel)
                ->whereRaw('is_active is true')
                ->lockForUpdate()
                ->first();

            if ($existingActive !== null) {
                throw new SingletonRoleConflictException(
                    "An active Principal is already appointed for scope [{$scopeLabel}]. Use POST /principal/replace to transition the Principal."
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
                        'user_id' => ['The specified user does not exist.'],
                    ]);
                }
                if (! $targetUser->isActive()) {
                    throw ValidationException::withMessages([
                        'user_id' => ['Only an active user account can be appointed as Principal.'],
                    ]);
                }
            }

            try {
                /** @var RoleAssignment $assignment */
                $assignment = RoleAssignment::create([
                    'user_id' => $targetUser->id,
                    'role_id' => $principalRole->id,
                    'scope_type' => 'institution',
                    'scope_id' => $scopeId,
                    'scope_label' => $scopeLabel,
                    'is_singleton' => true,
                    'valid_from' => Carbon::now(),
                    'valid_to' => null,
                    'is_active' => true,
                    'assigned_by_user_id' => $actor->id,
                    'order_record' => $orderRecord,
                    'reason' => $reason,
                ]);
            } catch (QueryException $e) {
                if (str_contains($e->getMessage(), 'role_assignments_singleton_no_overlap')) {
                    throw new SingletonRoleConflictException(
                        "An active Principal is already appointed for scope [{$scopeLabel}]."
                    );
                }
                throw $e;
            }

            activity('rbac')
                ->event('principal.appointed')
                ->performedOn($assignment)
                ->causedBy($actor)
                ->withProperties([
                    'target_user_id' => $targetUser->id,
                    'role_key' => 'principal',
                    'scope_label' => $scopeLabel,
                    'order_record' => $orderRecord,
                    'reason' => $reason,
                ])
                ->log("Appointed [{$targetUser->name}] as Principal at scope [{$scopeLabel}].");

            RoleAssigned::dispatch($assignment);

            return new PrincipalActionResult(
                assignment: $assignment,
                previousAssignmentId: null,
                temporaryPassword: $temporaryPassword,
                temporaryPasswordExpiresAt: $temporaryPasswordExpiresAt,
            );
        });
    }

    protected function resolveSuperAdminInstitutionAssignment(User $actor): RoleAssignment
    {
        /** @var RoleAssignment|null $assignment */
        $assignment = RoleAssignment::query()
            ->where('user_id', $actor->id)
            ->where('scope_type', 'institution')
            ->active()
            ->whereHas('role', fn ($q) => $q->where('key', 'super_admin'))
            ->first();

        if ($assignment === null) {
            throw new UnauthorizedDelegationException(
                'Only a Super Admin at institution scope can appoint a Principal.'
            );
        }

        return $assignment;
    }
}

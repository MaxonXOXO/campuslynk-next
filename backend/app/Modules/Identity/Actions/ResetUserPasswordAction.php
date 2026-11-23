<?php

declare(strict_types=1);

namespace App\Modules\Identity\Actions;

use App\Core\Tenancy\TenantContext;
use App\Modules\Identity\Contracts\IssuesTemporaryPasswordContract;
use App\Modules\Identity\Exceptions\UnauthorizedDelegationException;
use App\Modules\Identity\Models\User;
use App\Modules\Identity\Models\UserIdentifier;
use App\Modules\Identity\Services\LoginRateLimiter;
use App\Modules\Identity\Services\RoleAuthorityRank;
use App\Modules\Identity\Services\TemporaryPasswordResult;
use App\Modules\Identity\Services\UserAuditScopeResolver;

final class ResetUserPasswordAction
{
    public function __construct(
        protected IssuesTemporaryPasswordContract $temporaryPasswordIssuer,
        protected RoleAuthorityRank $authorityRank,
        protected LoginRateLimiter $rateLimiter,
        protected TenantContext $tenantContext,
        private readonly UserAuditScopeResolver $scopeResolver,
    ) {}

    public function execute(User $actor, User $targetUser, ?string $ip = null): TemporaryPasswordResult
    {
        if ($actor->id === $targetUser->id) {
            throw new UnauthorizedDelegationException(
                'You cannot reset your own password via administrative reset.'
            );
        }

        $actorRank = $this->authorityRank->highestActiveRank($actor);
        $targetRank = $this->authorityRank->highestActiveRank($targetUser);

        if ($actorRank <= $targetRank) {
            throw new UnauthorizedDelegationException(
                'You cannot reset the password of a user with an equal or higher authority role.'
            );
        }

        $result = $this->temporaryPasswordIssuer->issue($targetUser);

        // Clear timed lockout state and rate limiter counters so the user can sign in immediately
        $tenant = $this->tenantContext->tenant();
        $identifiers = array_filter([$targetUser->email, $targetUser->mobile, $targetUser->registration_number]);
        foreach ($identifiers as $val) {
            $normalised = UserIdentifier::normalise((string) $val);
            $this->rateLimiter->unlock($tenant->id, $normalised, $ip);
        }

        $targetUser->forceFill(['locked_until' => null])->save();

        // Revoke all existing sessions/tokens so old sessions cannot continue
        $targetUser->tokens()->delete();

        $scope = $this->scopeResolver->resolveForUser($targetUser);

        activity('security')
            ->event('temp_password.reset')
            ->performedOn($targetUser)
            ->causedBy($actor)
            ->withProperties([
                'target_user_id' => $targetUser->id,
                'expires_at' => $result->expiresAt->toIso8601String(),
                'scope_path' => $scope['scope_path'],
                'department_id' => $scope['department_id'],
            ])
            ->log("Reset temporary password for user [{$targetUser->name}].");

        return $result;
    }
}

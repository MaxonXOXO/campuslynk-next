<?php

declare(strict_types=1);

namespace App\Modules\Identity\Actions;

use App\Core\Tenancy\TenantContext;
use App\Modules\Identity\Models\User;
use App\Modules\Identity\Models\UserIdentifier;
use App\Modules\Identity\Services\LoginRateLimiter;
use App\Modules\Identity\Services\UserAuditScopeResolver;

final class UnlockUserAction
{
    public function __construct(
        protected LoginRateLimiter $rateLimiter,
        protected TenantContext $tenantContext,
        private readonly UserAuditScopeResolver $scopeResolver,
    ) {}

    public function execute(User $caller, User $targetUser, ?string $ip = null): void
    {
        $tenant = $this->tenantContext->tenant();
        $identifiers = array_filter([$targetUser->email, $targetUser->mobile, $targetUser->registration_number]);

        foreach ($identifiers as $val) {
            $normalised = UserIdentifier::normalise((string) $val);
            $this->rateLimiter->unlock($tenant->id, $normalised, $ip);
        }

        $targetUser->forceFill(['locked_until' => null])->save();

        $scope = $this->scopeResolver->resolveForUser($targetUser);

        activity('security')
            ->event('user.unlocked')
            ->performedOn($targetUser)
            ->causedBy($caller)
            ->withProperties([
                'target_user_id' => $targetUser->id,
                'scope_path' => $scope['scope_path'],
                'department_id' => $scope['department_id'],
            ])
            ->log("Administratively unlocked user account [{$targetUser->name}].");
    }
}

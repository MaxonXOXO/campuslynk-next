<?php

declare(strict_types=1);

namespace App\Modules\Identity\Actions;

use App\Core\Tenancy\TenantContext;
use App\Modules\Identity\Models\User;
use App\Modules\Identity\Models\UserIdentifier;
use App\Modules\Identity\Services\LoginRateLimiter;

final class UnlockUserAction
{
    public function __construct(
        protected LoginRateLimiter $rateLimiter,
        protected TenantContext $tenantContext
    ) {}

    public function execute(User $caller, User $targetUser, ?string $ip = null): void
    {
        $tenant = $this->tenantContext->tenant();
        $identifiers = array_filter([$targetUser->email, $targetUser->mobile, $targetUser->registration_number]);

        foreach ($identifiers as $val) {
            $normalised = UserIdentifier::normalise((string) $val);
            $this->rateLimiter->unlock($tenant->id, $normalised, $ip);
        }

        activity('security')
            ->performedOn($targetUser)
            ->causedBy($caller)
            ->log("Administratively unlocked user account [{$targetUser->name}].");
    }
}

<?php

declare(strict_types=1);

namespace App\Core\Auth\Actions;

use App\Core\Auth\Events\TokenRevoked;
use App\Core\Auth\Models\User;
use App\Core\Tenancy\TenantContext;
use Laravel\Sanctum\PersonalAccessToken;

class LogoutAction
{
    public function __construct(
        protected TenantContext $tenantContext
    ) {}

    public function execute(User $user, ?PersonalAccessToken $token): void
    {
        if ($token !== null) {
            $tokenId = (string) $token->id;
            $token->delete();

            TokenRevoked::dispatch($user, $tokenId, $this->tenantContext->tenant()->slug);
        }
    }
}

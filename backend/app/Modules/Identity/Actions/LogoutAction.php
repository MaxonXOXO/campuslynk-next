<?php

declare(strict_types=1);

namespace App\Modules\Identity\Actions;

use App\Core\Tenancy\TenantContext;
use App\Modules\Identity\Events\TokenRevoked;
use App\Modules\Identity\Models\User;
use Laravel\Sanctum\PersonalAccessToken;

final class LogoutAction
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

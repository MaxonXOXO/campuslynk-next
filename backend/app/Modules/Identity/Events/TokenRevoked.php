<?php

declare(strict_types=1);

namespace App\Modules\Identity\Events;

use App\Modules\Identity\Models\User;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;

class TokenRevoked
{
    use Dispatchable;
    use SerializesModels;

    public function __construct(
        public User $user,
        public string $tokenId,
        public ?string $tenantSlug = null
    ) {
        Log::info('auth.token_revoked', [
            'user_id' => $this->user->id,
            'token_id' => $this->tokenId,
            'tenant' => $this->tenantSlug,
        ]);
    }
}

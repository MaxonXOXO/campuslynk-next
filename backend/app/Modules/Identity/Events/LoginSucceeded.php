<?php

declare(strict_types=1);

namespace App\Modules\Identity\Events;

use App\Modules\Identity\Models\User;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;

class LoginSucceeded
{
    use Dispatchable;
    use SerializesModels;

    public function __construct(
        public User $user,
        public string $client,
        public string $ip,
        public ?string $tenantSlug = null
    ) {
        Log::info('auth.login_succeeded', [
            'user_id' => $this->user->id,
            'client' => $this->client,
            'ip' => $this->ip,
            'tenant' => $this->tenantSlug,
        ]);
    }
}

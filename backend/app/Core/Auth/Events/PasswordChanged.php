<?php

declare(strict_types=1);

namespace App\Core\Auth\Events;

use App\Core\Auth\Models\User;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;

class PasswordChanged
{
    use Dispatchable;
    use SerializesModels;

    public function __construct(
        public User $user,
        public string $ip,
        public ?string $tenantSlug = null
    ) {
        Log::info('auth.password_changed', [
            'user_id' => $this->user->id,
            'ip' => $this->ip,
            'tenant' => $this->tenantSlug,
        ]);
    }
}

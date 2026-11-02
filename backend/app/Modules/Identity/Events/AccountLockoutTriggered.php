<?php

declare(strict_types=1);

namespace App\Modules\Identity\Events;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class AccountLockoutTriggered
{
    use Dispatchable;
    use InteractsWithSockets;
    use SerializesModels;

    public function __construct(
        public readonly string $tenantId,
        public readonly string $identifier,
        public readonly string $ip,
        public readonly int $tier
    ) {}
}

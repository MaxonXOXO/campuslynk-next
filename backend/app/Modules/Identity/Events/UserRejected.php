<?php

declare(strict_types=1);

namespace App\Modules\Identity\Events;

use App\Modules\Identity\Models\User;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class UserRejected
{
    use Dispatchable;
    use SerializesModels;

    public function __construct(
        public readonly User $user,
        public readonly User $actor,
        public readonly string $reason,
    ) {}
}

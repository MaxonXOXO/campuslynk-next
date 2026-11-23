<?php

declare(strict_types=1);

namespace App\Modules\Identity\Listeners;

use App\Modules\Identity\Events\UserApproved;
use App\Modules\Identity\Events\UserRejected;

/**
 * Stub listener for deferred email/SMS onboarding notifications (SMTP not yet wired).
 */
final class LogUserApprovalNotificationListener
{
    public function handle(UserApproved|UserRejected $event): void
    {
        // Intentionally a no-op stub until SMTP/notification channel is configured.
    }
}

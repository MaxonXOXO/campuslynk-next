<?php

declare(strict_types=1);

namespace App\Modules\Identity\Events;

use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;

class LoginFailed
{
    use Dispatchable;
    use SerializesModels;

    public function __construct(
        public string $identifierMasked,
        public string $ip,
        public string $reason,
        public ?string $tenantSlug = null
    ) {
        Log::warning('auth.login_failed', [
            'identifier' => $this->identifierMasked,
            'ip' => $this->ip,
            'reason' => $this->reason,
            'tenant' => $this->tenantSlug,
        ]);
    }

    /**
     * Helper to safely mask a login identifier (email, phone, or registration number).
     */
    public static function maskIdentifier(string $identifier): string
    {
        $identifier = trim($identifier);

        // 1. Email masking: jo***@example.com
        if (str_contains($identifier, '@')) {
            $parts = explode('@', $identifier, 2);
            $local = $parts[0];
            $domain = $parts[1] ?? '';
            $localMasked = strlen($local) <= 2
                ? substr($local, 0, 1).'***'
                : substr($local, 0, 2).'***'.substr($local, -1);

            return $localMasked.'@'.$domain;
        }

        // 2. Phone / Mobile E.164 masking: +9198****3210
        if (preg_match('/^\+?[0-9]{8,15}$/', $identifier)) {
            $length = strlen($identifier);
            if ($length <= 5) {
                return substr($identifier, 0, 1).'***';
            }

            return substr($identifier, 0, 4).'****'.substr($identifier, -3);
        }

        // 3. Registration number or other identifier: 2101****15
        $length = strlen($identifier);
        if ($length <= 4) {
            return substr($identifier, 0, 1).'***';
        }

        return substr($identifier, 0, 3).'****'.substr($identifier, -2);
    }
}

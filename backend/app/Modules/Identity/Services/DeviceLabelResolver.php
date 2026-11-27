<?php

declare(strict_types=1);

namespace App\Modules\Identity\Services;

use App\Modules\Identity\Models\PersonalAccessToken;

final class DeviceLabelResolver
{
    public static function isSupportSession(PersonalAccessToken $token): bool
    {
        $abilities = $token->abilities ?? [];

        return in_array('impersonation:read_only', $abilities, true)
            || str_starts_with($token->name, 'impersonation:');
    }

    public static function resolve(PersonalAccessToken $token): string
    {
        if (self::isSupportSession($token)) {
            return 'Support session';
        }

        $ua = $token->user_agent;
        if ($ua === null || trim($ua) === '') {
            return 'Unknown device';
        }

        $browser = self::detectBrowser($ua);
        $os = self::detectOs($ua);

        if ($browser !== null && $os !== null) {
            return "{$browser} on {$os}";
        }

        if ($browser !== null) {
            return $browser;
        }

        if ($os !== null) {
            return $os;
        }

        return 'Unknown device';
    }

    private static function detectBrowser(string $ua): ?string
    {
        return match (true) {
            str_contains($ua, 'Edg/') => 'Edge',
            str_contains($ua, 'OPR/') || str_contains($ua, 'Opera') => 'Opera',
            str_contains($ua, 'Chrome/') && ! str_contains($ua, 'Chromium/') => 'Chrome',
            str_contains($ua, 'Firefox/') => 'Firefox',
            str_contains($ua, 'Safari/') && ! str_contains($ua, 'Chrome/') => 'Safari',
            str_contains($ua, 'curl/') => 'curl',
            default => null,
        };
    }

    private static function detectOs(string $ua): ?string
    {
        return match (true) {
            str_contains($ua, 'Windows') => 'Windows',
            str_contains($ua, 'iPhone') || str_contains($ua, 'iPad') => 'iOS',
            str_contains($ua, 'Android') => 'Android',
            str_contains($ua, 'Macintosh') || str_contains($ua, 'Mac OS X') => 'macOS',
            str_contains($ua, 'Linux') => 'Linux',
            default => null,
        };
    }
}

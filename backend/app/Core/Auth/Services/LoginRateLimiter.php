<?php

declare(strict_types=1);

namespace App\Core\Auth\Services;

use Illuminate\Support\Facades\RateLimiter;

class LoginRateLimiter
{
    /**
     * Tier 1: Per tenant + identifier + IP (individual client targeting single account)
     */
    public const MAX_ATTEMPTS = 5;

    public const DECAY_SECONDS = 300; // 5 minute window

    /**
     * Tier 2: Per tenant + identifier across all IPs (anti-distributed brute force)
     */
    public const MAX_IDENTIFIER_ATTEMPTS = 15;

    public const DECAY_IDENTIFIER_SECONDS = 900; // 15 minute window

    /**
     * Tier 3: Per tenant + IP across all identifiers (anti-credential stuffing)
     */
    public const MAX_IP_ATTEMPTS = 30;

    public const DECAY_IP_SECONDS = 900; // 15 minute window

    /**
     * Key for Tier 1: tenant + identifier + IP
     */
    public function throttleKey(string $tenantId, string $identifier, string $ip): string
    {
        $hash = hash('sha256', strtolower(trim($identifier)));

        return "auth:throttle:account_ip:{$tenantId}:{$hash}:{$ip}";
    }

    /**
     * Key for Tier 2: tenant + identifier across all IPs
     */
    public function identifierThrottleKey(string $tenantId, string $identifier): string
    {
        $hash = hash('sha256', strtolower(trim($identifier)));

        return "auth:throttle:account:{$tenantId}:{$hash}";
    }

    /**
     * Key for Tier 3: tenant + IP across all identifiers
     */
    public function ipThrottleKey(string $tenantId, string $ip): string
    {
        return "auth:throttle:ip:{$tenantId}:{$ip}";
    }

    /**
     * Check if too many login attempts have been made on any tier.
     */
    public function tooManyAttempts(string $tenantId, string $identifier, string $ip): bool
    {
        return RateLimiter::tooManyAttempts($this->throttleKey($tenantId, $identifier, $ip), self::MAX_ATTEMPTS)
            || RateLimiter::tooManyAttempts($this->identifierThrottleKey($tenantId, $identifier), self::MAX_IDENTIFIER_ATTEMPTS)
            || RateLimiter::tooManyAttempts($this->ipThrottleKey($tenantId, $ip), self::MAX_IP_ATTEMPTS);
    }

    /**
     * Record a failed login attempt across all tiers.
     */
    public function hit(string $tenantId, string $identifier, string $ip): void
    {
        RateLimiter::hit($this->throttleKey($tenantId, $identifier, $ip), self::DECAY_SECONDS);
        RateLimiter::hit($this->identifierThrottleKey($tenantId, $identifier), self::DECAY_IDENTIFIER_SECONDS);
        RateLimiter::hit($this->ipThrottleKey($tenantId, $ip), self::DECAY_IP_SECONDS);
    }

    /**
     * Get remaining seconds until lockout expires (maximum remaining across locked tiers).
     */
    public function availableIn(string $tenantId, string $identifier, string $ip): int
    {
        return max(
            RateLimiter::availableIn($this->throttleKey($tenantId, $identifier, $ip)),
            RateLimiter::availableIn($this->identifierThrottleKey($tenantId, $identifier)),
            RateLimiter::availableIn($this->ipThrottleKey($tenantId, $ip))
        );
    }

    /**
     * Clear throttle attempts on successful login.
     */
    public function clear(string $tenantId, string $identifier, string $ip): void
    {
        RateLimiter::clear($this->throttleKey($tenantId, $identifier, $ip));
    }
}

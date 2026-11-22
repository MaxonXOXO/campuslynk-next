<?php

declare(strict_types=1);

namespace App\Modules\Identity\Services;

use App\Core\Tenancy\Models\TenantSetting;
use App\Modules\Identity\Contracts\IssuesTemporaryPasswordContract;
use App\Modules\Identity\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Hash;

final class TemporaryPasswordIssuer implements IssuesTemporaryPasswordContract
{
    private const DEFAULT_TTL_HOURS = 48;

    private const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

    private const LOWER = 'abcdefghijkmnopqrstuvwxyz';

    private const DIGITS = '23456789';

    private const SYMBOLS = '!@#$%&*?';

    public function generatePassword(): string
    {
        $chars = [];

        for ($i = 0; $i < 3; $i++) {
            $chars[] = self::UPPER[random_int(0, strlen(self::UPPER) - 1)];
            $chars[] = self::LOWER[random_int(0, strlen(self::LOWER) - 1)];
            $chars[] = self::DIGITS[random_int(0, strlen(self::DIGITS) - 1)];
            $chars[] = self::SYMBOLS[random_int(0, strlen(self::SYMBOLS) - 1)];
        }

        $pool = self::UPPER.self::LOWER.self::DIGITS.self::SYMBOLS;
        $poolMax = strlen($pool) - 1;
        for ($i = 0; $i < 4; $i++) {
            $chars[] = $pool[random_int(0, $poolMax)];
        }

        // Fisher-Yates shuffle using CSPRNG
        for ($i = count($chars) - 1; $i > 0; $i--) {
            $j = random_int(0, $i);
            [$chars[$i], $chars[$j]] = [$chars[$j], $chars[$i]];
        }

        return implode('', $chars);
    }

    public function resolveExpiresAt(): Carbon
    {
        $ttlHours = self::DEFAULT_TTL_HOURS;

        try {
            /** @var TenantSetting|null $setting */
            $setting = TenantSetting::where('key', 'auth.temp_password_ttl_hours')->first();
            if ($setting !== null) {
                $raw = is_array($setting->value)
                    ? ($setting->value['hours'] ?? $setting->value['value'] ?? null)
                    : $setting->value;

                if (is_numeric($raw)) {
                    $parsed = (int) $raw;
                    if ($parsed >= 1 && $parsed <= 720) {
                        $ttlHours = $parsed;
                    }
                }
            }
        } catch (\Throwable) {
            $ttlHours = self::DEFAULT_TTL_HOURS;
        }

        return Carbon::now()->addHours($ttlHours);
    }

    public function issue(User $user, ?string $explicitPassword = null): TemporaryPasswordResult
    {
        $wasGenerated = $explicitPassword === null || $explicitPassword === '';
        $plain = $wasGenerated ? $this->generatePassword() : $explicitPassword;
        $expiresAt = $this->resolveExpiresAt();

        $user->forceFill([
            'password' => Hash::make($plain),
            'must_change_password' => true,
            'temporary_password_expires_at' => $expiresAt,
        ])->save();

        return new TemporaryPasswordResult(
            user: $user,
            temporaryPassword: $plain,
            expiresAt: $expiresAt,
            wasGenerated: $wasGenerated,
        );
    }
}

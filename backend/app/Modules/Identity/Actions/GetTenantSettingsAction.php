<?php

declare(strict_types=1);

namespace App\Modules\Identity\Actions;

use App\Core\Tenancy\Models\TenantSetting;
use Illuminate\Support\Facades\DB;

final class GetTenantSettingsAction
{
    /**
     * Whitelisted auth.* settings editable via /api/v1/settings.
     * Note: signup_policy is intentionally excluded per ADR-0016 amendment.
     *
     * @var array<string, array<string, mixed>>
     */
    public const WHITELISTED_DEFAULTS = [
        'auth.staff_self_registration_enabled' => ['enabled' => false],
        'auth.staff_self_registration_daily_cap' => ['cap' => 100],
        'auth.rejected_resubmit_cooldown_days' => ['days' => 7],
        'auth.token_lifetime_web_hours' => ['hours' => 12],
        'auth.token_lifetime_mobile_days' => ['days' => 30],
    ];

    /**
     * @return array{
     *     settings: array<string, array{value: array<string, mixed>, is_default: bool, updated_at: string|null}>,
     *     token_summary: array{active_tokens_count: int, active_users_with_tokens_count: int}
     * }
     */
    public function execute(): array
    {
        $keys = array_keys(self::WHITELISTED_DEFAULTS);
        $stored = TenantSetting::query()
            ->whereIn('key', $keys)
            ->get()
            ->keyBy('key');

        $settings = [];
        foreach (self::WHITELISTED_DEFAULTS as $key => $defaultValue) {
            /** @var TenantSetting|null $row */
            $row = $stored->get($key);
            /** @var array<string, mixed> $value */
            $value = ($row !== null && is_array($row->value)) ? $row->value : $defaultValue;

            $settings[$key] = [
                'value' => $value,
                'is_default' => $row === null,
                'updated_at' => $row?->updated_at?->toIso8601String(),
            ];
        }

        $now = now();
        $activeTokensQuery = DB::connection('tenant')
            ->table('personal_access_tokens')
            ->where(function ($q) use ($now): void {
                $q->whereNull('expires_at')->orWhere('expires_at', '>', $now);
            });

        $activeTokensCount = (int) (clone $activeTokensQuery)->count();
        $activeUsersCount = (int) (clone $activeTokensQuery)->distinct('tokenable_id')->count('tokenable_id');

        return [
            'settings' => $settings,
            'token_summary' => [
                'active_tokens_count' => $activeTokensCount,
                'active_users_with_tokens_count' => $activeUsersCount,
            ],
        ];
    }
}

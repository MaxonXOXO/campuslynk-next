<?php

declare(strict_types=1);

namespace App\Modules\Identity\Actions;

use App\Core\Tenancy\Models\TenantSetting;
use App\Modules\Identity\Models\User;
use App\Modules\Identity\Services\AuditPropertyRedactor;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use InvalidArgumentException;

final class UpdateTenantSettingAction
{
    /**
     * @param  array<string, mixed>  $value
     * @return array{key: string, value: array<string, mixed>, is_default: bool, updated_at: string|null}
     */
    public function execute(User $actor, string $key, array $value, ?string $reason, string $ip): array
    {
        if (! array_key_exists($key, GetTenantSettingsAction::WHITELISTED_DEFAULTS)) {
            throw ValidationException::withMessages([
                'key' => ["Setting [{$key}] is not editable via the settings API."],
            ]);
        }

        $trimmedReason = is_string($reason) ? trim($reason) : null;
        if ($trimmedReason === '') {
            $trimmedReason = null;
        }

        if ($key === 'auth.staff_self_registration_enabled') {
            $enabling = (bool) ($value['enabled'] ?? $value['value'] ?? false);
            if ($enabling) {
                if ($trimmedReason === null || mb_strlen($trimmedReason) < 5 || mb_strlen($trimmedReason) > 500) {
                    throw ValidationException::withMessages([
                        'reason' => ['A reason between 5 and 500 characters is required when enabling staff self-registration.'],
                    ]);
                }
            }
        } elseif ($trimmedReason !== null && mb_strlen($trimmedReason) > 500) {
            throw ValidationException::withMessages([
                'reason' => ['The reason may not be greater than 500 characters.'],
            ]);
        }

        $defaultValue = GetTenantSettingsAction::WHITELISTED_DEFAULTS[$key];

        /** @var TenantSetting $setting */
        $setting = DB::connection('tenant')->transaction(function () use ($actor, $key, $value, $defaultValue, $trimmedReason, $ip): TenantSetting {
            /** @var TenantSetting|null $existing */
            $existing = TenantSetting::query()->where('key', $key)->lockForUpdate()->first();
            $oldValue = ($existing !== null && is_array($existing->value)) ? $existing->value : $defaultValue;

            $target = $existing ?? new TenantSetting(['key' => $key]);
            $target->value = $value;

            try {
                $target->save();
            } catch (InvalidArgumentException $e) {
                throw ValidationException::withMessages([
                    'value' => [$e->getMessage()],
                ]);
            }

            activity('identity')
                ->causedBy($actor)
                ->event('setting.updated')
                ->withProperties(AuditPropertyRedactor::redact([
                    'key' => $key,
                    'old_value' => $oldValue,
                    'new_value' => $target->value,
                    'reason' => $trimmedReason,
                    'ip' => $ip,
                ]))
                ->log("Updated tenant setting [{$key}].");

            return $target;
        });

        /** @var array<string, mixed> $savedValue */
        $savedValue = is_array($setting->value) ? $setting->value : $value;

        return [
            'key' => $setting->key,
            'value' => $savedValue,
            'is_default' => false,
            'updated_at' => $setting->updated_at?->toIso8601String(),
        ];
    }
}

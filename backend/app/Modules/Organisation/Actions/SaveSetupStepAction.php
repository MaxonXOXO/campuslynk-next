<?php

declare(strict_types=1);

namespace App\Modules\Organisation\Actions;

use App\Core\Tenancy\Models\TenantSetting;
use App\Modules\Organisation\Exceptions\SetupLockedException;
use App\Modules\Organisation\Services\SetupAuditRedactor;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

final class SaveSetupStepAction
{
    public function __construct(
        protected GetSetupStatusAction $statusAction,
        protected LockSetupStateAction $lockSetupStateAction
    ) {}

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    public function execute(string $step, array $payload): array
    {
        if (! in_array($step, ['institution_profile', 'calendar_basics', 'signup_policy'], true)) {
            throw new InvalidArgumentException("Unknown setup step [{$step}].");
        }

        $lockedStep = false;

        DB::connection('tenant')->transaction(function () use ($step, $payload, &$lockedStep): void {
            // All setup writers acquire the shared mutex before a step row.
            $setupSetting = $this->lockSetupStateAction->execute();

            /** @var array<string, mixed> $setupData */
            $setupData = is_array($setupSetting->value)
                ? $setupSetting->value
                : [
                    'completed_at' => null,
                    'steps' => [],
                ];

            $isCompleted = ! empty($setupData['completed_at']);
            $unlockReason = null;

            if ($isCompleted) {
                $now = Carbon::now();
                /** @var array<string, array<string, mixed>> $unlocks */
                $unlocks = isset($setupData['unlocks']) && is_array($setupData['unlocks'])
                    ? $setupData['unlocks']
                    : [];

                $expiredSections = [];
                $latestExpiredAt = null;
                foreach ($unlocks as $secKey => $entry) {
                    $exp = isset($entry['expires_at']) && is_string($entry['expires_at'])
                        ? Carbon::parse($entry['expires_at'])
                        : null;
                    if ($exp !== null && $exp->lte($now)) {
                        $expiredSections[] = (string) $secKey;
                        $latestExpiredAt = $exp->toIso8601String();
                        unset($unlocks[$secKey]);
                    }
                }

                if ($expiredSections !== []) {
                    if ($unlocks === []) {
                        unset($setupData['unlocks']);
                    } else {
                        $setupData['unlocks'] = $unlocks;
                    }
                    $setupSetting->value = $setupData;
                    $setupSetting->save();

                    activity('organisation')
                        ->event('setup.locked')
                        ->withProperties([
                            'sections' => $expiredSections,
                            'trigger' => 'expired',
                            'expired_at' => $latestExpiredAt,
                        ])
                        ->log('Setup unlock expired automatically.');
                }

                if (! array_key_exists($step, $unlocks)) {
                    $lockedStep = true;

                    return;
                }

                $unlockEntry = $unlocks[$step];
                $unlockReason = isset($unlockEntry['reason']) && is_string($unlockEntry['reason'])
                    ? $unlockEntry['reason']
                    : null;

                // Auto-relock this section on successful save inside the same transaction
                unset($unlocks[$step]);
                if ($unlocks === []) {
                    unset($setupData['unlocks']);
                } else {
                    $setupData['unlocks'] = $unlocks;
                }
            }

            // Read the step using a fresh statement after acquiring setup.
            $setting = TenantSetting::query()->lockForUpdate()->firstOrNew(['key' => $step]);
            /** @var array<string, mixed>|null $oldValues */
            $oldValues = ($setting->exists && is_array($setting->value)) ? $setting->value : null;

            $setting->value = $payload;
            $setting->save();

            /** @var array<string, mixed> $steps */
            $steps = isset($setupData['steps']) && is_array($setupData['steps']) ? $setupData['steps'] : [];

            /** @var array<string, mixed> $stepData */
            $stepData = isset($steps[$step]) && is_array($steps[$step]) ? $steps[$step] : [];

            $stepCompletedAt = isset($stepData['completed_at']) && is_string($stepData['completed_at'])
                ? $stepData['completed_at']
                : now()->toIso8601String();

            $steps[$step] = [
                'completed_at' => $stepCompletedAt,
            ];

            $setupData['steps'] = $steps;

            // Preserve top-level completed_at if setup was already completed
            if (! array_key_exists('completed_at', $setupData)) {
                $setupData['completed_at'] = null;
            }

            $setupSetting->value = $setupData;
            $setupSetting->save();

            if ($isCompleted) {
                activity('organisation')
                    ->event('setup.step_updated')
                    ->withProperties(SetupAuditRedactor::redact([
                        'step' => $step,
                        'old_values' => $oldValues,
                        'new_values' => $payload,
                        'reason' => $unlockReason,
                    ]))
                    ->log("Updated locked setup step [{$step}].");

                activity('organisation')
                    ->event('setup.locked')
                    ->withProperties([
                        'sections' => [$step],
                        'trigger' => 'auto_save',
                    ])
                    ->log("Auto-relocked setup section [{$step}] after save.");
            }
        });

        if ($lockedStep) {
            throw new SetupLockedException("Setup section [{$step}] is locked. Unlock it with an audited reason before saving changes.");
        }

        return $this->statusAction->execute();
    }
}

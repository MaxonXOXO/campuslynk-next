<?php

declare(strict_types=1);

namespace App\Modules\Organisation\Actions;

use App\Core\Tenancy\Models\TenantSetting;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

final class SaveSetupStepAction
{
    public function __construct(
        protected GetSetupStatusAction $statusAction
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

        DB::connection('tenant')->transaction(function () use ($step, $payload): void {
            // 1. Write tenant setting for the given step
            $setting = TenantSetting::firstOrNew(['key' => $step]);
            $setting->value = $payload;
            $setting->save();

            // 2. Load or initialize setup state setting
            $setupSetting = TenantSetting::firstOrNew(['key' => 'setup']);
            /** @var array<string, mixed> $setupData */
            $setupData = ($setupSetting->exists && is_array($setupSetting->value))
                ? $setupSetting->value
                : [
                    'completed_at' => null,
                    'steps' => [],
                ];

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
        });

        return $this->statusAction->execute();
    }
}

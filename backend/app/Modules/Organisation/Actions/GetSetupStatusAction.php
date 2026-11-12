<?php

declare(strict_types=1);

namespace App\Modules\Organisation\Actions;

use App\Core\Tenancy\Models\TenantSetting;
use App\Modules\Organisation\Models\AcademicYear;
use App\Modules\Organisation\Models\Department;
use App\Modules\Organisation\Models\Stream;
use Illuminate\Database\Eloquent\Collection;

final class GetSetupStatusAction
{
    /**
     * @return array<string, mixed>
     */
    public function execute(): array
    {
        $setupSetting = TenantSetting::where('key', 'setup')->first();
        /** @var array<string, mixed> $setupData */
        $setupData = ($setupSetting !== null && is_array($setupSetting->value))
            ? $setupSetting->value
            : ['completed_at' => null, 'steps' => []];

        /** @var array<string, mixed> $stepsMap */
        $stepsMap = isset($setupData['steps']) && is_array($setupData['steps'])
            ? $setupData['steps']
            : [];

        /** @var Collection<string, TenantSetting> $settings */
        $settings = TenantSetting::whereIn('key', [
            'institution_profile',
            'calendar_basics',
            'signup_policy',
        ])->get()->keyBy('key');

        $steps = [];
        foreach (['institution_profile', 'calendar_basics', 'signup_policy'] as $stepKey) {
            /** @var array<string, mixed> $stepInfo */
            $stepInfo = isset($stepsMap[$stepKey]) && is_array($stepsMap[$stepKey]) ? $stepsMap[$stepKey] : [];
            $completedAt = isset($stepInfo['completed_at']) && is_string($stepInfo['completed_at'])
                ? $stepInfo['completed_at']
                : null;

            /** @var TenantSetting|null $setting */
            $setting = $settings->get($stepKey);
            $values = ($setting !== null && is_array($setting->value)) ? $setting->value : null;

            $steps[$stepKey] = [
                'completed_at' => $completedAt,
                'is_completed' => $completedAt !== null && $completedAt !== '' && $setting !== null,
                'settings_exist' => $setting !== null,
                'values' => $values,
            ];
        }

        $completedAtOverall = isset($setupData['completed_at']) && is_string($setupData['completed_at'])
            ? $setupData['completed_at']
            : null;

        return [
            'completed_at' => $completedAtOverall,
            'is_completed' => $completedAtOverall !== null,
            'steps' => $steps,
            'prerequisites' => [
                'streams_count' => Stream::count(),
                'departments_count' => Department::count(),
                'academic_years_count' => AcademicYear::count(),
            ],
        ];
    }
}

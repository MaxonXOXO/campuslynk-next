<?php

declare(strict_types=1);

namespace App\Modules\Organisation\Actions;

use App\Core\Tenancy\Models\TenantSetting;
use App\Modules\Organisation\Exceptions\SetupAlreadyCompletedException;
use App\Modules\Organisation\Exceptions\SetupPrerequisitesMissingException;
use App\Modules\Organisation\Models\AcademicYear;
use App\Modules\Organisation\Models\Department;
use App\Modules\Organisation\Models\Stream;
use Illuminate\Support\Facades\DB;

final class CompleteSetupAction
{
    public function __construct(
        protected GetSetupStatusAction $statusAction
    ) {}

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

        // 1. A second call returns 409
        if (! empty($setupData['completed_at'])) {
            throw new SetupAlreadyCompletedException('First-run setup has already been completed.');
        }

        // 2. Check steps completion
        $missing = [];
        $requiredSteps = ['institution_profile', 'calendar_basics', 'signup_policy'];

        /** @var list<string> $existingSettingKeys */
        $existingSettingKeys = TenantSetting::whereIn('key', $requiredSteps)->pluck('key')->all();

        /** @var array<string, mixed> $steps */
        $steps = isset($setupData['steps']) && is_array($setupData['steps']) ? $setupData['steps'] : [];

        foreach ($requiredSteps as $stepKey) {
            $isSettingPresent = in_array($stepKey, $existingSettingKeys, true);
            /** @var array<string, mixed> $stepInfo */
            $stepInfo = isset($steps[$stepKey]) && is_array($steps[$stepKey]) ? $steps[$stepKey] : [];
            $isMarkedComplete = ! empty($stepInfo['completed_at']);

            if (! $isSettingPresent || ! $isMarkedComplete) {
                $missing[] = "Setup step [{$stepKey}] is not completed.";
            }
        }

        // 3. Check prerequisite record counts
        if (Stream::count() < 1) {
            $missing[] = 'At least one stream must exist.';
        }

        if (Department::count() < 1) {
            $missing[] = 'At least one department must exist.';
        }

        if (AcademicYear::count() < 1) {
            $missing[] = 'At least one academic year must exist.';
        }

        if (! empty($missing)) {
            throw new SetupPrerequisitesMissingException($missing);
        }

        // 4. Mark setup complete in transaction
        DB::connection('tenant')->transaction(function () use ($setupSetting, $setupData): void {
            if ($setupSetting === null) {
                $setupSetting = new TenantSetting(['key' => 'setup']);
            }

            $setupData['completed_at'] = now()->toIso8601String();
            $setupSetting->value = $setupData;
            $setupSetting->save();
        });

        return $this->statusAction->execute();
    }
}

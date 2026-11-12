<?php

declare(strict_types=1);

namespace App\Modules\Organisation\Actions;

use App\Core\Tenancy\Models\TenantSetting;
use App\Modules\Organisation\Exceptions\SetupAlreadyCompletedException;
use App\Modules\Organisation\Exceptions\SetupPrerequisitesMissingException;
use App\Modules\Organisation\Models\AcademicYear;
use App\Modules\Organisation\Models\Department;
use App\Modules\Organisation\Models\Stream;
use Illuminate\Database\Eloquent\Collection;
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
        return DB::connection('tenant')->transaction(function (): array {
            // Successful completion requires recorded steps in an existing setup row.
            // Lock it with the configuration rows so an absent policy is protected too.
            /** @var Collection<string, TenantSetting> $settings */
            $settings = TenantSetting::whereIn('key', [
                'setup', 'institution_profile', 'calendar_basics', 'signup_policy',
            ])->orderBy('key')->lockForUpdate()->get()->keyBy('key');

            $setupSetting = $settings->get('setup');
            /** @var array<string, mixed> $setupData */
            $setupData = ($setupSetting !== null && is_array($setupSetting->value))
                ? $setupSetting->value
                : ['completed_at' => null, 'steps' => []];

            // Recheck after acquiring the locks so a concurrent loser returns 409.
            if (! empty($setupData['completed_at'])) {
                throw new SetupAlreadyCompletedException('First-run setup has already been completed.');
            }

            $missing = [];
            /** @var array<string, mixed> $steps */
            $steps = isset($setupData['steps']) && is_array($setupData['steps']) ? $setupData['steps'] : [];

            foreach (['institution_profile', 'calendar_basics'] as $stepKey) {
                /** @var array<string, mixed> $stepInfo */
                $stepInfo = isset($steps[$stepKey]) && is_array($steps[$stepKey]) ? $steps[$stepKey] : [];
                $isMarkedComplete = ! empty($stepInfo['completed_at']) && is_string($stepInfo['completed_at']);

                if (! $settings->has($stepKey) || ! $isMarkedComplete) {
                    $missing[] = "Setup step [{$stepKey}] is not completed.";
                }
            }

            // Retain one live record of each kind until the transaction commits.
            if (Stream::orderBy('id')->lockForUpdate()->first(['id']) === null) {
                $missing[] = 'At least one stream must exist.';
            }

            if (Department::orderBy('id')->lockForUpdate()->first(['id']) === null) {
                $missing[] = 'At least one department must exist.';
            }

            if (AcademicYear::orderBy('id')->lockForUpdate()->first(['id']) === null) {
                $missing[] = 'At least one academic year must exist.';
            }

            if ($missing !== []) {
                throw new SetupPrerequisitesMissingException($missing);
            }

            $signupSetting = $settings->get('signup_policy');
            $initializedDefaults = $signupSetting === null;

            if ($signupSetting === null) {
                $signupSetting = TenantSetting::create([
                    'key' => 'signup_policy',
                    'value' => [
                        'student_self_registration_enabled' => false,
                        'parent_self_registration_enabled' => false,
                        'approval_mode' => 'manual',
                    ],
                ]);
            }

            $completedAt = now()->toIso8601String();
            /** @var array<string, mixed> $signupStep */
            $signupStep = isset($steps['signup_policy']) && is_array($steps['signup_policy'])
                ? $steps['signup_policy']
                : [];

            if (empty($signupStep['completed_at'])) {
                $signupStep['completed_at'] = $completedAt;
            }

            $steps['signup_policy'] = $signupStep;
            $setupData['steps'] = $steps;
            $setupData['completed_at'] = $completedAt;

            if ($setupSetting === null) {
                $setupSetting = new TenantSetting(['key' => 'setup']);
            }

            $setupSetting->value = $setupData;
            $setupSetting->save();

            if ($initializedDefaults) {
                // The activity logger resolves the current authenticated writer.
                activity('organisation')
                    ->performedOn($signupSetting)
                    ->event('signup_policy.defaults_initialized')
                    ->withProperties(['source' => 'setup_completion'])
                    ->log('Initialized default sign-up policy during first-run setup completion.');
            }

            return $this->statusAction->execute();
        }, 3);
    }
}

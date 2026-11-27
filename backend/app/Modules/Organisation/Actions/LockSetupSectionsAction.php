<?php

declare(strict_types=1);

namespace App\Modules\Organisation\Actions;

use App\Modules\Organisation\Exceptions\SetupNotCompletedException;
use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

final class LockSetupSectionsAction
{
    public function __construct(
        protected GetSetupStatusAction $statusAction,
        protected LockSetupStateAction $lockSetupStateAction,
    ) {}

    /**
     * @param  list<string>|null  $sections
     * @return array<string, mixed>
     */
    public function execute(Authenticatable $actor, ?array $sections = null): array
    {
        $actorId = (string) $actor->getAuthIdentifier();

        DB::connection('tenant')->transaction(function () use ($actorId, $sections): void {
            $setupSetting = $this->lockSetupStateAction->execute();

            /** @var array<string, mixed> $setupData */
            $setupData = is_array($setupSetting->value)
                ? $setupSetting->value
                : ['completed_at' => null, 'steps' => []];

            if (empty($setupData['completed_at'])) {
                throw new SetupNotCompletedException('First-run setup is not yet completed.');
            }

            /** @var array<string, array<string, mixed>> $unlocks */
            $unlocks = isset($setupData['unlocks']) && is_array($setupData['unlocks'])
                ? $setupData['unlocks']
                : [];

            $now = Carbon::now();
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
                activity('organisation')
                    ->event('setup.locked')
                    ->withProperties([
                        'sections' => $expiredSections,
                        'trigger' => 'expired',
                        'expired_at' => $latestExpiredAt,
                    ])
                    ->log('Setup unlock expired automatically.');
            }

            $targets = $sections !== null ? array_values(array_unique($sections)) : array_keys($unlocks);
            $lockedNow = [];
            foreach ($targets as $target) {
                if (array_key_exists($target, $unlocks)) {
                    unset($unlocks[$target]);
                    $lockedNow[] = (string) $target;
                }
            }

            if ($unlocks === []) {
                unset($setupData['unlocks']);
            } else {
                $setupData['unlocks'] = $unlocks;
            }

            $setupSetting->value = $setupData;
            $setupSetting->save();

            if ($lockedNow !== []) {
                activity('organisation')
                    ->causedBy($actorId)
                    ->event('setup.locked')
                    ->withProperties([
                        'sections' => $lockedNow,
                        'trigger' => 'manual',
                    ])
                    ->log('Manually locked institutional setup sections.');
            }
        });

        return $this->statusAction->execute();
    }
}

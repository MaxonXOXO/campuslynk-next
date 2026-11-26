<?php

declare(strict_types=1);

namespace App\Modules\Organisation\Actions;

use App\Modules\Organisation\Exceptions\SetupNotCompletedException;
use App\Modules\Organisation\Services\SetupAuditRedactor;
use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

final class UnlockSetupSectionsAction
{
    /** @var list<string> */
    public const LOCKABLE_SECTIONS = [
        'institution_profile',
        'calendar_basics',
        'signup_policy',
    ];

    public function __construct(
        protected GetSetupStatusAction $statusAction,
        protected LockSetupStateAction $lockSetupStateAction,
    ) {}

    /**
     * @param  list<string>  $sections
     * @return array<string, mixed>
     */
    public function execute(Authenticatable $actor, array $sections, string $reason, string $ip): array
    {
        $uniqueSections = array_values(array_unique($sections));
        if ($uniqueSections === []) {
            throw new InvalidArgumentException('At least one setup section must be specified.');
        }

        foreach ($uniqueSections as $section) {
            if (! in_array($section, self::LOCKABLE_SECTIONS, true)) {
                throw new InvalidArgumentException("Section [{$section}] is not a lockable setup section.");
            }
        }

        $trimmedReason = trim($reason);
        if (mb_strlen($trimmedReason) < 5 || mb_strlen($trimmedReason) > 500) {
            throw new InvalidArgumentException('Unlock reason must be between 5 and 500 characters.');
        }

        /** @var string $actorId */
        $actorId = (string) $actor->getAuthIdentifier();

        DB::connection('tenant')->transaction(function () use ($actorId, $uniqueSections, $trimmedReason, $ip): void {
            $setupSetting = $this->lockSetupStateAction->execute();

            /** @var array<string, mixed> $setupData */
            $setupData = is_array($setupSetting->value)
                ? $setupSetting->value
                : ['completed_at' => null, 'steps' => []];

            if (empty($setupData['completed_at'])) {
                throw new SetupNotCompletedException('First-run setup is not yet completed and does not require unlocking.');
            }

            $now = Carbon::now();
            $ttlHours = max((int) config('setup.unlock_safety_ttl_hours', 24), 1);
            $expiresAt = $now->copy()->addHours($ttlHours);

            /** @var array<string, array<string, mixed>> $unlocks */
            $unlocks = isset($setupData['unlocks']) && is_array($setupData['unlocks'])
                ? $setupData['unlocks']
                : [];

            // Lazily purge any expired unlocks inside the same transaction lock
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

            foreach ($uniqueSections as $section) {
                $unlocks[$section] = [
                    'unlocked_by_user_id' => $actorId,
                    'unlocked_at' => $now->toIso8601String(),
                    'expires_at' => $expiresAt->toIso8601String(),
                    'reason' => $trimmedReason,
                ];
            }

            $setupData['unlocks'] = $unlocks;
            $setupSetting->value = $setupData;
            $setupSetting->save();

            activity('organisation')
                ->causedBy($actorId)
                ->event('setup.unlocked')
                ->withProperties(SetupAuditRedactor::redact([
                    'reason' => $trimmedReason,
                    'sections' => $uniqueSections,
                    'ip' => $ip,
                ]))
                ->log('Unlocked institutional setup sections for editing.');
        });

        return $this->statusAction->execute();
    }
}

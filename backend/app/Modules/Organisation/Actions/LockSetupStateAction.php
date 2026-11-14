<?php

declare(strict_types=1);

namespace App\Modules\Organisation\Actions;

use App\Core\Tenancy\Models\TenantSetting;

final class LockSetupStateAction
{
    /**
     * Acquire the setup mutex before any other setting reads or writes.
     * Must be called inside the caller's tenant transaction.
     */
    public function execute(): TenantSetting
    {
        $setting = TenantSetting::where('key', 'setup')->lockForUpdate()->first();
        if ($setting !== null) {
            return $setting;
        }

        // createOrFirst uses a savepoint on a unique-key conflict, keeping the
        // PostgreSQL transaction usable when another first save inserts setup.
        TenantSetting::query()->createOrFirst(['key' => 'setup'], ['value' => [
            'completed_at' => null,
            'steps' => [
                'institution_profile' => ['completed_at' => null],
                'calendar_basics' => ['completed_at' => null],
                'signup_policy' => ['completed_at' => null],
            ],
        ]]);

        // A fresh statement sees the concurrent creator's committed state.
        return TenantSetting::where('key', 'setup')->lockForUpdate()->firstOrFail();
    }
}

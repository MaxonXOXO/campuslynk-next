<?php

declare(strict_types=1);

namespace Tests\Fixtures;

use App\Core\Tenancy\Models\TenantSetting;
use Illuminate\Contracts\Queue\ShouldQueue;

class SampleQueuedListener implements ShouldQueue
{
    public function handle(SampleEvent $event): void
    {
        TenantSetting::updateOrCreate(
            ['key' => 'auth.token_lifetime_web_hours'],
            ['value' => ['hours' => 3]]
        );
    }
}

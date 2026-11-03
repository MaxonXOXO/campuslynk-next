<?php

declare(strict_types=1);

namespace Tests\Fixtures;

use App\Core\Tenancy\Models\TenantSetting;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

class SamplePlainJob implements ShouldQueue
{
    use Queueable;

    public function handle(): void
    {
        TenantSetting::updateOrCreate(
            ['key' => 'auth.token_lifetime_web_hours'],
            ['value' => ['hours' => 2]]
        );
    }
}

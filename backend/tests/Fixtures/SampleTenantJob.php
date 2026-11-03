<?php

declare(strict_types=1);

namespace Tests\Fixtures;

use App\Core\Tenancy\Concerns\TenantAwareJob;
use App\Core\Tenancy\Contracts\TenantAwareJobContract;
use App\Core\Tenancy\Models\TenantSetting;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

class SampleTenantJob implements ShouldQueue, TenantAwareJobContract
{
    use Queueable;
    use TenantAwareJob;

    public function __construct(?string $tenantId = null)
    {
        if ($tenantId !== null) {
            $this->tenantId = $tenantId;
        } else {
            $this->bindTenantContext();
        }
    }

    public function handle(): void
    {
        TenantSetting::updateOrCreate(
            ['key' => 'auth.token_lifetime_web_hours'],
            ['value' => ['hours' => 1]]
        );
    }
}

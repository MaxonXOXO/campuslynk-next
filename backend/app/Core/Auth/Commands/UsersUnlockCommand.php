<?php

declare(strict_types=1);

namespace App\Core\Auth\Commands;

use App\Core\Auth\Models\UserIdentifier;
use App\Core\Auth\Services\LoginRateLimiter;
use App\Core\Tenancy\Models\Tenant;
use Illuminate\Console\Command;

class UsersUnlockCommand extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'users:unlock
                            {identifier : Login identifier (email, mobile, or registration number)}
                            {--tenant= : Specific tenant slug or ID}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Clear login throttle lockouts for a user account across all IPs';

    public function handle(LoginRateLimiter $rateLimiter): int
    {
        $rawIdentifier = (string) $this->argument('identifier');
        $normalised = UserIdentifier::normalise($rawIdentifier);
        $tenantOpt = $this->option('tenant');

        $tenants = [];
        if (is_string($tenantOpt) && trim($tenantOpt) !== '') {
            $t = Tenant::where('slug', trim($tenantOpt))->orWhere('id', trim($tenantOpt))->first();
            if ($t === null) {
                $this->error("Tenant [{$tenantOpt}] not found.");

                return self::FAILURE;
            }
            $tenants = [$t];
        } else {
            $tenants = Tenant::where('status', 'active')->get()->all();
        }

        if (empty($tenants)) {
            $this->warn('No active tenants found.');

            return self::SUCCESS;
        }

        foreach ($tenants as $tenant) {
            $rateLimiter->unlock($tenant->id, $normalised);
            $this->info("Unlocked identifier [{$rawIdentifier}] in tenant [{$tenant->slug}].");
        }

        return self::SUCCESS;
    }
}

<?php

declare(strict_types=1);

namespace App\Core\Tenancy\Commands;

use App\Core\Tenancy\Models\License;
use App\Core\Tenancy\Models\Tenant;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Throwable;

class TenantsLicenseRenewCommand extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'tenants:license:renew
                            {slug : The slug of the tenant institution}
                            {--days= : Number of validity days to add (defaults to LICENSE_DEFAULT_DAYS)}
                            {--plan= : Updated license plan name (optional)}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Renew or extend an institutional tenant license';

    /**
     * Execute the console command.
     */
    public function handle(): int
    {
        $slug = (string) $this->argument('slug');

        /** @var Tenant|null $tenant */
        $tenant = Tenant::where('slug', $slug)->first();

        if ($tenant === null) {
            $this->error(sprintf('Tenant with slug [%s] not found.', $slug));

            return self::FAILURE;
        }

        $daysOption = $this->option('days');
        $days = is_numeric($daysOption)
            ? (int) $daysOption
            : (int) config('tenancy.license_default_days', 365);

        if ($days <= 0) {
            $this->error('The --days option must be a positive integer.');

            return self::FAILURE;
        }

        $planOption = $this->option('plan');
        $plan = is_string($planOption) && trim($planOption) !== ''
            ? trim($planOption)
            : null;

        try {
            /** @var License|null $license */
            $license = $tenant->license;

            if ($license === null) {
                $validUntil = Carbon::now()->addDays($days);
                $license = License::create([
                    'tenant_id' => $tenant->id,
                    'plan' => $plan ?? (string) config('tenancy.defaults.license.plan', 'standard'),
                    'modules' => config('tenancy.defaults.license.modules', ['identity']),
                    'valid_until' => $validUntil,
                ]);
            } else {
                $baseDate = $license->valid_until->isFuture()
                    ? $license->valid_until
                    : Carbon::now();

                $validUntil = $baseDate->copy()->addDays($days);
                $license->valid_until = $validUntil;

                if ($plan !== null) {
                    $license->plan = $plan;
                }

                $license->save();
            }

            // Invalidate cached tenant resolver
            Cache::forget('tenant:entity:'.$tenant->id);
            Cache::forget('tenant:id:'.$tenant->id);
            foreach ($tenant->domains as $d) {
                Cache::forget('tenant:domain:'.$d->domain);
            }

            $this->info(sprintf('Successfully renewed license for tenant [%s] (%s).', $slug, $tenant->name));
            $this->table(
                ['Field', 'Value'],
                [
                    ['Tenant Slug', $slug],
                    ['Plan', $license->plan],
                    ['Days Added', $days],
                    ['New Expiration', $validUntil->toIso8601String()],
                    ['Status', $license->status()],
                ]
            );

            return self::SUCCESS;
        } catch (Throwable $e) {
            $this->error('Failed to renew license: '.$e->getMessage());

            return self::FAILURE;
        }
    }
}

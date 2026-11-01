<?php

declare(strict_types=1);

namespace App\Core\Tenancy\Commands;

use App\Core\Tenancy\Models\Tenant;
use App\Core\Tenancy\Services\TenantProvisioner;
use Illuminate\Console\Command;
use Illuminate\Database\Eloquent\Collection;
use Throwable;

class TenantsMigrateCommand extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'tenants:migrate
                            {--tenant= : Specific tenant slug or ID to migrate}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Run pending tenant migrations across active tenant databases';

    public function handle(TenantProvisioner $provisioner): int
    {
        $tenantIdentifier = $this->option('tenant');

        $query = Tenant::query();

        if (is_string($tenantIdentifier) && $tenantIdentifier !== '') {
            $query->where(function ($q) use ($tenantIdentifier): void {
                $q->where('slug', $tenantIdentifier)->orWhere('id', $tenantIdentifier);
            });
        } else {
            $query->where('status', 'active');
        }

        /** @var Collection<int, Tenant> $tenants */
        $tenants = $query->with(['database', 'license'])->get();

        if ($tenants->isEmpty()) {
            $this->warn('No eligible tenants found for migration.');

            return self::SUCCESS;
        }

        $this->info(sprintf('Migrating %d tenant database(s)...', $tenants->count()));

        $results = [];
        $hasFailures = false;

        foreach ($tenants as $tenant) {
            $this->line(sprintf('Migrating tenant [%s]...', $tenant->slug));

            try {
                $provisioner->runTenantMigrations($tenant);
                $results[] = [
                    'tenant' => $tenant->slug,
                    'status' => 'SUCCESS',
                    'error' => '-',
                ];
            } catch (Throwable $e) {
                $hasFailures = true;
                $results[] = [
                    'tenant' => $tenant->slug,
                    'status' => 'FAILED',
                    'error' => $e->getMessage(),
                ];
                $this->error(sprintf('Error migrating [%s]: %s', $tenant->slug, $e->getMessage()));
            }
        }

        $this->table(['Tenant', 'Migration Status', 'Error Details'], $results);

        if ($hasFailures) {
            $this->error('One or more tenant migrations failed.');

            return self::FAILURE;
        }

        $this->info('All tenant migrations completed successfully.');

        return self::SUCCESS;
    }
}

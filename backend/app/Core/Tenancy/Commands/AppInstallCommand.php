<?php

declare(strict_types=1);

namespace App\Core\Tenancy\Commands;

use App\Core\Tenancy\Models\Tenant;
use App\Core\Tenancy\Services\TenantProvisioner;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Artisan;
use Throwable;

class AppInstallCommand extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'app:install
                            {--domain=carmelpoly.in : The primary domain for the institution}
                            {--name=Carmel Polytechnic College : The institution name}
                            {--slug=carmel : The institution tenant slug}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Install on-premise appliance: run landlord migrations and provision the default institution tenant';

    public function handle(TenantProvisioner $provisioner): int
    {
        $profile = config('app_profile.deploy_profile', 'onprem');

        if ($profile !== 'onprem') {
            $this->error('The app:install command is only available in the "onprem" deployment profile.');

            return self::FAILURE;
        }

        // 1. Run Landlord Migrations
        $this->info('Running landlord migrations...');
        $exitCode = Artisan::call('migrate', [
            '--database' => 'landlord',
            '--path' => 'database/migrations/landlord',
            '--force' => true,
        ]);

        if ($exitCode !== 0) {
            $this->error('Landlord migrations failed: '.Artisan::output());

            return self::FAILURE;
        }
        $this->info('Landlord migrations completed successfully.');

        // 2. Refuse if an institution tenant already exists
        if (Tenant::count() > 0) {
            $this->error('An institution tenant has already been provisioned on this appliance.');

            return self::FAILURE;
        }

        $slug = (string) $this->option('slug');
        $name = (string) $this->option('name');
        $domain = (string) $this->option('domain');

        $this->info(sprintf('Provisioning institution tenant [%s] (%s) on domain [%s]...', $slug, $name, $domain));

        try {
            $tenant = $provisioner->provision(
                slug: $slug,
                name: $name,
                domain: $domain,
                deployProfile: 'onprem'
            );

            $this->table(
                ['Field', 'Value'],
                [
                    ['Tenant ID', $tenant->id],
                    ['Name', $tenant->name],
                    ['Slug', $tenant->slug],
                    ['Domain', $domain],
                    ['Status', $tenant->status],
                    ['Profile', $tenant->deploy_profile],
                ]
            );

            $this->info('Appliance installation completed successfully.');

            return self::SUCCESS;
        } catch (Throwable $e) {
            $this->error('Failed to provision institution tenant: '.$e->getMessage());

            return self::FAILURE;
        }
    }
}

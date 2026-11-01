<?php

declare(strict_types=1);

namespace App\Core\Tenancy\Commands;

use App\Core\Tenancy\Models\Tenant;
use App\Core\Tenancy\Services\TenantProvisioner;
use Illuminate\Console\Command;
use Throwable;

class TenantsCreateCommand extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'tenants:create
                            {name : Full name of the institution}
                            {slug : Unique alphanumeric slug (e.g. carmel)}
                            {domain : Primary institutional domain}
                            {--plan=standard : Licensing plan}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Provision a new isolated tenant database and role';

    public function handle(TenantProvisioner $provisioner): int
    {
        $profile = config('app_profile.deploy_profile', 'onprem');

        if ($profile === 'onprem' && Tenant::count() > 0) {
            $this->error('The "onprem" profile only allows a single institution tenant. Use "cloud" profile for multi-tenancy.');

            return self::FAILURE;
        }

        $name = (string) $this->argument('name');
        $slug = (string) $this->argument('slug');
        $domain = (string) $this->argument('domain');
        $plan = (string) $this->option('plan');

        $this->info(sprintf('Provisioning tenant [%s] (%s)...', $slug, $name));

        try {
            $tenant = $provisioner->provision(
                slug: $slug,
                name: $name,
                domain: $domain,
                deployProfile: $profile,
                plan: $plan
            );

            $this->info(sprintf('Tenant [%s] provisioned successfully with ID: %s', $slug, $tenant->id));

            return self::SUCCESS;
        } catch (Throwable $e) {
            $this->error('Tenant provisioning failed: '.$e->getMessage());

            return self::FAILURE;
        }
    }
}

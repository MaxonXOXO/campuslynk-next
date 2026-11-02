<?php

declare(strict_types=1);

namespace App\Core\Tenancy\Commands;

use App\Core\Tenancy\Models\Tenant;
use App\Core\Tenancy\Services\TenantProvisioner;
use App\Core\Tenancy\TenantContext;
use App\Modules\Identity\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
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
                            {--profile= : Deployment profile override (cloud or onprem)}
                            {--plan=standard : Licensing plan}
                            {--admin-name= : First Super Admin name}
                            {--admin-email= : First Super Admin email}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Provision a new isolated tenant database and role';

    public function handle(TenantProvisioner $provisioner, TenantContext $tenantContext): int
    {
        // 0. Explicit landlord schema presence check
        $landlord = DB::connection('landlord');
        /** @var object{exists: bool}|null $tenantsRow */
        $tenantsRow = $landlord->selectOne("SELECT to_regclass('tenants') IS NOT NULL AS exists");
        /** @var object{exists: bool}|null $domainsRow */
        $domainsRow = $landlord->selectOne("SELECT to_regclass('domains') IS NOT NULL AS exists");

        $hasTenants = $tenantsRow !== null && (bool) $tenantsRow->exists;
        $hasDomains = $domainsRow !== null && (bool) $domainsRow->exists;

        if (! $hasTenants || ! $hasDomains) {
            $this->line('Landlord schema is missing or unmigrated. Please run "php artisan landlord:migrate" via the ops service first.');

            return self::FAILURE;
        }

        $name = trim((string) $this->argument('name'));
        $slug = trim((string) $this->argument('slug'));
        $domain = trim((string) $this->argument('domain'));
        $plan = (string) $this->option('plan');

        $profileOption = $this->option('profile');
        /** @var string $profile */
        $profile = is_string($profileOption) && trim($profileOption) !== ''
            ? trim($profileOption)
            : (string) config('app_profile.deploy_profile', 'cloud');

        if ($profile === 'onprem' && Tenant::count() > 0) {
            $this->line('The "onprem" profile only allows a single institution tenant. Use "cloud" profile for multi-tenancy.');

            return self::FAILURE;
        }

        if (! preg_match('/^[a-z0-9_]{3,32}$/', $slug)) {
            $this->line(sprintf('Invalid tenant slug [%s]. Slug must be 3-32 lowercase alphanumeric characters or underscores.', $slug));

            return self::FAILURE;
        }

        if (! filter_var($domain, FILTER_VALIDATE_DOMAIN, FILTER_FLAG_HOSTNAME) || str_contains($domain, '/')) {
            $this->error(sprintf('Domain [%s] is not a valid hostname.', $domain));

            return self::FAILURE;
        }

        $this->info(sprintf('Provisioning tenant [%s] (%s)...', $slug, $name));

        try {
            $tenant = $provisioner->provision(
                slug: $slug,
                name: $name,
                domain: $domain,
                deployProfile: $profile,
                plan: $plan
            );

            // First Super Admin bootstrap (B5)
            $adminEmailOption = $this->option('admin-email');
            if (is_string($adminEmailOption) && trim($adminEmailOption) !== '') {
                $adminEmail = trim($adminEmailOption);
                $adminName = is_string($this->option('admin-name')) && trim((string) $this->option('admin-name')) !== ''
                    ? trim((string) $this->option('admin-name'))
                    : "{$name} Administrator";

                $tenantContext->setTenant($tenant);
                try {
                    if (User::where('type', 'staff')->count() === 0) {
                        $oneTimePassword = Str::password(16);
                        User::create([
                            'type' => 'staff',
                            'name' => $adminName,
                            'email' => strtolower($adminEmail),
                            'password' => Hash::make($oneTimePassword),
                            'must_change_password' => true,
                            'status' => 'active',
                        ]);

                        $this->newLine();
                        $this->warn('================================================================');
                        $this->warn('   FIRST SUPER ADMIN INITIAL CREDENTIALS (SAVE IMMEDIATELY)');
                        $this->warn('================================================================');
                        $this->line(" Name:               {$adminName}");
                        $this->line(" Email:              {$adminEmail}");
                        $this->line(" One-time Password:  {$oneTimePassword}");
                        $this->warn(' This password is printed ONCE. It is never logged or stored in plain text.');
                        $this->warn(' The user is required to change password upon first login.');
                        $this->warn('================================================================');
                        $this->newLine();
                    }
                } finally {
                    $tenantContext->forget();
                }
            }

            $this->info(sprintf('Tenant [%s] provisioned successfully with ID: %s', $slug, $tenant->id));

            return self::SUCCESS;
        } catch (Throwable $e) {
            $this->error('Tenant provisioning failed: '.$e->getMessage());

            return self::FAILURE;
        }
    }
}

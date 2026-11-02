<?php

declare(strict_types=1);

namespace App\Core\Tenancy\Commands;

use App\Core\Auth\Models\User;
use App\Core\Tenancy\Models\Tenant;
use App\Core\Tenancy\Services\TenantProvisioner;
use App\Core\Tenancy\TenantContext;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Artisan;
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
                            {arg1 : Unique alphanumeric slug or Institution name}
                            {arg2 : Institution name or Unique alphanumeric slug}
                            {domain : Primary institutional domain}
                            {profile? : Deployment profile (cloud or onprem)}
                            {--plan=standard : Licensing plan}
                            {--profile= : Deployment profile override}
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
        // 0. Ensure landlord schema migrations have been executed
        Artisan::call('migrate', [
            '--database' => 'landlord',
            '--path' => 'database/migrations/landlord',
            '--force' => true,
        ]);

        $arg1 = (string) $this->argument('arg1');
        $arg2 = (string) $this->argument('arg2');
        $domain = (string) $this->argument('domain');
        $plan = (string) $this->option('plan');

        if (preg_match('/^[a-z0-9_-]+$/', $arg1) && ! preg_match('/^[a-z0-9_-]+$/', $arg2)) {
            $slug = $arg1;
            $name = $arg2;
        } elseif (preg_match('/^[a-z0-9_-]+$/', $arg2) && ! preg_match('/^[a-z0-9_-]+$/', $arg1)) {
            $slug = $arg2;
            $name = $arg1;
        } else {
            $slug = $arg1;
            $name = $arg2;
        }

        /** @var string $profile */
        $profile = $this->argument('profile')
            ?: $this->option('profile')
            ?: config('app_profile.deploy_profile', 'cloud');

        if ($profile === 'onprem' && Tenant::count() > 0) {
            $this->error('The "onprem" profile only allows a single institution tenant. Use "cloud" profile for multi-tenancy.');

            return self::FAILURE;
        }

        // Validate hostname
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

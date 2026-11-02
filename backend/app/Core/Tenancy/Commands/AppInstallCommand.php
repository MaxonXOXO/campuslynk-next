<?php

declare(strict_types=1);

namespace App\Core\Tenancy\Commands;

use App\Core\Tenancy\Models\Tenant;
use App\Core\Tenancy\Services\TenantProvisioner;
use App\Core\Tenancy\TenantContext;
use App\Modules\Identity\Models\User;
use App\Modules\Organisation\Database\Seeders\KeralaPolytechnicProfileSeeder;
use App\Modules\Organisation\Database\Seeders\TenantBaselineSeeder;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Throwable;

class AppInstallCommand extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'app:install
                            {--domain= : The primary domain for the institution (defaults to app.carmelpoly.in)}
                            {--name=Carmel Polytechnic College : The institution name}
                            {--slug=carmel : The institution tenant slug}
                            {--seed-profile=kerala-polytechnic : Seed profile to populate on tenant creation (kerala-polytechnic, baseline, or none)}
                            {--admin-name= : First Super Admin name}
                            {--admin-email= : First Super Admin email}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Install on-premise appliance: run landlord migrations and provision the default institution tenant';

    public function handle(TenantProvisioner $provisioner, TenantContext $tenantContext): int
    {
        $profile = config('app_profile.deploy_profile', 'onprem');

        if ($profile !== 'onprem') {
            $this->error('The app:install command is only available in the "onprem" deployment profile.');

            return self::FAILURE;
        }

        // 0. Verify secrets are configured before running install
        try {
            $this->verifySecretsConfigured();
        } catch (Throwable $e) {
            $this->error($e->getMessage());

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
        $domainOption = $this->option('domain');
        $domain = is_string($domainOption) && trim($domainOption) !== ''
            ? trim($domainOption)
            : (string) config('tenancy.default_domain', 'app.carmelpoly.in');

        // Validate hostname
        if (! filter_var($domain, FILTER_VALIDATE_DOMAIN, FILTER_FLAG_HOSTNAME) || str_contains($domain, '/')) {
            $this->error(sprintf('Domain [%s] is not a valid hostname.', $domain));

            return self::FAILURE;
        }

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

            // 3. First Super Admin Bootstrap (B5)
            $adminName = is_string($this->option('admin-name')) && trim((string) $this->option('admin-name')) !== ''
                ? trim((string) $this->option('admin-name'))
                : 'Carmel Administrator';
            $adminEmail = is_string($this->option('admin-email')) && trim((string) $this->option('admin-email')) !== ''
                ? trim((string) $this->option('admin-email'))
                : 'admin@app.carmelpoly.in';

            $tenantContext->setTenant($tenant);
            try {
                $seedProfile = (string) ($this->option('seed-profile') ?? 'kerala-polytechnic');
                if ($seedProfile === 'kerala-polytechnic') {
                    $this->info('Seeding Kerala Polytechnic profile...');
                    app(KeralaPolytechnicProfileSeeder::class)->run();
                } elseif ($seedProfile === 'baseline') {
                    $this->info('Seeding tenant baseline profile...');
                    app(TenantBaselineSeeder::class)->run();
                }

                if (User::where('type', 'staff')->count() === 0) {
                    $oneTimePassword = Str::password(16, symbols: false);
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

            $this->info('Appliance installation completed successfully.');

            return self::SUCCESS;
        } catch (Throwable $e) {
            $this->error('Failed to provision institution tenant: '.$e->getMessage());

            return self::FAILURE;
        }
    }

    /**
     * Verify that unique APP_KEY and credentials exist before installation.
     *
     * @throws \RuntimeException
     */
    protected function verifySecretsConfigured(): void
    {
        $key = config('app.key');

        if (! is_string($key) || trim($key) === '') {
            throw new \RuntimeException('Application key (APP_KEY) is not set. Run the init-secrets script before starting the appliance.');
        }

        $prohibitedKeys = [
            'base64:c29tZXJhbmRvbXN0cmluZ2ZvcmFwcGtleXNlY3VyZTEyMw==',
            'base64:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
            'base64:EXAMPLE_INSECURE_APP_KEY_REPLACE_ME==',
            'base64:o+PwvSaXMDgy1jfacfUAh5aH0pBRCtm10lxCmmE7NtU=',
        ];

        if (in_array($key, $prohibitedKeys, true)
            || str_contains(strtolower($key), 'example')
            || str_contains(strtolower($key), 'placeholder')
            || str_contains(strtolower($key), 'change_me')
        ) {
            throw new \RuntimeException('Application key (APP_KEY) is an example or placeholder. Run the init-secrets script to generate unique secrets.');
        }
    }
}

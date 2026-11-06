<?php

declare(strict_types=1);

namespace App\Core\Tenancy\Commands;

use App\Core\Modules\ModuleRegistry;
use App\Core\Tenancy\Models\Tenant;
use App\Core\Tenancy\Services\TenantProvisioner;
use App\Core\Tenancy\TenantContext;
use Carbon\Carbon;
use Illuminate\Console\Command;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
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
                            {--domain= : The primary domain for the institution}
                            {--name= : The institution name}
                            {--slug= : The institution tenant slug}
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
        if (trim($slug) === '' && $this->input->isInteractive()) {
            try {
                $slug = (string) $this->ask('Enter the institution tenant slug');
            } catch (Throwable) {
                $slug = '';
            }
        }
        $slug = trim($slug);
        if ($slug === '') {
            $this->error('The --slug option is required.');

            return self::FAILURE;
        }

        $name = (string) $this->option('name');
        if (trim($name) === '' && $this->input->isInteractive()) {
            try {
                $name = (string) $this->ask('Enter the institution name');
            } catch (Throwable) {
                $name = '';
            }
        }
        $name = trim($name);
        if ($name === '') {
            $this->error('The --name option is required.');

            return self::FAILURE;
        }

        $domain = (string) $this->option('domain');
        if (trim($domain) === '' && $this->input->isInteractive()) {
            try {
                $domain = (string) $this->ask('Enter the primary institutional domain');
            } catch (Throwable) {
                $domain = '';
            }
        }
        $domain = trim($domain);
        if ($domain === '') {
            $this->error('The --domain option is required.');

            return self::FAILURE;
        }

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

            $tenantContext->setTenant($tenant);
            try {
                // Always seed RBAC baseline (roles, delegation rules, permissions) before optional profile or admin creation
                app(ModuleRegistry::class)->seed('rbac');

                $seedProfile = (string) ($this->option('seed-profile') ?? 'kerala-polytechnic');
                if ($seedProfile !== '' && $seedProfile !== 'none') {
                    $this->info(sprintf('Seeding %s profile...', $seedProfile));
                    app(ModuleRegistry::class)->seed($seedProfile);
                }

                // 3. First Super Admin Bootstrap (B5 + super_admin role assignment)
                $adminEmailOption = $this->option('admin-email');
                if (is_string($adminEmailOption) && trim($adminEmailOption) !== '') {
                    $adminEmail = trim($adminEmailOption);
                    $adminName = is_string($this->option('admin-name')) && trim((string) $this->option('admin-name')) !== ''
                        ? trim((string) $this->option('admin-name'))
                        : "{$name} Administrator";

                    /** @var class-string<Model> $userModel */
                    $userModel = (string) config('auth.providers.users.model');
                    if (! class_exists($userModel)) {
                        throw new \RuntimeException('Configured user model does not exist.');
                    }

                    if ($userModel::query()->where('type', 'staff')->count() === 0) {
                        $oneTimePassword = Str::password(16, symbols: false);

                        DB::connection('tenant')->transaction(function () use ($userModel, $adminName, $adminEmail, $oneTimePassword, $tenant): void {
                            /** @var object{id: string}|null $superAdminRole */
                            $superAdminRole = DB::connection('tenant')->table('roles')->where('key', 'super_admin')->first();
                            if ($superAdminRole === null) {
                                throw new \RuntimeException('Cannot bootstrap Super Admin: role [super_admin] does not exist in tenant database.');
                            }

                            /** @var Model $user */
                            $user = $userModel::query()->create([
                                'type' => 'staff',
                                'name' => $adminName,
                                'email' => strtolower($adminEmail),
                                'password' => Hash::make($oneTimePassword),
                                'must_change_password' => true,
                                'status' => 'active',
                            ]);

                            /** @var object{scope_label: string}|null $inst */
                            $inst = DB::connection('tenant')->table('institution')->first();
                            $scopeLabel = $inst !== null ? $inst->scope_label : 'i_'.$tenant->slug;

                            $assigned = DB::connection('tenant')->table('role_assignments')->insert([
                                'id' => (string) Str::ulid(),
                                'user_id' => $user->getKey(),
                                'role_id' => $superAdminRole->id,
                                'scope_type' => 'institution',
                                'scope_id' => null,
                                'scope_label' => $scopeLabel,
                                'is_singleton' => false,
                                'valid_from' => Carbon::now(),
                                'valid_to' => null,
                                'is_active' => true,
                                'assigned_by_user_id' => $user->getKey(),
                                'order_record' => 'Bootstrap Super Admin',
                                'created_at' => Carbon::now(),
                                'updated_at' => Carbon::now(),
                            ]);

                            if (! $assigned) {
                                throw new \RuntimeException('Cannot bootstrap Super Admin: failed to create role assignment.');
                            }
                        });

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

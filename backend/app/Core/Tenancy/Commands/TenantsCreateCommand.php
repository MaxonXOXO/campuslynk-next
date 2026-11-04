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
                            {--seed-profile= : Seed profile to populate on tenant creation (kerala-polytechnic, baseline, or none)}
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

            // Optional Tenant Seeding (Part 1 / Step 4)
            $seedProfileOption = $this->option('seed-profile');
            if (is_string($seedProfileOption) && trim($seedProfileOption) !== '' && trim($seedProfileOption) !== 'none') {
                $seedProfile = trim($seedProfileOption);
                $tenantContext->setTenant($tenant);
                try {
                    $this->info(sprintf('Seeding %s profile...', $seedProfile));
                    app(ModuleRegistry::class)->seed($seedProfile);
                } finally {
                    $tenantContext->forget();
                }
            }

            // First Super Admin bootstrap (B5 + super_admin role assignment)
            $adminEmailOption = $this->option('admin-email');
            if (is_string($adminEmailOption) && trim($adminEmailOption) !== '') {
                $adminEmail = trim($adminEmailOption);
                $adminName = is_string($this->option('admin-name')) && trim((string) $this->option('admin-name')) !== ''
                    ? trim((string) $this->option('admin-name'))
                    : "{$name} Administrator";

                $tenantContext->setTenant($tenant);
                try {
                    /** @var class-string<Model> $userModel */
                    $userModel = (string) config('auth.providers.users.model');
                    if (class_exists($userModel) && $userModel::query()->where('type', 'staff')->count() === 0) {
                        $oneTimePassword = Str::password(16);

                        DB::connection('tenant')->transaction(function () use ($userModel, $adminName, $adminEmail, $oneTimePassword, $tenant): void {
                            /** @var Model $user */
                            $user = $userModel::query()->create([
                                'type' => 'staff',
                                'name' => $adminName,
                                'email' => strtolower($adminEmail),
                                'password' => Hash::make($oneTimePassword),
                                'must_change_password' => true,
                                'status' => 'active',
                            ]);

                            /** @var object{id: string}|null $superAdminRole */
                            $superAdminRole = DB::connection('tenant')->table('roles')->where('key', 'super_admin')->first();
                            if ($superAdminRole !== null) {
                                /** @var object{scope_label: string}|null $inst */
                                $inst = DB::connection('tenant')->table('institution')->first();
                                $scopeLabel = $inst !== null ? $inst->scope_label : 'i_'.$tenant->slug;

                                DB::connection('tenant')->table('role_assignments')->insert([
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

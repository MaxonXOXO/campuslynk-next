<?php

declare(strict_types=1);

namespace App\Modules\Identity\Commands;

use App\Core\Tenancy\Models\Tenant;
use App\Core\Tenancy\TenantContext;
use App\Modules\Identity\IdentityModule;
use App\Modules\Identity\Models\Permission;
use App\Modules\Identity\Models\Role;
use App\Modules\Organisation\OrganisationModule;
use Illuminate\Console\Command;
use Illuminate\Support\Str;

class PermissionsSyncCommand extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'permissions:sync
                            {--all : Synchronize permissions across all tenant databases}
                            {--tenant= : Synchronize permissions for a specific tenant slug}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Synchronize module declared permissions and role mappings into the tenant database';

    public function handle(TenantContext $tenantContext): int
    {
        if ($this->option('all')) {
            $tenants = Tenant::where('status', 'active')->get();
            $this->info(sprintf('Synchronizing permissions across %d active tenants...', $tenants->count()));

            foreach ($tenants as $tenant) {
                $this->line(sprintf('Syncing tenant [%s]...', $tenant->slug));
                $tenantContext->setTenant($tenant);
                try {
                    $this->syncCurrentTenant();
                } finally {
                    $tenantContext->forget();
                }
            }

            $this->info('All tenants synchronized successfully.');

            return self::SUCCESS;
        }

        $tenantSlug = $this->option('tenant');
        if (is_string($tenantSlug) && trim($tenantSlug) !== '') {
            /** @var Tenant $tenant */
            $tenant = Tenant::where('slug', trim($tenantSlug))->firstOrFail();
            $tenantContext->setTenant($tenant);
            try {
                $this->syncCurrentTenant();
            } finally {
                $tenantContext->forget();
            }

            return self::SUCCESS;
        }

        if (! $tenantContext->hasTenant()) {
            $this->error('No tenant context active. Please supply --tenant={slug} or --all.');

            return self::FAILURE;
        }

        $this->syncCurrentTenant();

        return self::SUCCESS;
    }

    /**
     * Synchronize permissions and role mappings for the currently active tenant.
     */
    public function syncCurrentTenant(): void
    {
        /** @var list<class-string> $moduleProviders */
        $moduleProviders = [
            IdentityModule::class,
            OrganisationModule::class,
        ];

        $totalPermissions = 0;
        $totalBindings = 0;

        /** @var array<string, list<string>> $allRolePermissions */
        $allRolePermissions = [];

        foreach ($moduleProviders as $providerClass) {
            if (! method_exists($providerClass, 'permissions')) {
                continue;
            }

            /** @var list<string> $declaredPermissions */
            $declaredPermissions = $providerClass::permissions();

            foreach ($declaredPermissions as $permKey) {
                // Parse module from key (e.g. identity.user.view => module: identity)
                $parts = explode('.', $permKey);
                $module = $parts[0];
                $action = implode(' ', array_slice($parts, 1));
                $name = Str::headline($action);

                Permission::updateOrCreate(
                    ['key' => $permKey],
                    [
                        'name' => $name,
                        'module' => $module,
                        'description' => "Permission to {$action} in {$module}",
                    ]
                );
                $totalPermissions++;
            }

            if (method_exists($providerClass, 'rolePermissions')) {
                /** @var array<string, list<string>> $roleMap */
                $roleMap = $providerClass::rolePermissions();
                foreach ($roleMap as $roleKey => $perms) {
                    if (! isset($allRolePermissions[$roleKey])) {
                        $allRolePermissions[$roleKey] = [];
                    }
                    $allRolePermissions[$roleKey] = array_values(array_unique(array_merge($allRolePermissions[$roleKey], $perms)));
                }
            }
        }

        // Bind permissions to roles
        foreach ($allRolePermissions as $roleKey => $permKeys) {
            /** @var Role|null $role */
            $role = Role::where('key', $roleKey)->first();
            if ($role === null) {
                continue;
            }

            $permissionIds = Permission::whereIn('key', $permKeys)->pluck('id')->all();
            $role->permissions()->syncWithoutDetaching($permissionIds);
            $totalBindings += count($permissionIds);
        }

        if ($this->output !== null) {
            $this->info(sprintf('Successfully synced %d permissions and %d role bindings.', $totalPermissions, $totalBindings));
        }
    }
}

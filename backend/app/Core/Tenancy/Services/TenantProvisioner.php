<?php

declare(strict_types=1);

namespace App\Core\Tenancy\Services;

use App\Core\Tenancy\Models\Domain;
use App\Core\Tenancy\Models\License;
use App\Core\Tenancy\Models\SchemaVersion;
use App\Core\Tenancy\Models\Tenant;
use App\Core\Tenancy\Models\TenantDatabase;
use App\Core\Tenancy\TenantContext;
use Exception;
use Illuminate\Database\ConnectionInterface;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use InvalidArgumentException;
use RuntimeException;
use Throwable;

class TenantProvisioner
{
    public const SLUG_REGEX = '/^[a-z][a-z0-9_]{2,40}$/';

    public function __construct(
        protected TenantContext $tenantContext
    ) {}

    /**
     * Validate a tenant slug against security constraints.
     *
     * @throws InvalidArgumentException
     */
    public function validateSlug(string $slug): void
    {
        if (! preg_match(self::SLUG_REGEX, $slug)) {
            throw new InvalidArgumentException(sprintf(
                'Tenant slug [%s] is invalid. It must match %s (lowercase letters, numbers, underscores, 3-41 chars).',
                $slug,
                self::SLUG_REGEX
            ));
        }
    }

    /**
     * Provision a new tenant database, role, and landlord records.
     *
     * @param  array<string>|null  $modules
     *
     * @throws Throwable
     */
    public function provision(
        string $slug,
        string $name,
        string $domain,
        ?string $deployProfile = null,
        ?array $modules = null,
        ?string $plan = 'standard'
    ): Tenant {
        $this->validateSlug($slug);

        $deployProfile = $deployProfile ?? config('app_profile.deploy_profile', 'onprem');
        /** @var string $prefix */
        $prefix = (string) config('tenancy.db_prefix', 'tenant_');
        $dbName = $prefix.$slug;
        $roleName = $prefix.$slug.'_u';
        $plainPassword = Str::random(32);

        $adminConnection = DB::connection('pgsql_admin');

        // Check if database or role already exists
        $dbExists = $adminConnection->selectOne(
            'SELECT 1 FROM pg_database WHERE datname = ?',
            [$dbName]
        );

        if ($dbExists !== null) {
            throw new RuntimeException(sprintf('Database [%s] already exists on PostgreSQL server.', $dbName));
        }

        $tenant = null;
        $dbCreated = false;
        $roleCreated = false;

        try {
            // 1. Create tenant record in landlord with status 'provisioning'
            /** @var Tenant $tenant */
            $tenant = Tenant::create([
                'slug' => $slug,
                'name' => $name,
                'status' => 'provisioning',
                'deploy_profile' => $deployProfile,
            ]);

            // 2. Register domain
            Domain::create([
                'tenant_id' => $tenant->id,
                'domain' => strtolower($domain),
                'is_primary' => true,
            ]);

            // 3. PostgreSQL DDL: Create Role and Database
            // Quoting identifiers safely
            $quotedDb = '"'.$dbName.'"';
            $quotedRole = '"'.$roleName.'"';
            $quotedPassword = $adminConnection->getPdo()->quote($plainPassword);

            $adminUsername = (string) $adminConnection->getConfig('username');
            $adminRole = '"'.$adminUsername.'"';

            // Create Role with LOGIN and explicit least-privilege hygiene flags (ADR-0010, A9)
            // Adding ROLE {$adminRole} grants the provisioner membership in the newly created role,
            // which is required in PostgreSQL 16+ CREATEROLE semantics to assign OWNER to {$quotedRole}.
            $adminConnection->statement(
                "CREATE ROLE {$quotedRole} WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT PASSWORD {$quotedPassword} ROLE {$adminRole}"
            );
            $roleCreated = true;

            // Create Database with Role as Owner
            $adminConnection->statement("CREATE DATABASE {$quotedDb} OWNER {$quotedRole}");
            $dbCreated = true;

            // Revoke Connect on Database from PUBLIC (Postgres default allows everyone)
            $adminConnection->statement("REVOKE CONNECT ON DATABASE {$quotedDb} FROM PUBLIC");

            // Grant Connect to dedicated Role
            $adminConnection->statement("GRANT CONNECT ON DATABASE {$quotedDb} TO {$quotedRole}");

            // 4. Record tenant database connection in landlord
            $runtimeHost = config('database.connections.tenant.host', '127.0.0.1');
            $runtimePort = (int) config('database.connections.tenant.port', 6432);

            /** @var TenantDatabase $tenantDatabase */
            $tenantDatabase = TenantDatabase::create([
                'tenant_id' => $tenant->id,
                'host' => $runtimeHost,
                'port' => $runtimePort,
                'database' => $dbName,
                'username' => $roleName,
                'password' => $plainPassword, // Automatically encrypted by model mutator
            ]);

            // 5. Create default License
            $defaultPlan = (string) config('tenancy.defaults.license.plan', 'standard');
            $validDays = (int) config('tenancy.defaults.license.valid_for_days', 365);
            /** @var array<string> $defaultModules */
            $defaultModules = config('tenancy.defaults.license.modules', ['identity', 'attendance', 'assessment', 'office']);

            License::create([
                'tenant_id' => $tenant->id,
                'plan' => $plan ?? $defaultPlan,
                'modules' => $modules ?? $defaultModules,
                'valid_until' => now()->addDays($validDays),
            ]);

            // Reload relationships
            $tenant->load(['database', 'license', 'domains']);

            // 6. Run Tenant Migrations
            $this->runTenantMigrations($tenant);

            // 7. Mark tenant active
            $tenant->update(['status' => 'active']);

            return $tenant;
        } catch (Throwable $e) {
            // Cleanup on failure
            $this->rollbackProvisioning($adminConnection, $dbName, $roleName, $tenant, $dbCreated, $roleCreated);

            throw $e;
        }
    }

    /**
     * Run migrations on the tenant database.
     */
    public function runTenantMigrations(Tenant $tenant): void
    {
        $this->tenantContext->setTenant($tenant);

        try {
            $exitCode = Artisan::call('migrate', [
                '--database' => 'tenant',
                '--path' => 'database/migrations/tenant',
                '--force' => true,
            ]);

            if ($exitCode !== 0) {
                $output = Artisan::output();
                throw new RuntimeException(sprintf('Tenant migration failed with exit code %d: %s', $exitCode, $output));
            }

            SchemaVersion::updateOrCreate(
                [
                    'tenant_id' => $tenant->id,
                    'version' => '1.0.0',
                ],
                [
                    'migrated_at' => now(),
                ]
            );
        } finally {
            $this->tenantContext->forget();
        }
    }

    /**
     * Rollback failed provisioning to prevent orphaned databases or roles.
     */
    protected function rollbackProvisioning(
        ConnectionInterface $adminConnection,
        string $dbName,
        string $roleName,
        ?Tenant $tenant,
        bool $dbCreated,
        bool $roleCreated
    ): void {
        if ($dbCreated) {
            try {
                // Terminate active connections
                $adminConnection->statement(
                    'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = ? AND pid <> pg_backend_pid() AND usename NOT IN (SELECT rolname FROM pg_roles WHERE rolsuper = true)',
                    [$dbName]
                );
                $adminConnection->statement('DROP DATABASE IF EXISTS "'.$dbName.'"');
            } catch (Exception) {
                // Ignore rollback errors to proceed with role cleanup
            }
        }

        if ($roleCreated) {
            try {
                $adminConnection->statement('DROP ROLE IF EXISTS "'.$roleName.'"');
            } catch (Exception) {
                // Ignore
            }
        }

        if ($tenant !== null) {
            try {
                $tenant->update(['status' => 'failed']);
            } catch (Exception) {
                // Ignore
            }
        }
    }

    /**
     * Completely deprovision and destroy a tenant (used in tests and tenant removal).
     */
    public function deprovision(Tenant $tenant): void
    {
        /** @var string $prefix */
        $prefix = (string) config('tenancy.db_prefix', 'tenant_');
        $dbName = $prefix.$tenant->slug;
        $roleName = $prefix.$tenant->slug.'_u';

        $adminConnection = DB::connection('pgsql_admin');

        try {
            $adminConnection->statement(
                'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = ? AND pid <> pg_backend_pid() AND usename NOT IN (SELECT rolname FROM pg_roles WHERE rolsuper = true)',
                [$dbName]
            );
            $adminConnection->statement('DROP DATABASE IF EXISTS "'.$dbName.'"');
            $adminConnection->statement('DROP ROLE IF EXISTS "'.$roleName.'"');
        } catch (Exception) {
            // Ignore if already dropped
        }

        $tenant->domains()->delete();
        $tenant->database()->delete();
        $tenant->license()->delete();
        $tenant->schemaVersions()->delete();
        $tenant->delete();
    }
}

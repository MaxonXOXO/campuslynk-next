<?php

declare(strict_types=1);

namespace Tests\Feature\Tenancy;

use App\Core\Tenancy\TenantContext;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

trait TenancyTestHelper
{
    /**
     * Ensure landlord schema is migrated via ops/provisioner connection.
     */
    protected function migrateLandlord(): void
    {
        Artisan::call('migrate', [
            '--database' => 'pgsql_admin',
            '--path' => 'database/migrations/landlord',
            '--force' => true,
        ]);

        $admin = DB::connection('pgsql_admin');
        $admin->statement('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO landlord_app');
        $admin->statement('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO landlord_app');
    }

    /**
     * Clean up all provisioned tenant databases, roles, and landlord records.
     */
    protected function purgeAllTenantDatabases(): void
    {
        $this->migrateLandlord();

        /** @var TenantContext $context */
        $context = app(TenantContext::class);
        $context->forget();

        Cache::flush();

        // 1. Clean up landlord database records
        config(['app_profile.deploy_profile' => env('DEPLOY_PROFILE', 'onprem')]);
        config(['app.trusted_proxies' => null]);

        $landlord = DB::connection('landlord');
        $landlord->statement('DELETE FROM schema_versions');
        $landlord->statement('DELETE FROM licenses');
        $landlord->statement('DELETE FROM tenant_databases');
        $landlord->statement('DELETE FROM domains');
        $landlord->statement('DELETE FROM tenants');

        // 2. Drop PostgreSQL tenant databases and roles
        $admin = DB::connection('pgsql_admin');

        /** @var array<int, object{datname: string}> $dbs */
        $dbs = $admin->select("SELECT datname FROM pg_database WHERE datname LIKE 'tenant_%'");
        foreach ($dbs as $db) {
            $name = $db->datname;
            try {
                $admin->statement(
                    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '{$name}' AND pid <> pg_backend_pid()"
                );
            } catch (\Throwable) {
                // Ignore if process cannot be signalled or already exited
            }
            try {
                $admin->statement("DROP DATABASE IF EXISTS \"{$name}\" WITH (FORCE)");
            } catch (\Throwable) {
                // Ignore
            }
        }

        /** @var array<int, object{rolname: string}> $roles */
        $roles = $admin->select("SELECT rolname FROM pg_roles WHERE rolname LIKE 'tenant_%_u'");
        foreach ($roles as $role) {
            $name = $role->rolname;
            $admin->statement("DROP ROLE IF EXISTS \"{$name}\"");
        }
    }
}

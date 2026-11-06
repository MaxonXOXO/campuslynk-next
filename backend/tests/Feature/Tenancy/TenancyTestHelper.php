<?php

declare(strict_types=1);

namespace Tests\Feature\Tenancy;

use App\Core\Tenancy\TenantContext;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use PDO;
use RuntimeException;

trait TenancyTestHelper
{
    public const TEST_LANDLORD_DB = 'landlord_test';

    public const TEST_TENANT_DB_PREFIX = 'tenant_test_';

    protected static bool $testEnvironmentBootstrapped = false;

    /**
     * Strictly verify that tests are running in the isolated testing environment
     * against the dedicated test landlord database and test tenant prefix.
     *
     * @throws RuntimeException
     */
    protected function assertTestingEnvironmentSafety(): void
    {
        if (app()->environment() !== 'testing') {
            throw new RuntimeException(sprintf(
                'Refusing to run test database operations: APP_ENV must be "testing", got "%s".',
                (string) app()->environment()
            ));
        }

        $landlordDb = (string) config('database.connections.landlord.database');
        $adminDb = (string) config('database.connections.pgsql_admin.database');

        if ($landlordDb !== self::TEST_LANDLORD_DB || $adminDb !== self::TEST_LANDLORD_DB) {
            throw new RuntimeException(sprintf(
                'Refusing to run test database operations: landlord database must be "%s", got landlord="%s", pgsql_admin="%s".',
                self::TEST_LANDLORD_DB,
                $landlordDb,
                $adminDb
            ));
        }

        $prefix = (string) config('tenancy.db_prefix');
        if ($prefix !== self::TEST_TENANT_DB_PREFIX) {
            throw new RuntimeException(sprintf(
                'Refusing to run test database operations: tenancy.db_prefix must be "%s", got "%s".',
                self::TEST_TENANT_DB_PREFIX,
                $prefix
            ));
        }
    }

    /**
     * Ensure the isolated `landlord_test` database exists and is migrated,
     * and sweep any leftover test-prefixed databases/roles from earlier interrupted runs.
     */
    protected function ensureTestEnvironmentBootstrapped(): void
    {
        $this->assertTestingEnvironmentSafety();

        if (! self::$testEnvironmentBootstrapped) {
            $this->ensureLandlordTestDatabaseExists();
            $this->migrateLandlord();
            $this->purgeTestTenantDatabasesAndRoles();
            self::$testEnvironmentBootstrapped = true;
        }
    }

    /**
     * Create `landlord_test` if missing on the PostgreSQL server using `provisioner`.
     */
    protected function ensureLandlordTestDatabaseExists(): void
    {
        $host = (string) config('database.connections.pgsql_admin.host', '127.0.0.1');
        $port = (int) config('database.connections.pgsql_admin.port', 5432);
        $user = (string) config('database.connections.pgsql_admin.username', 'provisioner');
        $pass = (string) config('database.connections.pgsql_admin.password', 'secret');

        // Connect to template1 (or postgres) to check and create landlord_test if needed
        $pdo = new PDO("pgsql:host={$host};port={$port};dbname=template1", $user, $pass, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        ]);

        $quotedDb = '"'.self::TEST_LANDLORD_DB.'"';
        $quotedUser = '"'.$user.'"';
        $stmt = $pdo->prepare('SELECT 1 FROM pg_database WHERE datname = ?');
        $stmt->execute([self::TEST_LANDLORD_DB]);
        if ($stmt->fetchColumn() === false) {
            $pdo->exec("CREATE DATABASE {$quotedDb} OWNER {$quotedUser}");
        }
        $pdo->exec("REVOKE CONNECT ON DATABASE {$quotedDb} FROM PUBLIC");
        $pdo->exec("GRANT CONNECT ON DATABASE {$quotedDb} TO {$quotedUser}");
        $pdo->exec("GRANT CONNECT ON DATABASE {$quotedDb} TO landlord_app");
        $pdo->exec("GRANT CONNECT ON DATABASE {$quotedDb} TO pgbouncer_auth");

        // Connect to landlord_test as provisioner (database owner) and grant schema privileges
        $pdoTest = new PDO("pgsql:host={$host};port={$port};dbname=".self::TEST_LANDLORD_DB, $user, $pass, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        ]);
        $pdoTest->exec("GRANT ALL ON SCHEMA public TO {$quotedUser}");
        $pdoTest->exec('GRANT USAGE ON SCHEMA public TO landlord_app');
        $pdoTest->exec("ALTER DEFAULT PRIVILEGES FOR ROLE {$quotedUser} IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO landlord_app");
        $pdoTest->exec("ALTER DEFAULT PRIVILEGES FOR ROLE {$quotedUser} IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO landlord_app");
    }

    /**
     * Ensure landlord schema is migrated via ops/provisioner connection.
     */
    protected function migrateLandlord(): void
    {
        $this->assertTestingEnvironmentSafety();
        $this->ensureLandlordTestDatabaseExists();

        Artisan::call('migrate', [
            '--database' => 'pgsql_admin',
            '--path' => 'database/migrations/landlord',
            '--force' => true,
            '--no-interaction' => true,
        ]);

        $admin = DB::connection('pgsql_admin');
        $admin->statement('GRANT USAGE ON SCHEMA public TO landlord_app');
        $admin->statement('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO landlord_app');
        $admin->statement('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO landlord_app');
    }

    /**
     * Clean up only test-prefixed tenant databases, test-prefixed roles, and `landlord_test` records.
     * Never touches `landlord` or any non-test `tenant_*` database/role.
     */
    protected function purgeAllTenantDatabases(): void
    {
        $this->assertTestingEnvironmentSafety();
        $this->migrateLandlord();

        /** @var TenantContext $context */
        $context = app(TenantContext::class);
        $context->forget();

        Cache::flush();

        // 1. Clean up landlord_test database records
        config(['app_profile.deploy_profile' => env('DEPLOY_PROFILE', 'onprem')]);
        config(['app.trusted_proxies' => null]);

        $landlord = DB::connection('landlord');
        $landlord->statement('DELETE FROM schema_versions');
        $landlord->statement('DELETE FROM licenses');
        $landlord->statement('DELETE FROM tenant_databases');
        $landlord->statement('DELETE FROM domains');
        $landlord->statement('DELETE FROM tenants');

        // 2. Drop only test-prefixed PostgreSQL tenant databases and roles
        $this->purgeTestTenantDatabasesAndRoles();
    }

    /**
     * Drop only PostgreSQL databases and roles matching TEST_TENANT_DB_PREFIX (`tenant_test_*`).
     */
    protected function purgeTestTenantDatabasesAndRoles(): void
    {
        $this->assertTestingEnvironmentSafety();

        $admin = DB::connection('pgsql_admin');
        $dbPattern = self::TEST_TENANT_DB_PREFIX.'%';
        $rolePattern = self::TEST_TENANT_DB_PREFIX.'%_u';

        /** @var array<int, object{datname: string}> $dbs */
        $dbs = $admin->select('SELECT datname FROM pg_database WHERE datname LIKE ?', [$dbPattern]);
        foreach ($dbs as $db) {
            $name = $db->datname;
            if (! str_starts_with($name, self::TEST_TENANT_DB_PREFIX)) {
                continue;
            }
            try {
                $admin->statement(
                    'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = ? AND pid <> pg_backend_pid()',
                    [$name]
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
        $roles = $admin->select('SELECT rolname FROM pg_roles WHERE rolname LIKE ?', [$rolePattern]);
        foreach ($roles as $role) {
            $name = $role->rolname;
            if (! str_starts_with($name, self::TEST_TENANT_DB_PREFIX)) {
                continue;
            }
            try {
                $admin->statement("DROP ROLE IF EXISTS \"{$name}\"");
            } catch (\Throwable) {
                // Ignore if role is still referenced or owned by another superuser
            }
        }
    }
}

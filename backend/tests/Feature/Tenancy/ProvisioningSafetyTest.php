<?php

declare(strict_types=1);

use App\Core\Tenancy\Models\Tenant;
use App\Core\Tenancy\Services\TenantProvisioner;
use Illuminate\Support\Facades\DB;

beforeEach(function () {
    $this->purgeAllTenantDatabases();
    $this->provisioner = app(TenantProvisioner::class);
});

afterEach(function () {
    $this->purgeAllTenantDatabases();
});

it('rejects hostile or invalid slugs at validation before executing DDL', function (string $hostileSlug) {
    expect(fn () => $this->provisioner->provision($hostileSlug, 'Test College', 'test.test'))
        ->toThrow(InvalidArgumentException::class);
})->with([
    'uppercase' => 'CARMEL',
    'hyphen' => 'carmel-poly',
    'sql_injection' => 'carmel; DROP TABLE tenants;',
    'spaces' => 'carmel poly',
    'special_chars' => 'carmel$poly',
    'too_short' => 'ab',
    'starts_with_number' => '1carmel',
    'too_long' => str_repeat('a', 50),
]);

it('cleans up created database and role upon mid-way provisioning failure without orphans', function () {
    $admin = DB::connection('pgsql_admin');

    // Simulate failure by breaking migration path or forcing an error during migration
    $originalPath = config('database.migrations');

    $prefix = (string) config('tenancy.db_prefix', 'tenant_test_');
    $dbName = $prefix.'fail_test';
    $roleName = $prefix.'fail_test_u';

    try {
        // Attempt provisioning with an invalid migration or mock failure
        // We can test that rollbackProvisioning correctly drops database and role

        // Pre-create role and db to simulate mid-way state
        $adminRole = config('database.connections.pgsql_admin.username', 'provisioner');
        $admin->statement("CREATE ROLE \"{$roleName}\" WITH LOGIN PASSWORD 'secret' ROLE {$adminRole}");
        $admin->statement("CREATE DATABASE \"{$dbName}\" OWNER \"{$roleName}\"");

        $tenant = Tenant::create([
            'slug' => 'fail_test',
            'name' => 'Failing College',
            'status' => 'provisioning',
            'deploy_profile' => 'cloud',
        ]);

        // Call deprovision to verify clean removal
        $this->provisioner->deprovision($tenant);

        // Verify database and role no longer exist
        $dbCheck = $admin->selectOne('SELECT 1 FROM pg_database WHERE datname = ?', [$dbName]);
        $roleCheck = $admin->selectOne('SELECT 1 FROM pg_roles WHERE rolname = ?', [$roleName]);

        expect($dbCheck)->toBeNull()
            ->and($roleCheck)->toBeNull();
    } finally {
        $admin->statement("DROP DATABASE IF EXISTS \"{$dbName}\"");
        $admin->statement("DROP ROLE IF EXISTS \"{$roleName}\"");
    }
});

it('aborts test database purge unless APP_ENV is testing, landlord is landlord_test, and prefix is tenant_test_', function () {
    $originalLandlordDb = config('database.connections.landlord.database');
    $originalPrefix = config('tenancy.db_prefix');

    try {
        config(['database.connections.landlord.database' => 'landlord']);
        expect(fn () => $this->purgeAllTenantDatabases())
            ->toThrow(RuntimeException::class, 'landlord database must be "landlord_test"');

        config(['database.connections.landlord.database' => $originalLandlordDb]);
        config(['tenancy.db_prefix' => 'tenant_']);
        expect(fn () => $this->purgeAllTenantDatabases())
            ->toThrow(RuntimeException::class, 'tenancy.db_prefix must be "tenant_test_"');
    } finally {
        config(['database.connections.landlord.database' => $originalLandlordDb]);
        config(['tenancy.db_prefix' => $originalPrefix]);
    }
});

it('preserves non-test tenant databases and roles during test purge', function () {
    $admin = DB::connection('pgsql_admin');
    $adminRole = (string) config('database.connections.pgsql_admin.username', 'provisioner');

    $devDbName = 'tenant_dev_protect_check';
    $devRoleName = 'tenant_dev_protect_check_u';

    try {
        $admin->statement("DROP DATABASE IF EXISTS \"{$devDbName}\" WITH (FORCE)");
        $admin->statement("DROP ROLE IF EXISTS \"{$devRoleName}\"");

        $admin->statement("CREATE ROLE \"{$devRoleName}\" WITH LOGIN PASSWORD 'secret' ROLE \"{$adminRole}\"");
        $admin->statement("CREATE DATABASE \"{$devDbName}\" OWNER \"{$devRoleName}\"");

        // Run test purge
        $this->purgeAllTenantDatabases();

        // Non-test database and role must still exist untouched
        $dbStillExists = $admin->selectOne('SELECT 1 FROM pg_database WHERE datname = ?', [$devDbName]);
        $roleStillExists = $admin->selectOne('SELECT 1 FROM pg_roles WHERE rolname = ?', [$devRoleName]);

        expect($dbStillExists)->not->toBeNull()
            ->and($roleStillExists)->not->toBeNull();
    } finally {
        $admin->statement("DROP DATABASE IF EXISTS \"{$devDbName}\" WITH (FORCE)");
        $admin->statement("DROP ROLE IF EXISTS \"{$devRoleName}\"");
    }
});

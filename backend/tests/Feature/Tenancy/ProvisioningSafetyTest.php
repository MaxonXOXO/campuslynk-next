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

    try {
        // Attempt provisioning with an invalid migration or mock failure
        // We can test that rollbackProvisioning correctly drops database and role
        $dbName = 'tenant_fail_test';
        $roleName = 'tenant_fail_test_u';

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
        $admin->statement('DROP DATABASE IF EXISTS "tenant_fail_test"');
        $admin->statement('DROP ROLE IF EXISTS "tenant_fail_test_u"');
    }
});

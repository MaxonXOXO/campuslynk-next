<?php

declare(strict_types=1);

namespace Tests\Feature\Tenancy;

use App\Core\Tenancy\Services\TenantProvisioner;
use Illuminate\Support\Facades\DB;
use PDO;
use PDOException;

uses(TenancyTestHelper::class);

beforeEach(function () {
    $this->purgeAllTenantDatabases();
    $this->provisioner = app(TenantProvisioner::class);
});

afterEach(function () {
    $this->purgeAllTenantDatabases();
});

it('verifies least-privilege attributes for landlord_app, provisioner, and pgbouncer_auth in pg_roles', function () {
    $admin = DB::connection('pgsql_admin');

    /** @var array<int, object{rolname: string, rolsuper: bool, rolcreatedb: bool, rolcreaterole: bool}> $roles */
    $roles = $admin->select(
        "SELECT rolname, rolsuper, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname IN ('landlord_app', 'provisioner', 'pgbouncer_auth')"
    );

    $roleMap = [];
    foreach ($roles as $role) {
        $roleMap[$role->rolname] = $role;
    }

    // 1. landlord_app: Public API & queue runtime role
    expect($roleMap)->toHaveKey('landlord_app');
    expect($roleMap['landlord_app']->rolsuper)->toBeFalse();
    expect($roleMap['landlord_app']->rolcreatedb)->toBeFalse();
    expect($roleMap['landlord_app']->rolcreaterole)->toBeFalse();

    // 2. provisioner: Ops provisioning role (ADR-0010, Prompt 04b)
    expect($roleMap)->toHaveKey('provisioner');
    expect($roleMap['provisioner']->rolsuper)->toBeFalse(); // Must NOT be superuser!
    expect($roleMap['provisioner']->rolcreatedb)->toBeTrue();
    expect($roleMap['provisioner']->rolcreaterole)->toBeTrue();

    // 3. pgbouncer_auth: Dedicated auth lookup role
    expect($roleMap)->toHaveKey('pgbouncer_auth');
    expect($roleMap['pgbouncer_auth']->rolsuper)->toBeFalse();
    expect($roleMap['pgbouncer_auth']->rolcreatedb)->toBeFalse();
    expect($roleMap['pgbouncer_auth']->rolcreaterole)->toBeFalse();
});

it('prohibits landlord_app from creating databases, creating roles, or accessing pg_shadow', function () {
    $landlord = DB::connection('landlord');

    // 1. CREATE DATABASE denial
    $dbDenied = false;
    try {
        $landlord->statement('CREATE DATABASE rogue_app_db');
    } catch (PDOException $e) {
        $dbDenied = str_contains($e->getMessage(), 'permission denied to create database');
    }
    expect($dbDenied)->toBeTrue();

    // 2. CREATE ROLE denial
    $roleDenied = false;
    try {
        $landlord->statement('CREATE ROLE rogue_app_role');
    } catch (PDOException $e) {
        $roleDenied = str_contains($e->getMessage(), 'permission denied to create role')
            || str_contains($e->getMessage(), 'Only roles with the CREATEROLE attribute may create roles');
    }
    expect($roleDenied)->toBeTrue();

    // 3. SELECT * FROM pg_shadow denial
    $shadowDenied = false;
    try {
        $landlord->select('SELECT * FROM pg_shadow');
    } catch (PDOException $e) {
        $shadowDenied = str_contains($e->getMessage(), 'permission denied for view pg_shadow')
            || str_contains($e->getMessage(), 'permission denied for table pg_shadow');
    }
    expect($shadowDenied)->toBeTrue();
});

it('prohibits landlord_app from connecting to any tenant database', function () {
    config(['app_profile.deploy_profile' => 'cloud']);
    $tenant = $this->provisioner->provision('tenant_role_test', 'Role Test College', 'role-test.test', 'cloud');

    $host = (string) config('database.connections.landlord.host', '127.0.0.1');
    $port = (int) config('database.connections.landlord.port', 6432);
    $tenantDbName = 'tenant_'.$tenant->slug;

    $connectDenied = false;
    try {
        $dsn = "pgsql:host={$host};port={$port};dbname={$tenantDbName}";
        new PDO($dsn, 'landlord_app', 'secret', [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        ]);
    } catch (PDOException $e) {
        $connectDenied = str_contains($e->getMessage(), 'permission denied for database')
            || str_contains($e->getMessage(), 'FATAL');
    }

    expect($connectDenied)->toBeTrue();
});

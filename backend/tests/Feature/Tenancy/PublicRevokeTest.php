<?php

declare(strict_types=1);

use App\Core\Tenancy\Services\TenantProvisioner;
use Illuminate\Support\Facades\DB;

beforeEach(function () {
    $this->purgeAllTenantDatabases();
    $this->provisioner = app(TenantProvisioner::class);
});

afterEach(function () {
    $admin = DB::connection('pgsql_admin');
    $admin->statement('DROP ROLE IF EXISTS "unrelated_intruder_u"');
    $this->purgeAllTenantDatabases();
});

it('prohibits newly created unrelated roles from connecting to tenant databases due to PUBLIC revoke', function () {
    $tenant = $this->provisioner->provision('tenant_gamma', 'Gamma College', 'gamma.test');
    $db = $tenant->database;

    expect($db)->not->toBeNull();

    $admin = DB::connection('pgsql_admin');
    $admin->statement('DROP ROLE IF EXISTS "unrelated_intruder_u"');
    $admin->statement("CREATE ROLE \"unrelated_intruder_u\" WITH LOGIN PASSWORD 'intruder_secret'");

    $host = config('database.connections.pgsql_admin.host', '127.0.0.1');
    $port = config('database.connections.pgsql_admin.port', 5432);

    $dsn = sprintf('pgsql:host=%s;port=%d;dbname=%s', $host, $port, $db->database);

    expect(fn () => new PDO($dsn, 'unrelated_intruder_u', 'intruder_secret'))
        ->toThrow(PDOException::class);
});

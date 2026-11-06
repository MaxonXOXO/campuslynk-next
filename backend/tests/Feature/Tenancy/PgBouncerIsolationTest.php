<?php

declare(strict_types=1);

use App\Core\Tenancy\Services\TenantProvisioner;

beforeEach(function () {
    $this->purgeAllTenantDatabases();
    $this->provisioner = app(TenantProvisioner::class);
});

afterEach(function () {
    $this->purgeAllTenantDatabases();
});

it('enforces isolation when connecting through PgBouncer', function () {
    $tenantA = $this->provisioner->provision('tenant_pg_a', 'Pg College A', 'pga.test');
    $tenantB = $this->provisioner->provision('tenant_pg_b', 'Pg College B', 'pgb.test');

    $dbA = $tenantA->database;
    $dbB = $tenantB->database;

    expect($dbA)->not->toBeNull()
        ->and($dbB)->not->toBeNull();

    $host = config('database.connections.landlord.host', '127.0.0.1');
    $port = config('database.connections.landlord.port', 6432);

    // 1. Tenant A credentials through PgBouncer CANNOT connect to tenant B database
    $dsnB = sprintf('pgsql:host=%s;port=%d;dbname=%s', $host, $port, $dbB->database);
    expect(fn () => new PDO($dsnB, $dbA->username, $dbA->getDecryptedPassword()))
        ->toThrow(PDOException::class);

    // 2. Tenant A credentials through PgBouncer CANNOT connect to landlord database
    $landlordDb = (string) config('database.connections.landlord.database', 'landlord');
    $dsnLandlord = sprintf('pgsql:host=%s;port=%d;dbname=%s', $host, $port, $landlordDb);
    expect(fn () => new PDO($dsnLandlord, $dbA->username, $dbA->getDecryptedPassword()))
        ->toThrow(PDOException::class);
});

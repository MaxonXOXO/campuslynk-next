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

it('prohibits tenant A credentials from connecting to tenant B or landlord directly', function () {
    $tenantA = $this->provisioner->provision('tenant_alpha', 'Alpha College', 'alpha.test');
    $tenantB = $this->provisioner->provision('tenant_beta', 'Beta College', 'beta.test');

    $dbA = $tenantA->database;
    $dbB = $tenantB->database;

    expect($dbA)->not->toBeNull()
        ->and($dbB)->not->toBeNull();

    $host = config('database.connections.pgsql_admin.host', '127.0.0.1');
    $port = config('database.connections.pgsql_admin.port', 5432);

    // 1. Tenant A credentials CAN connect to tenant A database
    $dsnA = sprintf('pgsql:host=%s;port=%d;dbname=%s', $host, $port, $dbA->database);
    $pdoA = new PDO($dsnA, $dbA->username, $dbA->getDecryptedPassword());
    expect($pdoA)->toBeInstanceOf(PDO::class);

    // 2. Tenant A credentials CANNOT connect to tenant B database
    $dsnB = sprintf('pgsql:host=%s;port=%d;dbname=%s', $host, $port, $dbB->database);
    expect(fn () => new PDO($dsnB, $dbA->username, $dbA->getDecryptedPassword()))
        ->toThrow(PDOException::class);

    // 3. Tenant A credentials CANNOT connect to landlord database
    $landlordDb = (string) config('database.connections.landlord.database', 'landlord');
    $dsnLandlord = sprintf('pgsql:host=%s;port=%d;dbname=%s', $host, $port, $landlordDb);
    expect(fn () => new PDO($dsnLandlord, $dbA->username, $dbA->getDecryptedPassword()))
        ->toThrow(PDOException::class);

    $pdoA = null;
});

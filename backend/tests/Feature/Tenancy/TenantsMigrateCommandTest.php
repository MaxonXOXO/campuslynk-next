<?php

declare(strict_types=1);

use App\Core\Tenancy\Models\SchemaVersion;
use App\Core\Tenancy\Services\TenantProvisioner;
use Illuminate\Support\Facades\Artisan;

beforeEach(function () {
    $this->purgeAllTenantDatabases();
    $this->provisioner = app(TenantProvisioner::class);
});

afterEach(function () {
    $this->purgeAllTenantDatabases();
});

it('migrates active tenants and records schema versions', function () {
    $tenantA = $this->provisioner->provision('tenant_mig_a', 'Migrate College A', 'miga.test');
    $tenantB = $this->provisioner->provision('tenant_mig_b', 'Migrate College B', 'migb.test');

    // Run command targeting only tenant A
    $exitCode = Artisan::call('tenants:migrate', ['--tenant' => 'tenant_mig_a']);

    expect($exitCode)->toBe(0);

    // Assert schema_versions recorded for tenant A
    $versionsA = SchemaVersion::where('tenant_id', $tenantA->id)->get();
    expect($versionsA)->not->toBeEmpty();
});

it('continues past failed tenants and reports non-zero exit code on failure', function () {
    $tenantHealthy = $this->provisioner->provision('tenant_ok', 'Healthy College', 'ok.test');

    // Create a broken tenant with non-existent database
    $tenantBroken = $this->provisioner->provision('tenant_broken', 'Broken College', 'broken.test');
    $tenantBroken->database()->update(['database' => 'non_existent_db_12345']);

    $exitCode = Artisan::call('tenants:migrate');

    // Should return failure exit code
    expect($exitCode)->toBe(1);
});

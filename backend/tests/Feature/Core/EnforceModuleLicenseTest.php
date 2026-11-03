<?php

declare(strict_types=1);

use App\Core\Tenancy\Models\License;
use App\Core\Tenancy\Services\TenantProvisioner;
use App\Core\Tenancy\TenantContext;
use Illuminate\Support\Facades\Route;

beforeEach(function () {
    $this->provisioner = app(TenantProvisioner::class);
    $this->tenantContext = app(TenantContext::class);
    $this->purgeAllTenantDatabases();

    // Register a test route using the module middleware
    Route::middleware(['api', 'module:attendance'])->get('/api/v1/test-attendance', function () {
        return response()->json(['status' => 'ok', 'module' => 'attendance']);
    });

    Route::middleware(['api', 'module:identity'])->get('/api/v1/test-identity', function () {
        return response()->json(['status' => 'ok', 'module' => 'identity']);
    });
});

afterEach(function () {
    $this->tenantContext->forget();
    $this->purgeAllTenantDatabases();
});

it('always permits core modules regardless of tenant license configuration', function () {
    config(['app_profile.deploy_profile' => 'cloud']);

    $tenant = $this->provisioner->provision('tenant_core', 'Core College', 'core.test', 'cloud');
    $this->tenantContext->setTenant($tenant);

    // Explicitly set empty modules on the license
    License::where('tenant_id', $tenant->id)->update([
        'modules' => [],
    ]);

    $response = $this->getJson('http://core.test/api/v1/test-identity');

    $response->assertStatus(200)
        ->assertJson(['status' => 'ok', 'module' => 'identity']);
});

it('rejects access to unlicensed module with 403 RFC 7807 Problem Details', function () {
    config(['app_profile.deploy_profile' => 'cloud']);

    $tenant = $this->provisioner->provision('tenant_unlicensed', 'Unlicensed College', 'unlicensed.test', 'cloud');
    $this->tenantContext->setTenant($tenant);

    // License only enables leave and assessment, NOT attendance
    License::where('tenant_id', $tenant->id)->update([
        'modules' => ['leave', 'assessment'],
    ]);

    $response = $this->getJson('http://unlicensed.test/api/v1/test-attendance');

    $response->assertStatus(403)
        ->assertHeader('Content-Type', 'application/problem+json')
        ->assertJson([
            'type' => 'https://academic-suite.net/errors/module-not-licensed',
            'title' => 'Module Not Licensed',
            'status' => 403,
            'detail' => 'The module [attendance] is not enabled under your institutional licence.',
        ]);
});

it('permits access to licensed module when module is in tenant license', function () {
    config(['app_profile.deploy_profile' => 'cloud']);

    $tenant = $this->provisioner->provision('tenant_licensed', 'Licensed College', 'licensed.test', 'cloud');
    $this->tenantContext->setTenant($tenant);

    // License enables attendance
    License::where('tenant_id', $tenant->id)->update([
        'modules' => ['attendance', 'leave'],
    ]);

    $response = $this->getJson('http://licensed.test/api/v1/test-attendance');

    $response->assertStatus(200)
        ->assertJson([
            'status' => 'ok',
            'module' => 'attendance',
        ]);
});

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

it('strictly accepts only registered domains of the single tenant in onprem profile', function () {
    config(['app_profile.deploy_profile' => 'onprem']);

    $tenant = $this->provisioner->provision('carmel', 'Carmel Polytechnic College', 'app.carmelpoly.in', 'onprem');

    // 1. Registered domain succeeds
    $response = $this->getJson('http://app.carmelpoly.in/api/v1/meta');

    $response->assertStatus(200)
        ->assertJsonPath('meta.tenant.slug', 'carmel');

    // 2. Unregistered host returns 404 even if X-Tenant header is passed
    $unregisteredResponse = $this->withHeaders(['X-Tenant' => 'carmel'])
        ->getJson('http://random-host.com/api/v1/meta');

    $unregisteredResponse->assertStatus(404)
        ->assertHeader('Content-Type', 'application/problem+json')
        ->assertJsonPath('title', 'Tenant Not Found');
});

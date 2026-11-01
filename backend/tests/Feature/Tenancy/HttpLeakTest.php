<?php

declare(strict_types=1);

use App\Core\Tenancy\Services\TenantProvisioner;
use App\Core\Tenancy\TenantContext;

beforeEach(function () {
    $this->purgeAllTenantDatabases();
    $this->provisioner = app(TenantProvisioner::class);
    $this->context = app(TenantContext::class);
});

afterEach(function () {
    $this->purgeAllTenantDatabases();
});

it('prevents cross-tenant leaks over 200+ alternating requests to /api/v1/meta', function () {
    config(['app_profile.deploy_profile' => 'cloud']);

    $tenantA = $this->provisioner->provision(
        slug: 'leak_alpha',
        name: 'Leak Alpha College',
        domain: 'alpha.leak.test',
        deployProfile: 'cloud'
    );

    $tenantB = $this->provisioner->provision(
        slug: 'leak_beta',
        name: 'Leak Beta College',
        domain: 'beta.leak.test',
        deployProfile: 'cloud'
    );

    // 200 alternating HTTP requests (100 for Tenant A, 100 for Tenant B)
    for ($i = 0; $i < 100; $i++) {
        // Request Tenant A
        $resA = $this->withHeaders([
            'Connection' => 'keep-alive',
        ])->getJson('http://alpha.leak.test/api/v1/meta');

        $resA->assertOk();
        $dataA = $resA->json();
        expect($dataA['meta']['tenant']['slug'])->toBe('leak_alpha')
            ->and($dataA['meta']['tenant']['name'])->toBe('Leak Alpha College');

        // Request Tenant B
        $resB = $this->withHeaders([
            'Connection' => 'keep-alive',
        ])->getJson('http://beta.leak.test/api/v1/meta');

        $resB->assertOk();
        $dataB = $resB->json();
        expect($dataB['meta']['tenant']['slug'])->toBe('leak_beta')
            ->and($dataB['meta']['tenant']['name'])->toBe('Leak Beta College');
    }
});

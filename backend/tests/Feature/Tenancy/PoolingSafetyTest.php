<?php

declare(strict_types=1);

use App\Core\Tenancy\Models\TenantSetting;
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

it('prevents cross-tenant data leakage across rapid alternating connection switching under transaction pooling', function () {
    $tenantA = $this->provisioner->provision('tenant_pool_a', 'Pool A College', 'poola.test');
    $tenantB = $this->provisioner->provision('tenant_pool_b', 'Pool B College', 'poolb.test');

    // Seed data into Tenant A
    $this->context->setTenant($tenantA);
    TenantSetting::create(['key' => 'test_key', 'value' => ['name' => 'Data from A']]);
    $this->context->forget();

    // Seed data into Tenant B
    $this->context->setTenant($tenantB);
    TenantSetting::create(['key' => 'test_key', 'value' => ['name' => 'Data from B']]);
    $this->context->forget();

    // Alternating switching cycle 20 times
    for ($i = 0; $i < 20; $i++) {
        $this->context->setTenant($tenantA);
        $settingA = TenantSetting::find('test_key');
        expect($settingA)->not->toBeNull()
            ->and($settingA->value)->toEqual(['name' => 'Data from A']);
        $this->context->forget();

        $this->context->setTenant($tenantB);
        $settingB = TenantSetting::find('test_key');
        expect($settingB)->not->toBeNull()
            ->and($settingB->value)->toEqual(['name' => 'Data from B']);
        $this->context->forget();
    }
});

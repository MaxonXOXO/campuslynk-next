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
    TenantSetting::create(['key' => 'auth.token_lifetime_web_hours', 'value' => ['hours' => 10]]);
    $this->context->forget();

    // Seed data into Tenant B
    $this->context->setTenant($tenantB);
    TenantSetting::create(['key' => 'auth.token_lifetime_web_hours', 'value' => ['hours' => 20]]);
    $this->context->forget();

    // Alternating switching cycle 20 times
    for ($i = 0; $i < 20; $i++) {
        $this->context->setTenant($tenantA);
        $settingA = TenantSetting::find('auth.token_lifetime_web_hours');
        expect($settingA)->not->toBeNull()
            ->and($settingA->value)->toEqual(['hours' => 10]);
        $this->context->forget();

        $this->context->setTenant($tenantB);
        $settingB = TenantSetting::find('auth.token_lifetime_web_hours');
        expect($settingB)->not->toBeNull()
            ->and($settingB->value)->toEqual(['hours' => 20]);
        $this->context->forget();
    }
});

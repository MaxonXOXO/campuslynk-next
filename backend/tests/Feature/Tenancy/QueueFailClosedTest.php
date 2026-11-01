<?php

declare(strict_types=1);

use App\Core\Tenancy\Exceptions\MissingTenantContextException;
use App\Core\Tenancy\Models\TenantSetting;
use App\Core\Tenancy\Services\TenantProvisioner;
use App\Core\Tenancy\TenantContext;
use Tests\Fixtures\SampleLandlordJob;
use Tests\Fixtures\SampleTenantJob;
use Tests\Fixtures\SampleUnscopedJob;

beforeEach(function () {
    $this->purgeAllTenantDatabases();
    $this->provisioner = app(TenantProvisioner::class);
    $this->context = app(TenantContext::class);
});

afterEach(function () {
    $this->purgeAllTenantDatabases();
});

it('fails closed when an unscoped job is dispatched without tenant context', function () {
    expect(fn () => dispatch_sync(new SampleUnscopedJob))
        ->toThrow(MissingTenantContextException::class);
});

it('permits jobs implementing LandlordJobContract to run without tenant context', function () {
    SampleLandlordJob::$executed = false;

    dispatch_sync(new SampleLandlordJob);

    expect(SampleLandlordJob::$executed)->toBeTrue();
});

it('initializes correct tenant context for TenantAwareJob', function () {
    $tenant = $this->provisioner->provision('tenant_queue', 'Queue College', 'queue.test');

    // Run job for this tenant
    $job = new SampleTenantJob($tenant->id);
    dispatch_sync($job);

    // Verify row was written into tenant database
    $this->context->setTenant($tenant);
    $setting = TenantSetting::find('queue_job_test');
    expect($setting)->not->toBeNull()
        ->and($setting->value)->toEqual(['executed' => true]);
    $this->context->forget();
});

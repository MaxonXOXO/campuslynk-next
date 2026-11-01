<?php

declare(strict_types=1);

use App\Core\Tenancy\Exceptions\MissingTenantContextException;
use App\Core\Tenancy\Services\TenantProvisioner;
use App\Core\Tenancy\TenantContext;
use Illuminate\Support\Facades\Log;

beforeEach(function () {
    $this->purgeAllTenantDatabases();
    $this->provisioner = app(TenantProvisioner::class);
    $this->context = app(TenantContext::class);
});

afterEach(function () {
    $this->purgeAllTenantDatabases();
});

it('completely resets tenant connection, cache prefix, and log context on forget', function () {
    $tenant = $this->provisioner->provision('teardown', 'Teardown College', 'teardown.test');

    // 1. Set tenant context
    $this->context->setTenant($tenant);

    expect($this->context->hasTenant())->toBeTrue()
        ->and($this->context->getTenant()?->id)->toEqual($tenant->id)
        ->and(config('database.connections.tenant.database'))->toEqual('tenant_teardown')
        ->and(config('cache.prefix'))->toEqual('tenant_'.$tenant->id.'_');

    // Context exists in Log
    $logContext = Log::sharedContext();
    expect($logContext)->toHaveKey('tenant_id')
        ->and($logContext['tenant_id'])->toEqual($tenant->id);

    // 2. Forget context
    $this->context->forget();

    expect($this->context->hasTenant())->toBeFalse()
        ->and($this->context->getTenant())->toBeNull()
        ->and(config('database.connections.tenant.database'))->toEqual('unconfigured_tenant');

    // Log context is cleared
    $clearedContext = Log::sharedContext();
    expect($clearedContext)->not->toHaveKey('tenant_id')
        ->and($clearedContext)->not->toHaveKey('tenant_slug');

    // Calling tenant() throws MissingTenantContextException
    expect(fn () => $this->context->tenant())
        ->toThrow(MissingTenantContextException::class);
});

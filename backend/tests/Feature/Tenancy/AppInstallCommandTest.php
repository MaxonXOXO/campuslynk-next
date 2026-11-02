<?php

declare(strict_types=1);

use App\Core\Tenancy\Models\Domain;
use App\Core\Tenancy\Models\Tenant;
use Illuminate\Support\Facades\Artisan;

beforeEach(function () {
    $this->purgeAllTenantDatabases();
    config(['app_profile.deploy_profile' => 'onprem']);
});

afterEach(function () {
    $this->purgeAllTenantDatabases();
});

it('installs on-premise appliance and provisions carmel tenant', function () {
    $exitCode = Artisan::call('app:install');

    expect($exitCode)->toBe(0);

    $tenant = Tenant::where('slug', 'carmel')->first();
    expect($tenant)->not->toBeNull()
        ->and($tenant->status)->toEqual('active')
        ->and($tenant->name)->toEqual('Carmel Polytechnic College');

    $domain = Domain::where('domain', 'app.carmelpoly.in')->first();
    expect($domain)->not->toBeNull()
        ->and($domain->tenant_id)->toEqual($tenant->id);

    // 2. Executing twice fails safely
    $secondRun = Artisan::call('app:install');
    expect($secondRun)->toBe(1);
});

it('refuses app:install in cloud profile', function () {
    config(['app_profile.deploy_profile' => 'cloud']);

    $exitCode = Artisan::call('app:install');

    expect($exitCode)->toBe(1);
});

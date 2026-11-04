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
    config(['app.key' => env('APP_KEY')]);
    config(['app_profile.deploy_profile' => env('DEPLOY_PROFILE', 'onprem')]);
    $this->purgeAllTenantDatabases();
});

it('installs on-premise appliance and provisions tenant when options are explicitly provided', function () {
    $exitCode = Artisan::call('app:install', [
        '--slug' => 'carmel',
        '--name' => 'Carmel Polytechnic College',
        '--domain' => 'app.carmelpoly.in',
        '--no-interaction' => true,
    ]);

    expect($exitCode)->toBe(0);

    $tenant = Tenant::where('slug', 'carmel')->first();
    expect($tenant)->not->toBeNull()
        ->and($tenant->status)->toEqual('active')
        ->and($tenant->name)->toEqual('Carmel Polytechnic College');

    $domain = Domain::where('domain', 'app.carmelpoly.in')->first();
    expect($domain)->not->toBeNull()
        ->and($domain->tenant_id)->toEqual($tenant->id);

    // 2. Executing twice fails safely
    $secondRun = Artisan::call('app:install', [
        '--slug' => 'carmel',
        '--name' => 'Carmel Polytechnic College',
        '--domain' => 'app.carmelpoly.in',
        '--no-interaction' => true,
    ]);
    expect($secondRun)->toBe(1);
});

it('refuses app:install without explicit slug, name, or domain in non-interactive mode', function () {
    $exitCode = Artisan::call('app:install', ['--no-interaction' => true]);

    expect($exitCode)->toBe(1);
});

it('refuses app:install in cloud profile', function () {
    config(['app_profile.deploy_profile' => 'cloud']);

    $exitCode = Artisan::call('app:install', [
        '--slug' => 'carmel',
        '--name' => 'Carmel Polytechnic College',
        '--domain' => 'app.carmelpoly.in',
        '--no-interaction' => true,
    ]);

    expect($exitCode)->toBe(1);
});

it('refuses app:install when APP_KEY is missing or invalid', function () {
    config(['app.key' => '']);

    $exitCode = Artisan::call('app:install', [
        '--slug' => 'carmel',
        '--name' => 'Carmel Polytechnic College',
        '--domain' => 'app.carmelpoly.in',
        '--no-interaction' => true,
    ]);

    expect($exitCode)->toBe(1);
});

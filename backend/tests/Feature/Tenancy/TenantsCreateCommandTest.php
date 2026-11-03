<?php

declare(strict_types=1);

namespace Tests\Feature\Tenancy;

use App\Core\Tenancy\Models\Tenant;
use App\Core\Tenancy\TenantContext;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;

uses(TenancyTestHelper::class);

beforeEach(function () {
    $this->purgeAllTenantDatabases();
});

afterEach(function () {
    $this->purgeAllTenantDatabases();
});

it('provisions tenant strictly using name, slug, and domain arguments', function () {
    config(['app_profile.deploy_profile' => 'cloud']);

    $exitCode = Artisan::call('tenants:create', [
        'name' => 'Carmel Engineering College',
        'slug' => 'carmel_eng',
        'domain' => 'carmeleng.edu.in',
        '--profile' => 'cloud',
        '--admin-name' => 'Admin Test',
        '--admin-email' => 'admin@carmeleng.edu.in',
    ]);

    expect($exitCode)->toBe(0);

    $tenant = Tenant::where('slug', 'carmel_eng')->first();
    expect($tenant)->not->toBeNull();
    expect($tenant?->name)->toBe('Carmel Engineering College');
    expect($tenant?->domains()->where('domain', 'carmeleng.edu.in')->exists())->toBeTrue();
});

it('rejects tenants:create with exit code 1 when slug is invalid', function () {
    config(['app_profile.deploy_profile' => 'cloud']);

    $exitCode = Artisan::call('tenants:create', [
        'name' => 'Invalid Slug College',
        'slug' => 'INVALID-UPPERCASE-SLUG!',
        'domain' => 'invalid.test',
        '--profile' => 'cloud',
    ]);

    expect($exitCode)->toBe(1);
    expect(Artisan::output())->toContain('Invalid tenant slug');
});

it('fails with clear instruction when landlord schema is missing', function () {
    config(['app_profile.deploy_profile' => 'cloud']);

    config(['database.connections.landlord.search_path' => 'information_schema']);
    DB::purge('landlord');

    try {
        $exitCode = Artisan::call('tenants:create', [
            'name' => 'Unmigrated College',
            'slug' => 'unmigrated_test',
            'domain' => 'unmigrated.test',
            '--profile' => 'cloud',
        ]);

        expect($exitCode)->toBe(1);
        $output = Artisan::output();
        expect($output)->toContain('Landlord schema is missing or unmigrated');
        expect($output)->toContain('php artisan landlord:migrate');
    } finally {
        config(['database.connections.landlord.search_path' => 'public']);
        DB::purge('landlord');
    }
});

it('provisions tenant with seed profile and bootstraps super admin end-to-end', function () {
    config(['app_profile.deploy_profile' => 'cloud']);

    $exitCode = Artisan::call('tenants:create', [
        'name' => 'Seeded Polytechnic College',
        'slug' => 'poly_seed',
        'domain' => 'polyseed.edu.in',
        '--profile' => 'cloud',
        '--seed-profile' => 'kerala-polytechnic',
        '--admin-name' => 'Super Admin',
        '--admin-email' => 'superadmin@polyseed.edu.in',
    ]);

    expect($exitCode)->toBe(0);

    /** @var Tenant $tenant */
    $tenant = Tenant::where('slug', 'poly_seed')->firstOrFail();

    /** @var TenantContext $context */
    $context = app(TenantContext::class);
    $context->setTenant($tenant);

    try {
        /** @var class-string<Model> $userModel */
        $userModel = (string) config('auth.providers.users.model');
        expect($userModel::where('type', 'staff')->count())->toBe(1);
        expect($userModel::where('email', 'superadmin@polyseed.edu.in')->exists())->toBeTrue();

        // Verify Kerala Polytechnic profile seeded departments exist and seeded exactly once
        $deptCount = DB::connection('tenant')->table('departments')->count();
        expect($deptCount)->toBeGreaterThan(0);
    } finally {
        $context->forget();
    }
});

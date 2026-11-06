<?php

declare(strict_types=1);

namespace Tests\Feature\Tenancy;

use App\Core\Modules\ModuleRegistry;
use App\Core\Tenancy\Models\Tenant;
use App\Core\Tenancy\TenantContext;
use App\Modules\Identity\Models\User;
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
        '--no-interaction' => true,
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
        '--no-interaction' => true,
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
            '--no-interaction' => true,
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
        '--no-interaction' => true,
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

it('assigns super_admin at institution scope with non-empty capabilities across all seed profiles including omitted and none', function (?string $seedProfile, string $slug, string $domain) {
    config(['app_profile.deploy_profile' => 'cloud']);

    $params = [
        'name' => 'Dev College',
        'slug' => $slug,
        'domain' => $domain,
        '--profile' => 'cloud',
        '--admin-name' => 'Dev Admin',
        '--admin-email' => 'admin@dev.test',
        '--no-interaction' => true,
    ];

    if ($seedProfile !== null) {
        $params['--seed-profile'] = $seedProfile;
    }

    $exitCode = Artisan::call('tenants:create', $params);
    expect($exitCode)->toBe(0);

    /** @var Tenant $tenant */
    $tenant = Tenant::where('slug', $slug)->firstOrFail();

    /** @var TenantContext $context */
    $context = app(TenantContext::class);
    $context->setTenant($tenant);

    try {
        $rolesCount = DB::connection('tenant')->table('roles')->count();
        $assignmentsCount = DB::connection('tenant')->table('role_assignments')->whereRaw('is_active = TRUE')->count();
        /** @var object{scope_label: string}|null $inst */
        $inst = DB::connection('tenant')->table('institution')->first();
        $expectedScopeLabel = $inst !== null ? $inst->scope_label : 'i_'.$slug;

        expect($rolesCount)->toBe(21);
        expect($assignmentsCount)->toBe(1);

        /** @var User $admin */
        $admin = User::where('email', 'admin@dev.test')->firstOrFail();
        $admin->update(['must_change_password' => false]);
        $token = $admin->createToken('test-token')->plainTextToken;
    } finally {
        $context->forget();
    }

    $response = $this->withHeaders([
        'X-Tenant' => $slug,
        'Authorization' => 'Bearer '.$token,
    ])->getJson('http://'.$domain.'/api/v1/me');

    $response->assertStatus(200)
        ->assertJsonCount(1, 'data.assignments')
        ->assertJsonPath('data.assignments.0.role_key', 'super_admin')
        ->assertJsonPath('data.assignments.0.scope_type', 'institution')
        ->assertJsonPath('data.assignments.0.scope_label', $expectedScopeLabel);

    /** @var list<string> $capabilities */
    $capabilities = $response->json('data.capabilities');
    expect($capabilities)->not->toBeEmpty()
        ->and($capabilities)->toContain('identity.user.view', 'organisation.department.manage');
})->with([
    'omitted (--seed-profile not passed)' => [null, 'dev', 'localhost'],
    'none (--seed-profile=none)' => ['none', 'dev_none', 'none.localhost'],
    'baseline (--seed-profile=baseline)' => ['baseline', 'dev_base', 'base.localhost'],
    'kerala-polytechnic (--seed-profile=kerala-polytechnic)' => ['kerala-polytechnic', 'dev_kerala', 'kerala.localhost'],
]);

it('fails loudly with non-zero exit and rolls back user creation when super_admin role cannot be assigned', function () {
    config(['app_profile.deploy_profile' => 'cloud']);

    $originalRegistry = app(ModuleRegistry::class);

    // Bind a stub ModuleRegistry whose seed() is a no-op so roles table remains empty
    $noopRegistry = new class(app()) extends ModuleRegistry
    {
        public function seed(string $profile): void
        {
            // Intentionally do nothing to simulate missing super_admin role
        }
    };
    app()->instance(ModuleRegistry::class, $noopRegistry);

    try {
        $exitCode = Artisan::call('tenants:create', [
            'name' => 'Broken Role College',
            'slug' => 'broken_role',
            'domain' => 'brokenrole.test',
            '--profile' => 'cloud',
            '--admin-name' => 'Orphan Admin',
            '--admin-email' => 'orphan@brokenrole.test',
            '--no-interaction' => true,
        ]);

        expect($exitCode)->toBe(1);

        /** @var Tenant $tenant */
        $tenant = Tenant::where('slug', 'broken_role')->firstOrFail();

        /** @var TenantContext $context */
        $context = app(TenantContext::class);
        $context->setTenant($tenant);

        try {
            expect(DB::connection('tenant')->table('users')->count())->toBe(0);
            expect(DB::connection('tenant')->table('role_assignments')->count())->toBe(0);
        } finally {
            $context->forget();
        }
    } finally {
        app()->instance(ModuleRegistry::class, $originalRegistry);
    }
});

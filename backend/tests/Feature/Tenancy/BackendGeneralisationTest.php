<?php

declare(strict_types=1);

namespace Tests\Feature\Tenancy;

use App\Core\Modules\ModuleRegistry;
use App\Core\Tenancy\Models\Tenant;
use App\Core\Tenancy\Models\TenantSetting;
use App\Core\Tenancy\Services\TenantProvisioner;
use App\Core\Tenancy\TenantContext;
use App\Modules\Identity\Actions\LoginAction;
use App\Modules\Identity\Models\Role;
use App\Modules\Identity\Models\RoleAssignment;
use App\Modules\Identity\Models\User;
use App\Modules\Identity\Models\UserIdentifier;
use App\Modules\Identity\Rules\PasswordPolicyRule;
use App\Modules\Organisation\Actions\CreateDepartmentAction;
use App\Modules\Organisation\Models\Department;
use App\Modules\Organisation\Models\Regulation;
use App\Modules\Organisation\Models\Stream;
use Carbon\Carbon;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use InvalidArgumentException;
use Symfony\Component\Console\Output\BufferedOutput;

beforeEach(function () {
    $this->purgeAllTenantDatabases();
    $this->provisioner = app(TenantProvisioner::class);
    $this->tenantContext = app(TenantContext::class);
});

afterEach(function () {
    Carbon::setTestNow();
    $this->tenantContext->forget();
    $this->purgeAllTenantDatabases();
});

it('provisions a fresh tenant without profile seeder that migrates and seeds cleanly', function () {
    $tenant = $this->provisioner->provision('tenant_clean', 'Clean Institution', 'clean.test');
    $this->tenantContext->setTenant($tenant);

    // Run baseline seeding
    app(ModuleRegistry::class)->seed('baseline');

    // Baseline has RBAC roles and permissions
    expect(Role::where('key', 'super_admin')->exists())->toBeTrue()
        ->and(DB::connection('tenant')->table('permissions')->count())->toBeGreaterThan(0);

    // Streams and regulations are NOT seeded in baseline
    expect(Stream::count())->toBe(0)
        ->and(Regulation::count())->toBe(0);

    // Tenant can define custom streams and custom regulations freely without constraint errors
    $streamGov = Stream::create([
        'code' => 'STATE_GOV',
        'name' => 'State Government Funded',
        'scope_label' => 's_state_gov',
    ]);
    expect($streamGov->id)->not->toBeEmpty();

    $regCustom = Regulation::create([
        'code' => 'REV2031_CUSTOM',
        'name' => 'Custom Revision 2031',
        'effective_from_year' => 2031,
        'config_json' => ['active' => true],
    ]);
    expect($regCustom->id)->not->toBeEmpty();
});

it('allows distinct streams to share canonical department code with unique scope labels', function () {
    $tenant = $this->provisioner->provision('tenant_depts', 'Depts College', 'depts.test');
    $this->tenantContext->setTenant($tenant);

    $streamA = Stream::create([
        'code' => 'AIDED',
        'name' => 'Aided Stream',
        'scope_label' => 's_aided',
    ]);
    $streamB = Stream::create([
        'code' => 'SF',
        'name' => 'Self-Financing Stream',
        'scope_label' => 's_sf',
    ]);

    /** @var CreateDepartmentAction $action */
    $action = app(CreateDepartmentAction::class);

    // Create Civil Engineering under Stream A
    $deptA = $action->execute('CE', 'Civil Engineering Aided', $streamA->id);
    expect($deptA->code)->toBe('CE')
        ->and($deptA->stream_id)->toBe($streamA->id)
        ->and($deptA->scope_label)->toBe('d_ce');

    // Create Civil Engineering under Stream B (same canonical branch code)
    $deptB = $action->execute('CE', 'Civil Engineering SF', $streamB->id);
    expect($deptB->code)->toBe('CE')
        ->and($deptB->stream_id)->toBe($streamB->id)
        ->and($deptB->scope_label)->toBe('d_ce_sf')
        ->and($deptB->id)->not->toBe($deptA->id);

    // Querying department by stream filter joins through stream_id
    $aidedDepts = Department::whereHas('stream', fn ($q) => $q->where('code', 'AIDED'))->get();
    expect($aidedDepts)->toHaveCount(1)
        ->and($aidedDepts->first()->id)->toBe($deptA->id);
});

it('supports slashed admission numbers like 5842/25 in user_identifiers and allows login', function () {
    $tenant = $this->provisioner->provision('tenant_admission', 'Admission College', 'admission.test');
    $this->tenantContext->setTenant($tenant);

    // Verify UserIdentifier::normaliseValue handles slashed value
    expect(UserIdentifier::normaliseValue(' 5842/25 '))->toBe('5842/25')
        ->and(UserIdentifier::normalise('5842/25'))->toBe('5842/25');

    // Create student user with admission number
    $user = User::create([
        'type' => 'student',
        'name' => 'Test Student',
        'email' => 'student@admission.test',
        'password' => Hash::make('StudentPass123!'),
        'status' => 'active',
        'must_change_password' => false,
    ]);

    // Insert admission_number identifier
    $user->identifiers()->create([
        'kind' => 'admission_number',
        'value' => '5842/25',
        'value_normalised' => UserIdentifier::normalise('5842/25'),
    ]);

    // Student logs in using slashed admission number
    /** @var LoginAction $loginAction */
    $loginAction = app(LoginAction::class);
    $response = $loginAction->execute('5842/25', 'StudentPass123!', 'test-device', 'web', '127.0.0.1');

    expect($response['user']->id)->toBe($user->id)
        ->and($response['token'])->not->toBeEmpty();
});

it('assigns super_admin role to bootstrap user on app:install and allows calling protected endpoint after password change', function () {
    config(['app_profile.deploy_profile' => 'onprem']);

    $output = new BufferedOutput;
    $exitCode = Artisan::call('app:install', [
        '--slug' => 'bootstrap_test',
        '--name' => 'Bootstrap Test College',
        '--domain' => 'bootstraptest.test',
        '--admin-name' => 'IT Admin',
        '--admin-email' => 'itadmin@bootstraptest.test',
        '--no-interaction' => true,
    ], $output);

    expect($exitCode)->toBe(0);

    /** @var Tenant $tenant */
    $tenant = Tenant::where('slug', 'bootstrap_test')->firstOrFail();
    $this->tenantContext->setTenant($tenant);

    /** @var User $adminUser */
    $adminUser = User::where('email', 'itadmin@bootstraptest.test')->firstOrFail();
    expect($adminUser->must_change_password)->toBeTrue();

    // Verify role assignment exists and links to super_admin
    $superAdminRole = Role::where('key', 'super_admin')->firstOrFail();
    $assignment = RoleAssignment::where('user_id', $adminUser->id)->first();
    expect($assignment)->not->toBeNull()
        ->and($assignment->role_id)->toBe($superAdminRole->id)
        ->and($assignment->scope_type)->toBe('institution');

    // First login with must_change_password
    $tokenBeforeChange = $adminUser->createToken('temp_token', ['password:change', 'auth:logout'])->plainTextToken;

    // Attempting super_admin action before password change receives 403
    $blockedRes = $this->withHeaders([
        'Authorization' => "Bearer {$tokenBeforeChange}",
    ])->getJson('http://bootstraptest.test/api/v1/users');
    $blockedRes->assertStatus(403);

    // Execute password change
    $this->tenantContext->setTenant($tenant);
    $adminUser->must_change_password = false;
    $adminUser->save();

    // Issue standard authenticated token
    $validToken = $adminUser->createToken('full_token', ['*'])->plainTextToken;

    // Allowed to call super_admin endpoint
    $this->app['auth']->forgetGuards();
    $allowedRes = $this->withHeaders([
        'Authorization' => "Bearer {$validToken}",
    ])->getJson('http://bootstraptest.test/api/v1/users');
    $allowedRes->assertStatus(200);
});

it('rejects passwords derived dynamically from tenant institution name and slug', function () {
    $tenant = $this->provisioner->provision('apex_poly', 'Apex Polytechnic College', 'apex.test');
    $this->tenantContext->setTenant($tenant);

    $rule = new PasswordPolicyRule($this->tenantContext);

    $fails = [];
    $failCallback = function (string $message) use (&$fails) {
        $fails[] = $message;
    };

    // Test password containing tenant slug
    $rule->validate('password', 'apex_poly2026', $failCallback);
    expect($fails)->not->toBeEmpty();

    $fails = [];
    // Test password containing tenant slug with 123
    $rule->validate('password', 'apex_poly123', $failCallback);
    expect($fails)->not->toBeEmpty();

    $fails = [];
    // Test password containing institutional word from name
    $rule->validate('password', 'apex2026', $failCallback);
    expect($fails)->not->toBeEmpty();

    $fails = [];
    // Standard secure passphrase not matching institution passes
    $rule->validate('password', 'Correct-Horse-Battery-Staple-99', $failCallback);
    expect($fails)->toBeEmpty();
});

it('enforces fail-closed validation on TenantSetting and accepts registered schemas', function () {
    $tenant = $this->provisioner->provision('tenant_settings_test', 'Settings College', 'settings.test');
    $this->tenantContext->setTenant($tenant);

    // 1. Unregistered key throws InvalidArgumentException
    expect(function () {
        TenantSetting::create([
            'key' => 'unregistered_custom_key',
            'value' => ['some' => 'data'],
        ]);
    })->toThrow(InvalidArgumentException::class);

    // 2. Valid auth.token_lifetime_web_hours passes
    $webSetting = TenantSetting::create([
        'key' => 'auth.token_lifetime_web_hours',
        'value' => ['hours' => 8],
    ]);
    expect($webSetting->key)->toBe('auth.token_lifetime_web_hours')
        ->and($webSetting->value)->toEqual(['hours' => 8]);

    // 3. Valid auth.token_lifetime_mobile_days passes
    $mobileSetting = TenantSetting::create([
        'key' => 'auth.token_lifetime_mobile_days',
        'value' => ['days' => 15],
    ]);
    expect($mobileSetting->key)->toBe('auth.token_lifetime_mobile_days')
        ->and($mobileSetting->value)->toEqual(['days' => 15]);

    // 4. Invalid property on token lifetime throws
    expect(function () {
        TenantSetting::create([
            'key' => 'auth.token_lifetime_web_hours',
            'value' => ['invalid_property' => 100],
        ]);
    })->toThrow(InvalidArgumentException::class);
});

it('reads token lifetimes from tenant_settings with defaults and overrides in LoginAction', function () {
    $tenant = $this->provisioner->provision('tenant_token_lifetimes', 'Lifetime College', 'lifetime.test');
    $this->tenantContext->setTenant($tenant);

    $user = User::create([
        'type' => 'staff',
        'name' => 'Staff Member',
        'email' => 'staff@lifetime.test',
        'password' => Hash::make('Password123!'),
        'status' => 'active',
        'must_change_password' => false,
    ]);

    /** @var LoginAction $loginAction */
    $loginAction = app(LoginAction::class);

    // 1. Defaults: 12 hours for web, 30 days for mobile
    Carbon::setTestNow('2026-11-03 10:00:00');

    $webDefault = $loginAction->execute('staff@lifetime.test', 'Password123!', 'web-browser', 'web', '127.0.0.1');
    expect(Carbon::parse($webDefault['expires_at'])->equalTo(Carbon::now()->addHours(12)))->toBeTrue();

    $mobileDefault = $loginAction->execute('staff@lifetime.test', 'Password123!', 'mobile-app', 'mobile', '127.0.0.1');
    expect(Carbon::parse($mobileDefault['expires_at'])->equalTo(Carbon::now()->addDays(30)))->toBeTrue();

    // 2. Overrides via tenant_settings
    TenantSetting::create([
        'key' => 'auth.token_lifetime_web_hours',
        'value' => ['hours' => 6],
    ]);
    TenantSetting::create([
        'key' => 'auth.token_lifetime_mobile_days',
        'value' => ['days' => 7],
    ]);

    $webOverride = $loginAction->execute('staff@lifetime.test', 'Password123!', 'web-browser', 'web', '127.0.0.1');
    expect(Carbon::parse($webOverride['expires_at'])->equalTo(Carbon::now()->addHours(6)))->toBeTrue();

    $mobileOverride = $loginAction->execute('staff@lifetime.test', 'Password123!', 'mobile-app', 'mobile', '127.0.0.1');
    expect(Carbon::parse($mobileOverride['expires_at'])->equalTo(Carbon::now()->addDays(7)))->toBeTrue();

    Carbon::setTestNow();
});

<?php

declare(strict_types=1);

use App\Core\Http\ProblemDetails;
use App\Core\Tenancy\Models\TenantSetting;
use App\Core\Tenancy\Services\TenantProvisioner;
use App\Core\Tenancy\TenantContext;
use App\Modules\Identity\Database\Seeders\RbacBaselineSeeder;
use App\Modules\Identity\Models\Role;
use App\Modules\Identity\Models\RoleAssignment;
use App\Modules\Identity\Models\User;
use App\Modules\Organisation\Models\AcademicYear;
use App\Modules\Organisation\Models\Department;
use App\Modules\Organisation\Models\Stream;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Tests\Feature\Tenancy\TenancyTestHelper;

uses(TenancyTestHelper::class);

beforeEach(function () {
    $this->purgeAllTenantDatabases();
    $this->provisioner = app(TenantProvisioner::class);
    $this->tenantContext = app(TenantContext::class);

    $this->tenant = $this->provisioner->provision('tenant_lock', 'Lock College', 'lock.test', 'cloud');
    $this->tenantContext->setTenant($this->tenant);
    app(RbacBaselineSeeder::class)->run();

    $this->superAdmin = User::create([
        'type' => 'staff',
        'name' => 'IT Head',
        'email' => 'sa@lock.test',
        'password' => 'Secret@123!',
        'must_change_password' => false,
        'status' => 'active',
    ]);
    RoleAssignment::create([
        'user_id' => $this->superAdmin->id,
        'role_id' => Role::where('key', 'super_admin')->firstOrFail()->id,
        'scope_type' => 'institution',
        'scope_label' => 'i_carmel',
        'valid_from' => Carbon::now()->subDay(),
        'is_active' => true,
    ]);

    $this->principal = User::create([
        'type' => 'staff',
        'name' => 'Principal',
        'email' => 'principal@lock.test',
        'password' => 'Secret@123!',
        'must_change_password' => false,
        'status' => 'active',
    ]);
    RoleAssignment::create([
        'user_id' => $this->principal->id,
        'role_id' => Role::where('key', 'principal')->firstOrFail()->id,
        'scope_type' => 'institution',
        'scope_label' => 'i_carmel',
        'valid_from' => Carbon::now()->subDay(),
        'is_active' => true,
    ]);
});

afterEach(function () {
    Carbon::setTestNow();
    $this->tenantContext->forget();
    $this->purgeAllTenantDatabases();
});

function completeTestSetup(string $saToken, TenantContext $ctx, mixed $tenant): void
{
    test()->withHeaders(['Authorization' => "Bearer {$saToken}"])
        ->putJson('http://lock.test/api/v1/setup/steps/institution_profile', [
            'name' => 'Lock College',
            'short_code' => 'LC',
        ])->assertOk();

    test()->withHeaders(['Authorization' => "Bearer {$saToken}"])
        ->putJson('http://lock.test/api/v1/setup/steps/calendar_basics', [
            'working_days' => ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
            'periods_per_day' => 1,
            'periods' => [
                ['index' => 1, 'start' => '09:00', 'end' => '10:00'],
            ],
            'day_order_format' => 'numeric',
        ])->assertOk();

    $ctx->setTenant($tenant);
    $stream = Stream::create(['code' => 'AIDED', 'name' => 'Aided', 'scope_label' => 's_aided']);
    Department::create([
        'code' => 'CE',
        'name' => 'Civil',
        'stream_id' => $stream->id,
        'kind' => 'academic',
        'scope_label' => 'd_ce',
        'home_path' => 'inst_root.d_ce',
        'managing_path' => 'inst_root.d_ce',
    ]);
    AcademicYear::create([
        'label' => '2026-2027',
        'start_date' => '2026-06-01',
        'end_date' => '2027-03-31',
        'is_current' => true,
    ]);

    app('auth')->forgetGuards();
    test()->withHeaders(['Authorization' => "Bearer {$saToken}"])
        ->postJson('http://lock.test/api/v1/setup/complete')
        ->assertOk();
}

describe('Audited Setup Lock', function () {
    it('returns 409 when POST /setup/unlock is called before setup completion', function () {
        $token = $this->superAdmin->createToken('sa_tok')->plainTextToken;

        $this->withHeaders(['Authorization' => "Bearer {$token}"])
            ->postJson('http://lock.test/api/v1/setup/unlock', [
                'sections' => ['institution_profile'],
                'reason' => 'Trying to unlock before setup completion.',
            ])
            ->assertStatus(409)
            ->assertJson(['type' => ProblemDetails::type('setup-not-completed')]);
    });

    it('returns 422 when POST /setup/unlock receives an unknown section such as organisation_basics', function () {
        $token = $this->superAdmin->createToken('sa_tok')->plainTextToken;
        completeTestSetup($token, $this->tenantContext, $this->tenant);

        $this->app['auth']->forgetGuards();
        $this->withHeaders(['Authorization' => "Bearer {$token}"])
            ->postJson('http://lock.test/api/v1/setup/unlock', [
                'sections' => ['organisation_basics'],
                'reason' => 'Trying invalid section name.',
            ])->assertStatus(422);
    });

    it('requires a 5-500 char reason on POST /setup/unlock and denies non-super-admin callers', function () {
        $saToken = $this->superAdmin->createToken('sa_tok')->plainTextToken;
        completeTestSetup($saToken, $this->tenantContext, $this->tenant);

        // Short reason -> 422
        $this->app['auth']->forgetGuards();
        $this->withHeaders(['Authorization' => "Bearer {$saToken}"])
            ->postJson('http://lock.test/api/v1/setup/unlock', [
                'sections' => ['institution_profile'],
                'reason' => 'abc',
            ])->assertStatus(422);

        // Principal -> 403
        $this->app['auth']->forgetGuards();
        $this->tenantContext->setTenant($this->tenant);
        $pToken = $this->principal->createToken('p_tok')->plainTextToken;
        $this->withHeaders(['Authorization' => "Bearer {$pToken}"])
            ->postJson('http://lock.test/api/v1/setup/unlock', [
                'sections' => ['institution_profile'],
                'reason' => 'Principal attempting unlock.',
            ])->assertForbidden();
    });

    it('unlocks only the selected sections and writes setup.unlocked audit event with reason, sections, and ip', function () {
        $saToken = $this->superAdmin->createToken('sa_tok')->plainTextToken;
        completeTestSetup($saToken, $this->tenantContext, $this->tenant);

        $this->app['auth']->forgetGuards();
        $this->withHeaders(['Authorization' => "Bearer {$saToken}"])
            ->postJson('http://lock.test/api/v1/setup/unlock', [
                'sections' => ['institution_profile', 'signup_policy'],
                'reason' => 'Updating college name and registration policy for 2026.',
            ])->assertOk();

        $this->tenantContext->setTenant($this->tenant);
        $setupSetting = TenantSetting::where('key', 'setup')->firstOrFail();
        $unlocks = $setupSetting->value['unlocks'] ?? [];
        expect(array_keys($unlocks))->toBe(['institution_profile', 'signup_policy'])
            ->and(array_key_exists('calendar_basics', $unlocks))->toBeFalse();

        $audit = DB::connection('tenant')->table('activity_log')
            ->where('event', 'setup.unlocked')
            ->latest('created_at')
            ->first();
        expect($audit)->not->toBeNull();
        /** @var array<string, mixed> $props */
        $props = json_decode((string) $audit->properties, true);
        expect($props['reason'])->toBe('Updating college name and registration policy for 2026.')
            ->and($props['sections'])->toBe(['institution_profile', 'signup_policy'])
            ->and($props['ip'])->toBe('127.0.0.1');
    });
});

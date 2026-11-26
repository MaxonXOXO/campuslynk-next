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
use App\Modules\Organisation\Database\Seeders\KeralaPolytechnicProfileSeeder;
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
    app(KeralaPolytechnicProfileSeeder::class)->run();

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

function completeSetupForLockTest(object $testCase, string $token): void
{
    $testCase->withHeaders(['Authorization' => "Bearer {$token}", 'X-Tenant' => 'tenant_lock'])
        ->putJson('http://lock.test/api/v1/setup/steps/institution_profile', [
            'name' => 'Lock Polytechnic',
            'short_code' => 'LP',
        ])->assertOk();

    $testCase->withHeaders(['Authorization' => "Bearer {$token}", 'X-Tenant' => 'tenant_lock'])
        ->putJson('http://lock.test/api/v1/setup/steps/calendar_basics', [
            'working_days' => ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
            'periods_per_day' => 1,
            'periods' => [
                ['index' => 1, 'start' => '09:00', 'end' => '10:00'],
            ],
            'day_order_format' => 'numeric',
        ])->assertOk();

    $testCase->withHeaders(['Authorization' => "Bearer {$token}", 'X-Tenant' => 'tenant_lock'])
        ->postJson('http://lock.test/api/v1/setup/complete')
        ->assertOk();
}

describe('Audited Setup Lock', function () {
    it('returns 409 when POST /setup/unlock is called before setup completion', function () {
        $saToken = $this->superAdmin->createToken('sa_tok')->plainTextToken;

        $this->withHeaders(['Authorization' => "Bearer {$saToken}", 'X-Tenant' => 'tenant_lock'])
            ->postJson('http://lock.test/api/v1/setup/unlock', [
                'sections' => ['institution_profile'],
                'reason' => 'Trying to unlock before completion.',
            ])->assertStatus(409);
    });

    it('returns 422 when POST /setup/unlock receives an unknown section such as organisation_basics', function () {
        $saToken = $this->superAdmin->createToken('sa_tok')->plainTextToken;
        completeSetupForLockTest($this, $saToken);

        $this->withHeaders(['Authorization' => "Bearer {$saToken}", 'X-Tenant' => 'tenant_lock'])
            ->postJson('http://lock.test/api/v1/setup/unlock', [
                'sections' => ['organisation_basics'],
                'reason' => 'Trying to unlock organisation_basics.',
            ])->assertStatus(422);
    });

    it('requires a 5-500 char reason on POST /setup/unlock and restricts access to super_admin at institution scope', function () {
        $saToken = $this->superAdmin->createToken('sa_tok')->plainTextToken;
        completeSetupForLockTest($this, $saToken);

        // Short reason -> 422
        $this->withHeaders(['Authorization' => "Bearer {$saToken}", 'X-Tenant' => 'tenant_lock'])
            ->postJson('http://lock.test/api/v1/setup/unlock', [
                'sections' => ['institution_profile'],
                'reason' => 'hi',
            ])->assertStatus(422);

        // Non-super-admin -> 403
        $this->app['auth']->forgetGuards();
        $this->tenantContext->setTenant($this->tenant);
        $pToken = $this->principal->createToken('p_tok')->plainTextToken;
        $this->withHeaders(['Authorization' => "Bearer {$pToken}", 'X-Tenant' => 'tenant_lock'])
            ->postJson('http://lock.test/api/v1/setup/unlock', [
                'sections' => ['institution_profile'],
                'reason' => 'Principal should not unlock.',
            ])->assertForbidden();
    });

    it('writes setup.unlocked audit event with reason, sections, and ip', function () {
        $saToken = $this->superAdmin->createToken('sa_tok')->plainTextToken;
        completeSetupForLockTest($this, $saToken);

        $this->withHeaders(['Authorization' => "Bearer {$saToken}", 'X-Tenant' => 'tenant_lock'])
            ->postJson('http://lock.test/api/v1/setup/unlock', [
                'sections' => ['institution_profile', 'signup_policy'],
                'reason' => 'Updating email and signup policy for 2027.',
            ])->assertOk();

        $this->tenantContext->setTenant($this->tenant);
        $entry = DB::connection('tenant')->table('activity_log')
            ->where('event', 'setup.unlocked')
            ->latest('created_at')
            ->first();

        expect($entry)->not->toBeNull();
        /** @var array<string, mixed> $props */
        $props = json_decode((string) $entry->properties, true);
        expect($props['reason'])->toBe('Updating email and signup policy for 2027.')
            ->and($props['sections'])->toBe(['institution_profile', 'signup_policy'])
            ->and($props['ip'])->toBe('127.0.0.1');
    });

    it('manually locks unlocked sections via POST /setup/lock and logs setup.locked with trigger=manual', function () {
        $saToken = $this->superAdmin->createToken('sa_tok')->plainTextToken;
        completeSetupForLockTest($this, $saToken);

        $this->app['auth']->forgetGuards();
        $this->withHeaders(['Authorization' => "Bearer {$saToken}", 'X-Tenant' => 'tenant_lock'])
            ->postJson('http://lock.test/api/v1/setup/unlock', [
                'sections' => ['institution_profile', 'calendar_basics'],
                'reason' => 'Unlocking two sections for manual lock test.',
            ])->assertOk();

        $this->app['auth']->forgetGuards();
        $this->withHeaders(['Authorization' => "Bearer {$saToken}", 'X-Tenant' => 'tenant_lock'])
            ->postJson('http://lock.test/api/v1/setup/lock', [
                'sections' => ['institution_profile'],
            ])->assertOk();

        $this->tenantContext->setTenant($this->tenant);
        $setupSetting = TenantSetting::where('key', 'setup')->firstOrFail();
        expect(array_keys($setupSetting->value['unlocks'] ?? []))->toBe(['calendar_basics']);

        $audit = DB::connection('tenant')->table('activity_log')
            ->where('event', 'setup.locked')
            ->latest('created_at')
            ->first();
        expect($audit)->not->toBeNull();
        /** @var array<string, mixed> $props */
        $props = json_decode((string) $audit->properties, true);
        expect($props['sections'])->toBe(['institution_profile'])
            ->and($props['trigger'])->toBe('manual');
    });

    it('returns 423 setup-locked when saving a locked section after setup.completed_at', function () {
        $saToken = $this->superAdmin->createToken('sa_tok')->plainTextToken;
        completeSetupForLockTest($this, $saToken);

        $this->app['auth']->forgetGuards();
        $this->withHeaders(['Authorization' => "Bearer {$saToken}", 'X-Tenant' => 'tenant_lock'])
            ->putJson('http://lock.test/api/v1/setup/steps/institution_profile', [
                'name' => 'Sneaky Update',
                'short_code' => 'SU',
            ])
            ->assertStatus(423)
            ->assertJson(['type' => ProblemDetails::type('setup-locked')]);
    });

    it('saves an unlocked section, auto-relocks it, logs setup.step_updated and setup.locked, and returns 423 on a second save', function () {
        $saToken = $this->superAdmin->createToken('sa_tok')->plainTextToken;
        completeSetupForLockTest($this, $saToken);

        $this->app['auth']->forgetGuards();
        $this->withHeaders(['Authorization' => "Bearer {$saToken}", 'X-Tenant' => 'tenant_lock'])
            ->postJson('http://lock.test/api/v1/setup/unlock', [
                'sections' => ['institution_profile'],
                'reason' => 'Updating short code for accreditation.',
            ])->assertOk();

        // First save succeeds and auto-relocks
        $this->app['auth']->forgetGuards();
        $this->withHeaders(['Authorization' => "Bearer {$saToken}", 'X-Tenant' => 'tenant_lock'])
            ->putJson('http://lock.test/api/v1/setup/steps/institution_profile', [
                'name' => 'Lock College Updated',
                'short_code' => 'LCU',
            ])->assertOk();

        // Second save returns 423
        $this->app['auth']->forgetGuards();
        $this->withHeaders(['Authorization' => "Bearer {$saToken}", 'X-Tenant' => 'tenant_lock'])
            ->putJson('http://lock.test/api/v1/setup/steps/institution_profile', [
                'name' => 'Lock College Second',
                'short_code' => 'LCS',
            ])->assertStatus(423);

        $this->tenantContext->setTenant($this->tenant);
        $stepAudit = DB::connection('tenant')->table('activity_log')
            ->where('event', 'setup.step_updated')
            ->latest('created_at')
            ->first();
        expect($stepAudit)->not->toBeNull();
        /** @var array<string, mixed> $stepProps */
        $stepProps = json_decode((string) $stepAudit->properties, true);
        expect($stepProps['step'])->toBe('institution_profile')
            ->and($stepProps['old_values'])->toBe(['name' => 'Lock Polytechnic', 'short_code' => 'LP'])
            ->and($stepProps['new_values'])->toBe(['name' => 'Lock College Updated', 'short_code' => 'LCU'])
            ->and($stepProps['reason'])->toBe('Updating short code for accreditation.');

        $lockAudit = DB::connection('tenant')->table('activity_log')
            ->where('event', 'setup.locked')
            ->latest('created_at')
            ->first();
        expect($lockAudit)->not->toBeNull();
        /** @var array<string, mixed> $lockProps */
        $lockProps = json_decode((string) $lockAudit->properties, true);
        expect($lockProps['sections'])->toBe(['institution_profile'])
            ->and($lockProps['trigger'])->toBe('auto_save');
    });

    it('expires an unused unlock after SETUP_UNLOCK_SAFETY_TTL_HOURS and logs setup.locked with trigger=expired and expired_at', function () {
        $saToken = $this->superAdmin->createToken('sa_tok')->plainTextToken;
        completeSetupForLockTest($this, $saToken);

        $this->app['auth']->forgetGuards();
        $this->withHeaders(['Authorization' => "Bearer {$saToken}", 'X-Tenant' => 'tenant_lock'])
            ->postJson('http://lock.test/api/v1/setup/unlock', [
                'sections' => ['signup_policy'],
                'reason' => 'Opening signup policy for review.',
            ])->assertOk();

        // Advance past default 24h TTL
        Carbon::setTestNow(Carbon::now()->addHours(25));

        $this->app['auth']->forgetGuards();
        $this->withHeaders(['Authorization' => "Bearer {$saToken}", 'X-Tenant' => 'tenant_lock'])
            ->putJson('http://lock.test/api/v1/setup/steps/signup_policy', [
                'student_self_registration_enabled' => true,
                'parent_self_registration_enabled' => false,
                'approval_mode' => 'manual',
            ])
            ->assertStatus(423)
            ->assertJson(['type' => ProblemDetails::type('setup-locked')]);

        $this->tenantContext->setTenant($this->tenant);
        $expiredAudit = DB::connection('tenant')->table('activity_log')
            ->where('event', 'setup.locked')
            ->latest('created_at')
            ->first();
        expect($expiredAudit)->not->toBeNull();
        /** @var array<string, mixed> $props */
        $props = json_decode((string) $expiredAudit->properties, true);
        expect($props['sections'])->toBe(['signup_policy'])
            ->and($props['trigger'])->toBe('expired')
            ->and($props['expired_at'])->not->toBeNull();
    });

    it('exposes is_locked and unlocked_sections on GET /setup/status without mutating expired unlocks or returning expires_at', function () {
        $saToken = $this->superAdmin->createToken('sa_tok')->plainTextToken;
        completeSetupForLockTest($this, $saToken);

        // Locked right after completion
        $this->app['auth']->forgetGuards();
        $lockedRes = $this->withHeaders(['Authorization' => "Bearer {$saToken}", 'X-Tenant' => 'tenant_lock'])
            ->getJson('http://lock.test/api/v1/setup/status')
            ->assertOk();
        expect($lockedRes->json('data.is_locked'))->toBeTrue()
            ->and($lockedRes->json('data.unlocked_sections'))->toBe([]);

        // Unlock institution_profile -> is_locked=false, unlocked_sections has entry without expires_at
        $this->app['auth']->forgetGuards();
        $this->withHeaders(['Authorization' => "Bearer {$saToken}", 'X-Tenant' => 'tenant_lock'])
            ->postJson('http://lock.test/api/v1/setup/unlock', [
                'sections' => ['institution_profile'],
                'reason' => 'Inspecting status payload.',
            ])->assertOk();

        $this->app['auth']->forgetGuards();
        $unlockedRes = $this->withHeaders(['Authorization' => "Bearer {$saToken}", 'X-Tenant' => 'tenant_lock'])
            ->getJson('http://lock.test/api/v1/setup/status')
            ->assertOk();
        expect($unlockedRes->json('data.is_locked'))->toBeFalse()
            ->and($unlockedRes->json('data.unlocked_sections.institution_profile.reason'))->toBe('Inspecting status payload.')
            ->and($unlockedRes->json('data.unlocked_sections.institution_profile'))->not->toHaveKey('expires_at');

        // Advance past 24h -> GET /setup/status reports is_locked=true without writing setup.locked audit log
        Carbon::setTestNow(Carbon::now()->addHours(25));
        $this->app['auth']->forgetGuards();
        $afterExpiryRes = $this->withHeaders(['Authorization' => "Bearer {$saToken}", 'X-Tenant' => 'tenant_lock'])
            ->getJson('http://lock.test/api/v1/setup/status')
            ->assertOk();
        expect($afterExpiryRes->json('data.is_locked'))->toBeTrue()
            ->and($afterExpiryRes->json('data.unlocked_sections'))->toBe([]);

        $this->tenantContext->setTenant($this->tenant);
        expect(DB::connection('tenant')->table('activity_log')->where('event', 'setup.locked')->count())->toBe(0);
    });
});

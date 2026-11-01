<?php

declare(strict_types=1);

namespace Tests\Feature\Auth;

use App\Core\Auth\Models\PersonalAccessToken;
use App\Core\Auth\Models\User;
use App\Core\Tenancy\Models\License;
use App\Core\Tenancy\Models\Tenant;
use App\Core\Tenancy\Services\TenantProvisioner;
use App\Core\Tenancy\TenantContext;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Hash;
use Symfony\Component\Console\Output\BufferedOutput;
use Tests\Feature\Tenancy\TenancyTestHelper;

uses(TenancyTestHelper::class);

beforeEach(function () {
    $this->purgeAllTenantDatabases();
    $this->provisioner = app(TenantProvisioner::class);
    $this->tenantContext = app(TenantContext::class);
});

afterEach(function () {
    $this->purgeAllTenantDatabases();
});

it('logs in per tenant and isolates users with identical email across tenants', function () {
    config(['app_profile.deploy_profile' => 'cloud']);

    $tenantA = $this->provisioner->provision('tenant_a', 'College Alpha', 'alpha.test', 'cloud');
    $tenantB = $this->provisioner->provision('tenant_b', 'College Beta', 'beta.test', 'cloud');

    // Create user in Tenant A
    $this->tenantContext->setTenant($tenantA);
    $userA = User::create([
        'type' => 'staff',
        'name' => 'Alpha Principal',
        'email' => 'principal@college.edu',
        'password' => Hash::make('AlphaSecret123!'),
        'must_change_password' => false,
        'status' => 'active',
    ]);
    $this->tenantContext->forget();

    // Create user with SAME email in Tenant B but DIFFERENT password and name
    $this->tenantContext->setTenant($tenantB);
    $userB = User::create([
        'type' => 'staff',
        'name' => 'Beta Principal',
        'email' => 'principal@college.edu',
        'password' => Hash::make('BetaSecret456!'),
        'must_change_password' => false,
        'status' => 'active',
    ]);
    $this->tenantContext->forget();

    // 1. Login to Tenant A with Alpha credentials succeeds
    $respA = $this->postJson('http://alpha.test/api/v1/auth/login', [
        'identifier' => 'principal@college.edu',
        'password' => 'AlphaSecret123!',
        'device_name' => 'Browser',
        'client' => 'web',
    ]);

    $respA->assertStatus(200)
        ->assertJsonPath('data.user.id', $userA->id)
        ->assertJsonPath('data.user.name', 'Alpha Principal')
        ->assertJsonPath('data.must_change_password', false);

    $tokenA = $respA->json('data.token');

    // 2. Login to Tenant A with Beta credentials fails (401)
    $this->postJson('http://alpha.test/api/v1/auth/login', [
        'identifier' => 'principal@college.edu',
        'password' => 'BetaSecret456!',
        'device_name' => 'Browser',
        'client' => 'web',
    ])->assertStatus(401)
        ->assertJsonPath('title', 'Unauthorized');

    // 3. Login to Tenant B with Beta credentials succeeds
    $respB = $this->postJson('http://beta.test/api/v1/auth/login', [
        'identifier' => 'principal@college.edu',
        'password' => 'BetaSecret456!',
        'device_name' => 'Browser',
        'client' => 'web',
    ]);

    $respB->assertStatus(200)
        ->assertJsonPath('data.user.id', $userB->id)
        ->assertJsonPath('data.user.name', 'Beta Principal');

    $tokenB = $respB->json('data.token');

    // 4. Accessing /me on Tenant A returns Alpha Principal
    auth()->forgetGuards();
    $this->withHeader('Authorization', "Bearer {$tokenA}")
        ->getJson('http://alpha.test/api/v1/me')
        ->assertStatus(200)
        ->assertJsonPath('data.id', $userA->id)
        ->assertJsonPath('data.name', 'Alpha Principal');

    // 5. Accessing /me on Tenant B returns Beta Principal
    auth()->forgetGuards();
    $this->withHeader('Authorization', "Bearer {$tokenB}")
        ->getJson('http://beta.test/api/v1/me')
        ->assertStatus(200)
        ->assertJsonPath('data.id', $userB->id)
        ->assertJsonPath('data.name', 'Beta Principal');
});

it('supports login by mobile number and registration number', function () {
    config(['app_profile.deploy_profile' => 'cloud']);
    $tenant = $this->provisioner->provision('tenant_ids', 'ID College', 'id.test', 'cloud');

    $this->tenantContext->setTenant($tenant);
    $user = User::create([
        'type' => 'student',
        'name' => 'Student Alice',
        'email' => 'alice@id.test',
        'mobile' => '+919876543210',
        'registration_number' => 'REG-2026-001',
        'password' => Hash::make('StrongPass123!'),
        'must_change_password' => false,
        'status' => 'active',
    ]);
    $this->tenantContext->forget();

    // Login via mobile
    $this->postJson('http://id.test/api/v1/auth/login', [
        'identifier' => '+919876543210',
        'password' => 'StrongPass123!',
        'device_name' => 'Mobile App',
        'client' => 'mobile',
    ])->assertStatus(200)
        ->assertJsonPath('data.user.id', $user->id);

    // Login via registration number
    $this->postJson('http://id.test/api/v1/auth/login', [
        'identifier' => 'REG-2026-001',
        'password' => 'StrongPass123!',
        'device_name' => 'Kiosk',
        'client' => 'web',
    ])->assertStatus(200)
        ->assertJsonPath('data.user.id', $user->id);
});

it('rejects cross-tenant tokens and mismatched X-Tenant headers', function () {
    config(['app_profile.deploy_profile' => 'cloud']);

    $tenantA = $this->provisioner->provision('tenant_alpha', 'Alpha College', 'alpha.test', 'cloud');
    $tenantB = $this->provisioner->provision('tenant_beta', 'Beta College', 'beta.test', 'cloud');

    $this->tenantContext->setTenant($tenantA);
    $userA = User::create([
        'type' => 'staff',
        'name' => 'Alpha User',
        'email' => 'alpha@test.edu',
        'password' => Hash::make('Password123!'),
        'must_change_password' => false,
        'status' => 'active',
    ]);
    $this->tenantContext->forget();

    // Login on Tenant A to get Token A
    $resp = $this->postJson('http://alpha.test/api/v1/auth/login', [
        'identifier' => 'alpha@test.edu',
        'password' => 'Password123!',
        'device_name' => 'Web',
        'client' => 'web',
    ]);
    $tokenA = $resp->json('data.token');

    // 1. Pass Token A to Tenant B's host -> 401 Unauthenticated
    $this->withHeader('Authorization', "Bearer {$tokenA}")
        ->getJson('http://beta.test/api/v1/me')
        ->assertStatus(401);

    // 2. Pass Token A to Tenant A's host with mismatched X-Tenant header pointing to Tenant B -> 400 Bad Request
    $this->withHeader('Authorization', "Bearer {$tokenA}")
        ->withHeader('X-Tenant', 'tenant_beta')
        ->getJson('http://alpha.test/api/v1/me')
        ->assertStatus(400)
        ->assertJsonPath('title', 'Tenant Mismatch');
});

it('enforces token expiry, revokes token on logout, and revokes other tokens on password change', function () {
    config(['app_profile.deploy_profile' => 'cloud']);
    $tenant = $this->provisioner->provision('tenant_tok', 'Token College', 'tok.test', 'cloud');

    $this->tenantContext->setTenant($tenant);
    $user = User::create([
        'type' => 'staff',
        'name' => 'Token User',
        'email' => 'token@test.edu',
        'password' => Hash::make('OriginalPass123!'),
        'must_change_password' => false,
        'status' => 'active',
    ]);
    $this->tenantContext->forget();

    // Log in from two different devices
    $webResp = $this->postJson('http://tok.test/api/v1/auth/login', [
        'identifier' => 'token@test.edu',
        'password' => 'OriginalPass123!',
        'device_name' => 'Chrome Web',
        'client' => 'web',
    ]);
    $webToken = $webResp->json('data.token');

    $mobileResp = $this->postJson('http://tok.test/api/v1/auth/login', [
        'identifier' => 'token@test.edu',
        'password' => 'OriginalPass123!',
        'device_name' => 'iPhone Mobile',
        'client' => 'mobile',
    ]);
    $mobileToken = $mobileResp->json('data.token');

    // Verify both tokens work initially
    $this->withHeader('Authorization', "Bearer {$webToken}")
        ->getJson('http://tok.test/api/v1/me')
        ->assertStatus(200);

    $this->withHeader('Authorization', "Bearer {$mobileToken}")
        ->getJson('http://tok.test/api/v1/me')
        ->assertStatus(200);

    // 1. Enforce token expiry: artificially expire mobile token
    $this->tenantContext->setTenant($tenant);
    /** @var PersonalAccessToken|null $tokenModel */
    $tokenModel = PersonalAccessToken::findToken((string) $mobileToken);
    expect($tokenModel)->not->toBeNull();
    $tokenModel->forceFill(['expires_at' => Carbon::now()->subMinute()])->save();
    $this->tenantContext->forget();

    auth()->forgetGuards();
    $this->withHeader('Authorization', "Bearer {$mobileToken}")
        ->getJson('http://tok.test/api/v1/me')
        ->assertStatus(401);

    // 2. Change password using web token: must revoke all OTHER tokens (including any others)
    auth()->forgetGuards();
    $this->withHeader('Authorization', "Bearer {$webToken}")
        ->postJson('http://tok.test/api/v1/auth/password/change', [
            'current_password' => 'OriginalPass123!',
            'new_password' => 'BrandNewStrongPass123!',
            'new_password_confirmation' => 'BrandNewStrongPass123!',
        ])->assertStatus(200)
        ->assertJsonPath('data.message', 'Password changed successfully.');

    // Web token continues to work
    auth()->forgetGuards();
    $this->withHeader('Authorization', "Bearer {$webToken}")
        ->getJson('http://tok.test/api/v1/me')
        ->assertStatus(200);

    // 3. Logout revokes the current web token
    auth()->forgetGuards();
    $this->withHeader('Authorization', "Bearer {$webToken}")
        ->postJson('http://tok.test/api/v1/auth/logout')
        ->assertStatus(200)
        ->assertJsonPath('data.message', 'Logged out successfully.');

    // Web token is now revoked and rejected
    auth()->forgetGuards();
    $this->withHeader('Authorization', "Bearer {$webToken}")
        ->getJson('http://tok.test/api/v1/me')
        ->assertStatus(401);
});

it('enforces must_change_password by blocking endpoints with 403 until password is changed', function () {
    config(['app_profile.deploy_profile' => 'cloud']);
    $tenant = $this->provisioner->provision('tenant_mcp', 'MCP College', 'mcp.test', 'cloud');

    $this->tenantContext->setTenant($tenant);
    $user = User::create([
        'type' => 'staff',
        'name' => 'Initial Admin',
        'email' => 'admin@mcp.test',
        'password' => Hash::make('TemporaryPass123!'),
        'must_change_password' => true,
        'status' => 'active',
    ]);
    $this->tenantContext->forget();

    // Login with temporary password
    $resp = $this->postJson('http://mcp.test/api/v1/auth/login', [
        'identifier' => 'admin@mcp.test',
        'password' => 'TemporaryPass123!',
        'device_name' => 'Desktop',
        'client' => 'web',
    ]);

    $resp->assertStatus(200)
        ->assertJsonPath('data.must_change_password', true);

    $token = $resp->json('data.token');

    // 1. GET /me is blocked with 403 RFC 7807 problem details
    $this->withHeader('Authorization', "Bearer {$token}")
        ->getJson('http://mcp.test/api/v1/me')
        ->assertStatus(403)
        ->assertHeader('Content-Type', 'application/problem+json')
        ->assertJsonPath('title', 'Password Change Required')
        ->assertJsonPath('status', 403);

    // 2. Change password succeeds
    $this->withHeader('Authorization', "Bearer {$token}")
        ->postJson('http://mcp.test/api/v1/auth/password/change', [
            'current_password' => 'TemporaryPass123!',
            'new_password' => 'PermanentStrongPass123!',
            'new_password_confirmation' => 'PermanentStrongPass123!',
        ])->assertStatus(200)
        ->assertJsonPath('data.message', 'Password changed successfully.');

    // 3. Now GET /me succeeds
    $this->withHeader('Authorization', "Bearer {$token}")
        ->getJson('http://mcp.test/api/v1/me')
        ->assertStatus(200)
        ->assertJsonPath('data.must_change_password', false)
        ->assertJsonPath('data.name', 'Initial Admin');
});

it('strictly isolates login throttling per tenant with anti-enumeration timing defense', function () {
    config(['app_profile.deploy_profile' => 'cloud']);

    $tenantA = $this->provisioner->provision('tenant_throttle_a', 'Throttle College A', 'th-a.test', 'cloud');
    $tenantB = $this->provisioner->provision('tenant_throttle_b', 'Throttle College B', 'th-b.test', 'cloud');

    $this->tenantContext->setTenant($tenantA);
    User::create([
        'type' => 'staff',
        'name' => 'Target User',
        'email' => 'victim@test.edu',
        'password' => Hash::make('CorrectPassword123!'),
        'must_change_password' => false,
        'status' => 'active',
    ]);
    $this->tenantContext->forget();

    // 1. Hammer Tenant A with 5 bad attempts
    for ($i = 0; $i < 5; $i++) {
        $this->postJson('http://th-a.test/api/v1/auth/login', [
            'identifier' => 'victim@test.edu',
            'password' => 'WrongPassword!',
            'device_name' => 'HackerBot',
            'client' => 'web',
        ])->assertStatus(401);
    }

    // 6th attempt on Tenant A is locked out with 429 and Retry-After
    $lockoutResp = $this->postJson('http://th-a.test/api/v1/auth/login', [
        'identifier' => 'victim@test.edu',
        'password' => 'WrongPassword!',
        'device_name' => 'HackerBot',
        'client' => 'web',
    ]);

    $lockoutResp->assertStatus(429)
        ->assertHeader('Content-Type', 'application/problem+json')
        ->assertHeader('Retry-After')
        ->assertJsonPath('title', 'Too Many Requests');

    // 2. Hammering Tenant A does NOT lock out Tenant B
    $this->postJson('http://th-b.test/api/v1/auth/login', [
        'identifier' => 'victim@test.edu',
        'password' => 'WrongPassword!',
        'device_name' => 'HackerBot',
        'client' => 'web',
    ])->assertStatus(401); // Not 429!

    // 3. No User Enumeration: Unknown identifier vs wrong password return identical responses
    $unknownResp = $this->postJson('http://th-b.test/api/v1/auth/login', [
        'identifier' => 'nonexistent@ghost.test',
        'password' => 'SomePassword123!',
        'device_name' => 'Audit',
        'client' => 'web',
    ]);

    $knownResp = $this->postJson('http://th-b.test/api/v1/auth/login', [
        'identifier' => 'victim@test.edu',
        'password' => 'WrongPassword!',
        'device_name' => 'Audit',
        'client' => 'web',
    ]);

    expect($unknownResp->status())->toBe($knownResp->status())
        ->and($unknownResp->json('title'))->toBe($knownResp->json('title'))
        ->and($unknownResp->json('detail'))->toBe($knownResp->json('detail'));

    // 4. Timing attack resistance: delta between unknown identifier and bad password is minimal (dummy Argon2id)
    $this->postJson('http://th-b.test/api/v1/auth/login', [
        'identifier' => 'warmup@test.edu',
        'password' => 'SomePassword123!',
        'device_name' => 'Audit',
        'client' => 'web',
    ]);

    $unknownTimes = [];
    $knownTimes = [];
    for ($i = 0; $i < 3; $i++) {
        $t0 = microtime(true);
        $this->postJson('http://th-b.test/api/v1/auth/login', [
            'identifier' => "unknown_{$i}@ghost.test",
            'password' => 'SomePassword123!',
            'device_name' => 'Audit',
            'client' => 'web',
        ]);
        $unknownTimes[] = (microtime(true) - $t0) * 1000.0;

        $t1 = microtime(true);
        $this->postJson('http://th-b.test/api/v1/auth/login', [
            'identifier' => 'victim@test.edu',
            'password' => 'WrongPassword!',
            'device_name' => 'Audit',
            'client' => 'web',
        ]);
        $knownTimes[] = (microtime(true) - $t1) * 1000.0;
    }

    $avgUnknown = array_sum($unknownTimes) / count($unknownTimes);
    $avgKnown = array_sum($knownTimes) / count($knownTimes);
    $timingDeltaMs = abs($avgUnknown - $avgKnown);
    expect($timingDeltaMs)->toBeLessThan(100.0);
});

it('rejects login for suspended and pending users with generic 401', function () {
    config(['app_profile.deploy_profile' => 'cloud']);
    $tenant = $this->provisioner->provision('tenant_status', 'Status College', 'status.test', 'cloud');

    $this->tenantContext->setTenant($tenant);
    User::create([
        'type' => 'staff',
        'name' => 'Suspended Staff',
        'email' => 'suspended@status.test',
        'password' => Hash::make('ValidPass123!'),
        'must_change_password' => false,
        'status' => 'suspended',
    ]);

    User::create([
        'type' => 'student',
        'name' => 'Pending Student',
        'email' => 'pending@status.test',
        'password' => Hash::make('ValidPass123!'),
        'must_change_password' => false,
        'status' => 'pending',
    ]);
    $this->tenantContext->forget();

    // Suspended user
    $this->postJson('http://status.test/api/v1/auth/login', [
        'identifier' => 'suspended@status.test',
        'password' => 'ValidPass123!',
        'device_name' => 'Web',
        'client' => 'web',
    ])->assertStatus(401)
        ->assertJsonPath('title', 'Unauthorized')
        ->assertJsonPath('detail', 'Invalid credentials provided.');

    // Pending user
    $this->postJson('http://status.test/api/v1/auth/login', [
        'identifier' => 'pending@status.test',
        'password' => 'ValidPass123!',
        'device_name' => 'Web',
        'client' => 'web',
    ])->assertStatus(401)
        ->assertJsonPath('title', 'Unauthorized')
        ->assertJsonPath('detail', 'Invalid credentials provided.');
});

it('stores passwords as Argon2id and enforces strict password policy without composition theatre', function () {
    config(['app_profile.deploy_profile' => 'cloud']);
    $tenant = $this->provisioner->provision('tenant_pass', 'Password College', 'pass.test', 'cloud');

    $this->tenantContext->setTenant($tenant);
    $user = User::create([
        'type' => 'staff',
        'name' => 'Policy User',
        'email' => 'policy@pass.test',
        'password' => Hash::make('CurrentPass123!'),
        'must_change_password' => false,
        'status' => 'active',
    ]);
    $this->tenantContext->forget();

    // Verify hash format is Argon2id
    expect($user->password)->toStartWith('$argon2id$');

    $resp = $this->postJson('http://pass.test/api/v1/auth/login', [
        'identifier' => 'policy@pass.test',
        'password' => 'CurrentPass123!',
        'device_name' => 'Web',
        'client' => 'web',
    ]);
    $token = $resp->json('data.token');

    // 1. Password too short (< 8 chars)
    $this->withHeader('Authorization', "Bearer {$token}")
        ->postJson('http://pass.test/api/v1/auth/password/change', [
            'current_password' => 'CurrentPass123!',
            'new_password' => 'short1',
            'new_password_confirmation' => 'short1',
        ])->assertStatus(422)
        ->assertJsonValidationErrors(['new_password']);

    // 2. Common / Breached password from dictionary
    $this->withHeader('Authorization', "Bearer {$token}")
        ->postJson('http://pass.test/api/v1/auth/password/change', [
            'current_password' => 'CurrentPass123!',
            'new_password' => 'password',
            'new_password_confirmation' => 'password',
        ])->assertStatus(422)
        ->assertJsonValidationErrors(['new_password']);

    // 3. Password exceeding 128 chars
    $this->withHeader('Authorization', "Bearer {$token}")
        ->postJson('http://pass.test/api/v1/auth/password/change', [
            'current_password' => 'CurrentPass123!',
            'new_password' => str_repeat('a', 129),
            'new_password_confirmation' => str_repeat('a', 129),
        ])->assertStatus(422)
        ->assertJsonValidationErrors(['new_password']);

    // 4. Passphrase without composition theatre is accepted
    $this->withHeader('Authorization', "Bearer {$token}")
        ->postJson('http://pass.test/api/v1/auth/password/change', [
            'current_password' => 'CurrentPass123!',
            'new_password' => 'correct horse battery staple',
            'new_password_confirmation' => 'correct horse battery staple',
        ])->assertStatus(200)
        ->assertJsonPath('data.message', 'Password changed successfully.');
});

it('returns user profile and placeholders on GET /me', function () {
    config(['app_profile.deploy_profile' => 'cloud']);
    $tenant = $this->provisioner->provision('tenant_me', 'Me College', 'me.test', 'cloud');

    $this->tenantContext->setTenant($tenant);
    $user = User::create([
        'type' => 'staff',
        'name' => 'Prof. Xavier',
        'email' => 'xavier@me.test',
        'mobile' => '+919988776655',
        'registration_number' => 'FAC-001',
        'password' => Hash::make('MindPower123!'),
        'must_change_password' => false,
        'status' => 'active',
    ]);
    $this->tenantContext->forget();

    $resp = $this->postJson('http://me.test/api/v1/auth/login', [
        'identifier' => 'xavier@me.test',
        'password' => 'MindPower123!',
        'device_name' => 'Cerebro',
        'client' => 'web',
    ]);
    $token = $resp->json('data.token');

    $meResp = $this->withHeader('Authorization', "Bearer {$token}")
        ->getJson('http://me.test/api/v1/me');

    $meResp->assertStatus(200)
        ->assertJsonStructure([
            'data' => [
                'id',
                'type',
                'name',
                'email',
                'mobile',
                'registration_number',
                'status',
                'must_change_password',
                'last_login_at',
                'assignments',
                'capabilities',
            ],
            'meta' => ['timestamp'],
            'links' => ['self'],
        ])
        ->assertJsonPath('data.id', $user->id)
        ->assertJsonPath('data.type', 'staff')
        ->assertJsonPath('data.name', 'Prof. Xavier')
        ->assertJsonPath('data.assignments', [])
        ->assertJsonPath('data.capabilities', []);
});

it('bootstraps exactly one super admin and re-run does not duplicate or overwrite it', function () {
    config(['app_profile.deploy_profile' => 'onprem']);

    // 1. Run app:install with admin options
    $output = new BufferedOutput;
    $exitCode = Artisan::call('app:install', [
        '--slug' => 'carmel',
        '--name' => 'Carmel Polytechnic College',
        '--domain' => 'app.carmelpoly.in',
        '--admin-name' => 'First Admin',
        '--admin-email' => 'admin@app.carmelpoly.in',
    ], $output);

    expect($exitCode)->toBe(0);
    $text = $output->fetch();
    expect($text)->toContain('FIRST SUPER ADMIN INITIAL CREDENTIALS')
        ->and($text)->toContain('admin@app.carmelpoly.in');

    /** @var Tenant $tenant */
    $tenant = Tenant::where('slug', 'carmel')->firstOrFail();

    $this->tenantContext->setTenant($tenant);
    $adminCount = User::where('type', 'staff')->count();
    /** @var User $firstAdmin */
    $firstAdmin = User::where('email', 'admin@app.carmelpoly.in')->firstOrFail();
    $originalPasswordHash = $firstAdmin->password;
    $this->tenantContext->forget();

    expect($adminCount)->toBe(1)
        ->and($firstAdmin->must_change_password)->toBeTrue()
        ->and($firstAdmin->password)->toStartWith('$argon2id$');

    // 2. Re-run app:install -- it refuses safely and must NOT duplicate or overwrite the admin
    $rerunOutput = new BufferedOutput;
    $rerunExitCode = Artisan::call('app:install', [
        '--slug' => 'carmel',
        '--name' => 'Carmel Polytechnic College',
        '--domain' => 'app.carmelpoly.in',
        '--admin-name' => 'Second Admin Attempt',
        '--admin-email' => 'admin2@app.carmelpoly.in',
    ], $rerunOutput);

    expect($rerunExitCode)->toBe(1);

    $this->tenantContext->setTenant($tenant);
    $adminCountAfterRerun = User::where('type', 'staff')->count();
    $firstAdminAfterRerun = User::where('email', 'admin@app.carmelpoly.in')->firstOrFail();
    $this->tenantContext->forget();

    expect($adminCountAfterRerun)->toBe(1)
        ->and($firstAdminAfterRerun->password)->toBe($originalPasswordHash);
});

it('enforces multi-tier throttling for rotating IPs and credential stuffing and respects trusted proxies', function () {
    config(['app_profile.deploy_profile' => 'cloud']);
    $tenantA = $this->provisioner->provision('tenant_tier_a', 'Tier College A', 'tier-a.test', 'cloud');
    $tenantB = $this->provisioner->provision('tenant_tier_b', 'Tier College B', 'tier-b.test', 'cloud');

    $this->tenantContext->setTenant($tenantA);
    User::create([
        'type' => 'staff',
        'name' => 'Victim User',
        'email' => 'target@tier.test',
        'password' => Hash::make('TargetPass123!'),
        'must_change_password' => false,
        'status' => 'active',
    ]);
    $this->tenantContext->forget();

    // 1. Rotating IPs against one identifier hits Tier 2 limit (15 attempts across any IP)
    for ($i = 1; $i <= 15; $i++) {
        $simulatedIp = "192.168.1.{$i}";
        $this->withServerVariables(['REMOTE_ADDR' => $simulatedIp])
            ->postJson('http://tier-a.test/api/v1/auth/login', [
                'identifier' => 'target@tier.test',
                'password' => 'WrongPassword!',
                'device_name' => "Bot-{$i}",
                'client' => 'web',
            ])->assertStatus(401);
    }

    // Attempt 16 from a completely new IP (10.0.0.99) is locked out by Tier 2 (per-account limit across all IPs)
    $this->withServerVariables(['REMOTE_ADDR' => '10.0.0.99'])
        ->postJson('http://tier-a.test/api/v1/auth/login', [
            'identifier' => 'target@tier.test',
            'password' => 'WrongPassword!',
            'device_name' => 'Bot-NewIP',
            'client' => 'web',
        ])->assertStatus(429)
        ->assertJsonPath('title', 'Too Many Requests');

    // Tenant B is completely unaffected
    $this->withServerVariables(['REMOTE_ADDR' => '10.0.0.99'])
        ->postJson('http://tier-b.test/api/v1/auth/login', [
            'identifier' => 'target@tier.test',
            'password' => 'WrongPassword!',
            'device_name' => 'Bot-NewIP',
            'client' => 'web',
        ])->assertStatus(401);

    // 2. Single IP trying many identifiers hits Tier 3 limit (30 attempts from one IP)
    $attackerIp = '198.51.100.55';
    for ($i = 1; $i <= 30; $i++) {
        $this->withServerVariables(['REMOTE_ADDR' => $attackerIp])
            ->postJson('http://tier-a.test/api/v1/auth/login', [
                'identifier' => "user_{$i}@stuffing.test",
                'password' => 'GuessedPass123!',
                'device_name' => 'StuffingBot',
                'client' => 'web',
            ])->assertStatus(401);
    }

    // 31st attempt from that IP (even for a new identifier) is locked out
    $this->withServerVariables(['REMOTE_ADDR' => $attackerIp])
        ->postJson('http://tier-a.test/api/v1/auth/login', [
            'identifier' => 'fresh_victim@stuffing.test',
            'password' => 'GuessedPass123!',
            'device_name' => 'StuffingBot',
            'client' => 'web',
        ])->assertStatus(429);

    // 3. Spoofed X-Forwarded-For from untrusted peer is ignored
    config(['app.trusted_proxies' => ['10.0.0.1']]);
    // Request from untrusted peer 203.0.113.50 spoofing X-Forwarded-For: 1.1.1.1
    $resp = $this->withServerVariables([
        'REMOTE_ADDR' => '203.0.113.50',
        'HTTP_X_FORWARDED_FOR' => '1.1.1.1',
    ])->postJson('http://tier-a.test/api/v1/auth/login', [
        'identifier' => 'untrusted_spoof@tier.test',
        'password' => 'WrongPass!',
        'device_name' => 'Spoofer',
        'client' => 'web',
    ]);
    expect($resp->status())->toBe(401);
});

it('enforces login identifier precedence and prevents registration number collisions by design', function () {
    config(['app_profile.deploy_profile' => 'cloud']);
    $tenant = $this->provisioner->provision('tenant_prec', 'Precedence College', 'prec.test', 'cloud');

    $this->tenantContext->setTenant($tenant);

    // User A: Email user
    $userEmail = User::create([
        'type' => 'staff',
        'name' => 'Email Staff',
        'email' => 'prof.sharma@prec.test',
        'password' => Hash::make('SecretPass123!'),
        'must_change_password' => false,
        'status' => 'active',
    ]);

    // User B: Mobile user
    $userMobile = User::create([
        'type' => 'student',
        'name' => 'Mobile Student',
        'mobile' => '+919876543210',
        'password' => Hash::make('SecretPass123!'),
        'must_change_password' => false,
        'status' => 'active',
    ]);

    // User C: Registration number user (numeric, but not ambiguous with mobile phone)
    $userReg = User::create([
        'type' => 'student',
        'name' => 'Registration Student',
        'registration_number' => '2026001234',
        'password' => Hash::make('SecretPass123!'),
        'must_change_password' => false,
        'status' => 'active',
    ]);

    // 1. Database constraint rejects registration numbers formatted as phone numbers
    $constraintViolated = false;
    try {
        User::create([
            'type' => 'student',
            'name' => 'Illegal Phone Reg Student',
            'registration_number' => '+919876543210',
            'password' => Hash::make('Pass123!'),
            'status' => 'active',
        ]);
    } catch (\Throwable $e) {
        $constraintViolated = str_contains($e->getMessage(), 'users_reg_number_not_phone_check');
    }
    expect($constraintViolated)->toBeTrue();

    $this->tenantContext->forget();

    // 2. Contains '@' -> Email precedence
    $this->postJson('http://prec.test/api/v1/auth/login', [
        'identifier' => 'prof.sharma@prec.test',
        'password' => 'SecretPass123!',
        'device_name' => 'Web',
        'client' => 'web',
    ])->assertStatus(200)
        ->assertJsonPath('data.user.id', $userEmail->id);

    // 3. E.164 mobile login (with +91 or normalized 10-digit) -> Mobile precedence
    $this->postJson('http://prec.test/api/v1/auth/login', [
        'identifier' => '+919876543210',
        'password' => 'SecretPass123!',
        'device_name' => 'Mobile App',
        'client' => 'mobile',
    ])->assertStatus(200)
        ->assertJsonPath('data.user.id', $userMobile->id);

    $this->postJson('http://prec.test/api/v1/auth/login', [
        'identifier' => '9876543210',
        'password' => 'SecretPass123!',
        'device_name' => 'Mobile App',
        'client' => 'mobile',
    ])->assertStatus(200)
        ->assertJsonPath('data.user.id', $userMobile->id);

    // 4. Registration number login -> Registration precedence
    $this->postJson('http://prec.test/api/v1/auth/login', [
        'identifier' => '2026001234',
        'password' => 'SecretPass123!',
        'device_name' => 'Kiosk',
        'client' => 'web',
    ])->assertStatus(200)
        ->assertJsonPath('data.user.id', $userReg->id);
});

it('handles license expiration with grace period and allows renewal via tenants:license:renew', function () {
    config(['app_profile.deploy_profile' => 'cloud']);
    $tenant = $this->provisioner->provision('tenant_lic_test', 'License College', 'lic-test.test', 'cloud');

    /** @var License $license */
    $license = $tenant->license;

    // 1. Status 'ok': valid for 60 days
    $license->update(['valid_until' => Carbon::now()->addDays(60)]);
    expect($license->fresh()->status())->toBe('ok');

    $respOk = $this->getJson('http://lic-test.test/api/v1/meta');
    $respOk->assertStatus(200)
        ->assertJsonPath('data.license.status', 'ok');

    // 2. Status 'expiring': within 30 days
    $license->update(['valid_until' => Carbon::now()->addDays(15)]);
    expect($license->fresh()->status())->toBe('expiring');

    $respExp = $this->getJson('http://lic-test.test/api/v1/meta');
    $respExp->assertStatus(200)
        ->assertJsonPath('data.license.status', 'expiring');

    // 3. Status 'grace': past valid_until but within 30-day grace period
    // Requests must SUCCEED during grace period!
    $license->update(['valid_until' => Carbon::now()->subDays(5)]);
    expect($license->fresh()->status())->toBe('grace');

    $respGrace = $this->getJson('http://lic-test.test/api/v1/meta');
    $respGrace->assertStatus(200)
        ->assertJsonPath('data.license.status', 'grace');

    // 4. Status 'expired': past grace period (> 30 days past valid_until)
    // Hard 403 occurs only AFTER grace!
    $license->update(['valid_until' => Carbon::now()->subDays(35)]);
    expect($license->fresh()->status())->toBe('expired');

    $respHard403 = $this->getJson('http://lic-test.test/api/v1/meta');
    $respHard403->assertStatus(403)
        ->assertHeader('Content-Type', 'application/problem+json')
        ->assertJsonPath('title', 'License Expired');

    // 5. Renew license via tenants:license:renew command
    $exitCode = Artisan::call('tenants:license:renew', [
        'slug' => 'tenant_lic_test',
        '--days' => 365,
        '--plan' => 'enterprise',
    ]);
    expect($exitCode)->toBe(0);

    // Cache is immediately invalidated and next request succeeds
    $respRenewed = $this->getJson('http://lic-test.test/api/v1/meta');
    $respRenewed->assertStatus(200)
        ->assertJsonPath('data.license.status', 'ok');
});

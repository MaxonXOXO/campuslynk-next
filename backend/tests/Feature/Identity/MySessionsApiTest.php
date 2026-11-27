<?php

declare(strict_types=1);

use App\Core\Tenancy\Services\TenantProvisioner;
use App\Core\Tenancy\TenantContext;
use App\Modules\Identity\Models\PersonalAccessToken;
use App\Modules\Identity\Models\User;
use Tests\Feature\Tenancy\TenancyTestHelper;

uses(TenancyTestHelper::class);

beforeEach(function (): void {
    $this->purgeAllTenantDatabases();
    $provisioner = app(TenantProvisioner::class);
    $this->tenant = $provisioner->provision('tenant_sess_a', 'Sessions College A', 'sessa.test', 'cloud');
    app(TenantContext::class)->setTenant($this->tenant);

    $this->user = User::create([
        'type' => 'staff',
        'name' => 'Asha Nair',
        'email' => 'asha@sessa.test',
        'password' => 'StrongPass99!',
        'must_change_password' => false,
        'status' => 'active',
    ]);

    $this->otherUser = User::create([
        'type' => 'staff',
        'name' => 'Other User',
        'email' => 'other@sessa.test',
        'password' => 'StrongPass99!',
        'must_change_password' => false,
        'status' => 'active',
    ]);
});

afterEach(function (): void {
    app(TenantContext::class)->forget();
    $this->purgeAllTenantDatabases();
});

it('captures user_agent and ip_address at login and derives device labels without exposing token hashes or raw IPs', function (): void {
    $loginRes = $this->withHeaders([
        'X-Tenant' => 'tenant_sess_a',
        'User-Agent' => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    ])->postJson('http://sessa.test/api/v1/auth/login', [
        'identifier' => 'asha@sessa.test',
        'password' => 'StrongPass99!',
        'device_name' => 'web',
        'client' => 'web',
    ])->assertOk();

    $currentTokenPlain = $loginRes->json('data.token');

    app(TenantContext::class)->setTenant($this->tenant);
    // Legacy token without user_agent/ip_address -> Unknown device
    $this->user->createToken('legacy-web', ['*']);
    // Impersonation token -> Support session without leaking admin ID/ticket
    $this->user->createToken('impersonation:01ADMINID:TICKET-42', ['impersonation:read_only'], now()->addMinutes(30));

    $res = $this->withHeaders([
        'Authorization' => "Bearer {$currentTokenPlain}",
        'X-Tenant' => 'tenant_sess_a',
    ])->getJson('http://sessa.test/api/v1/me/sessions')->assertOk();

    $rawJson = json_encode($res->json('data'));
    expect($rawJson)->not->toContain('01ADMINID')
        ->and($rawJson)->not->toContain('TICKET-42')
        ->and($rawJson)->not->toContain('127.0.0.1');

    $sessions = collect($res->json('data'));
    expect($sessions)->toHaveCount(3);
    expect($sessions->firstWhere('is_current', true)['device_label'])->toBe('Chrome on Windows');
    expect($sessions->firstWhere('device_label', 'Unknown device'))->not->toBeNull();
    expect($sessions->firstWhere('is_support_session', true)['device_label'])->toBe('Support session');

    foreach ($sessions as $session) {
        expect($session)->not->toHaveKey('token')
            ->and($session)->not->toHaveKey('ip_address')
            ->and($session)->not->toHaveKey('user_agent');
    }
});

it('returns 422 pointing to logout when attempting to revoke the current session', function (): void {
    $tokenObj = $this->user->createToken('web', ['*']);

    $this->withHeaders([
        'Authorization' => 'Bearer '.$tokenObj->plainTextToken,
        'X-Tenant' => 'tenant_sess_a',
    ])->deleteJson("http://sessa.test/api/v1/me/sessions/{$tokenObj->accessToken->id}")
        ->assertStatus(422)
        ->assertJsonPath('type', 'https://academic-suite.com/problems/cannot-revoke-current-session');
});

it('revokes another session of the caller and returns 404 for another user session', function (): void {
    $current = $this->user->createToken('web-1', ['*']);
    $second = $this->user->createToken('web-2', ['*']);
    $otherToken = $this->otherUser->createToken('other-web', ['*']);

    $this->withHeaders([
        'Authorization' => 'Bearer '.$current->plainTextToken,
        'X-Tenant' => 'tenant_sess_a',
    ])->deleteJson("http://sessa.test/api/v1/me/sessions/{$second->accessToken->id}")
        ->assertOk();

    app(TenantContext::class)->setTenant($this->tenant);
    expect(PersonalAccessToken::find($second->accessToken->id))->toBeNull();

    // Cross-user isolation -> 404
    $this->withHeaders([
        'Authorization' => 'Bearer '.$current->plainTextToken,
        'X-Tenant' => 'tenant_sess_a',
    ])->deleteJson("http://sessa.test/api/v1/me/sessions/{$otherToken->accessToken->id}")
        ->assertNotFound();
});

it('forbids revoking an impersonation support session and excludes it from revoke-others', function (): void {
    $current = $this->user->createToken('web-1', ['*']);
    $other = $this->user->createToken('web-2', ['*']);
    $support = $this->user->createToken('impersonation:01ADMIN:T-9', ['impersonation:read_only'], now()->addMinutes(30));

    $this->withHeaders([
        'Authorization' => 'Bearer '.$current->plainTextToken,
        'X-Tenant' => 'tenant_sess_a',
    ])->deleteJson("http://sessa.test/api/v1/me/sessions/{$support->accessToken->id}")
        ->assertForbidden();

    $this->withHeaders([
        'Authorization' => 'Bearer '.$current->plainTextToken,
        'X-Tenant' => 'tenant_sess_a',
    ])->deleteJson('http://sessa.test/api/v1/me/sessions')
        ->assertOk()
        ->assertJsonPath('data.revoked_count', 1);

    app(TenantContext::class)->setTenant($this->tenant);
    expect(PersonalAccessToken::find($current->accessToken->id))->not->toBeNull()
        ->and(PersonalAccessToken::find($other->accessToken->id))->toBeNull()
        ->and(PersonalAccessToken::find($support->accessToken->id))->not->toBeNull();
});

it('enforces cross-tenant session isolation and throttling on /me/sessions', function (): void {
    $tenantB = app(TenantProvisioner::class)->provision('tenant_sess_b', 'Sessions College B', 'sessb.test', 'cloud');
    app(TenantContext::class)->setTenant($tenantB);
    $userB = User::create([
        'type' => 'staff',
        'name' => 'Tenant B User',
        'email' => 'b@sessb.test',
        'password' => 'StrongPass99!',
        'must_change_password' => false,
        'status' => 'active',
    ]);
    $tokenB = $userB->createToken('web-b', ['*']);

    app(TenantContext::class)->setTenant($this->tenant);
    $tokenA = $this->user->createToken('web-a', ['*']);

    // Tenant A token cannot authenticate against Tenant B
    $this->withHeaders([
        'Authorization' => 'Bearer '.$tokenA->plainTextToken,
        'X-Tenant' => 'tenant_sess_b',
    ])->getJson('http://sessb.test/api/v1/me/sessions')
        ->assertUnauthorized();

    // Tenant A cannot revoke Tenant B's token ID
    $this->withHeaders([
        'Authorization' => 'Bearer '.$tokenA->plainTextToken,
        'X-Tenant' => 'tenant_sess_a',
    ])->deleteJson("http://sessa.test/api/v1/me/sessions/{$tokenB->accessToken->id}")
        ->assertNotFound();
});

it('throttles excessive /me/sessions requests with 429', function (): void {
    $tokenA = $this->user->createToken('web-throttle', ['*']);

    for ($i = 0; $i < 30; $i++) {
        $this->withHeaders([
            'Authorization' => 'Bearer '.$tokenA->plainTextToken,
            'X-Tenant' => 'tenant_sess_a',
        ])->getJson('http://sessa.test/api/v1/me/sessions')->assertOk();
    }

    $this->withHeaders([
        'Authorization' => 'Bearer '.$tokenA->plainTextToken,
        'X-Tenant' => 'tenant_sess_a',
    ])->getJson('http://sessa.test/api/v1/me/sessions')->assertStatus(429);
});


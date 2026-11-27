<?php

declare(strict_types=1);

use App\Core\Tenancy\Services\TenantProvisioner;
use App\Core\Tenancy\TenantContext;
use App\Modules\Identity\Models\Activity;
use App\Modules\Identity\Models\PersonalAccessToken;
use App\Modules\Identity\Models\User;
use Tests\Feature\Tenancy\TenancyTestHelper;

uses(TenancyTestHelper::class);

beforeEach(function (): void {
    $this->purgeAllTenantDatabases();
    $this->tenant = app(TenantProvisioner::class)->provision('tenant_pwd_test', 'Password College', 'pwd.test', 'cloud');
    app(TenantContext::class)->setTenant($this->tenant);

    $this->user = User::create([
        'type' => 'staff',
        'name' => 'Asha Nair',
        'email' => 'asha@pwd.test',
        'password' => 'StrongPass99!',
        'must_change_password' => false,
        'status' => 'active',
    ]);
});

afterEach(function (): void {
    app(TenantContext::class)->forget();
    $this->purgeAllTenantDatabases();
});

it('preserves other active sessions when revoke_other_sessions is false on voluntary password change', function (): void {
    $current = $this->user->createToken('web-1', ['*']);
    $other = $this->user->createToken('web-2', ['*']);

    $this->withHeaders([
        'Authorization' => 'Bearer '.$current->plainTextToken,
        'X-Tenant' => 'tenant_pwd_test',
    ])->postJson('http://pwd.test/api/v1/auth/password/change', [
        'current_password' => 'StrongPass99!',
        'new_password' => 'NewStrongPass99!',
        'revoke_other_sessions' => false,
    ])->assertOk();

    app(TenantContext::class)->setTenant($this->tenant);
    expect(PersonalAccessToken::find($current->accessToken->id))->not->toBeNull()
        ->and(PersonalAccessToken::find($other->accessToken->id))->not->toBeNull();
});

it('logs user.password_changed without secrets for voluntary password changes', function (): void {
    $volToken = $this->user->createToken('web-vol', ['*']);
    $this->withHeaders([
        'Authorization' => 'Bearer '.$volToken->plainTextToken,
        'X-Tenant' => 'tenant_pwd_test',
    ])->postJson('http://pwd.test/api/v1/auth/password/change', [
        'current_password' => 'StrongPass99!',
        'new_password' => 'VoluntaryPass99!',
    ])->assertOk();

    app(TenantContext::class)->setTenant($this->tenant);
    /** @var Activity|null $volLog */
    $volLog = Activity::where('event', 'user.password_changed')->latest('id')->first();
    expect($volLog)->not->toBeNull()
        ->and($volLog->properties->get('forced'))->toBeFalse()
        ->and(json_encode($volLog->properties))->not->toContain('StrongPass99!')
        ->and(json_encode($volLog->properties))->not->toContain('VoluntaryPass99!');
});

it('logs user.password_changed without secrets for forced first-login password changes', function (): void {
    $forcedUser = User::create([
        'type' => 'staff',
        'name' => 'Forced User',
        'email' => 'forced@pwd.test',
        'password' => 'TempPass99!',
        'must_change_password' => true,
        'status' => 'active',
    ]);
    $forcedToken = $forcedUser->createToken('web-forced', ['password:change', 'auth:logout']);

    $this->withHeaders([
        'Authorization' => 'Bearer '.$forcedToken->plainTextToken,
        'X-Tenant' => 'tenant_pwd_test',
    ])->postJson('http://pwd.test/api/v1/auth/password/change', [
        'current_password' => 'TempPass99!',
        'new_password' => 'ForcedNewPass99!',
        'revoke_other_sessions' => false,
    ])->assertOk();

    app(TenantContext::class)->setTenant($this->tenant);
    /** @var Activity|null $forcedLog */
    $forcedLog = Activity::where('event', 'user.password_changed')->latest('id')->first();
    expect($forcedLog)->not->toBeNull()
        ->and($forcedLog->properties->get('forced'))->toBeTrue()
        ->and($forcedLog->properties->get('revoke_other_sessions'))->toBeTrue()
        ->and(json_encode($forcedLog->properties))->not->toContain('TempPass99!')
        ->and(json_encode($forcedLog->properties))->not->toContain('ForcedNewPass99!');
});

it('throttles excessive POST /auth/password/change requests with 429', function (): void {
    $token = $this->user->createToken('web-throttle', ['*']);

    for ($i = 0; $i < 30; $i++) {
        $this->withHeaders([
            'Authorization' => 'Bearer '.$token->plainTextToken,
            'X-Tenant' => 'tenant_pwd_test',
        ])->postJson('http://pwd.test/api/v1/auth/password/change', [
            'current_password' => 'WrongPass!',
            'new_password' => 'NewStrongPass99!',
        ])->assertStatus(401);
    }

    $this->withHeaders([
        'Authorization' => 'Bearer '.$token->plainTextToken,
        'X-Tenant' => 'tenant_pwd_test',
    ])->postJson('http://pwd.test/api/v1/auth/password/change', [
        'current_password' => 'WrongPass!',
        'new_password' => 'NewStrongPass99!',
    ])->assertStatus(429);
});

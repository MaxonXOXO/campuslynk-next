<?php

declare(strict_types=1);

use App\Core\Tenancy\Services\TenantProvisioner;
use App\Core\Tenancy\TenantContext;
use App\Modules\Identity\Actions\UpdateUserAction;
use App\Modules\Identity\Models\Activity;
use App\Modules\Identity\Models\User;
use Tests\Feature\Tenancy\TenancyTestHelper;

uses(TenancyTestHelper::class);

beforeEach(function (): void {
    $this->purgeAllTenantDatabases();
    $provisioner = app(TenantProvisioner::class);
    $this->tenant = $provisioner->provision('tenant_me_test', 'Me College', 'me.test', 'cloud');
    app(TenantContext::class)->setTenant($this->tenant);

    $this->user = User::create([
        'type' => 'staff',
        'name' => 'Dr. Asha Nair',
        'email' => 'asha@me.test',
        'password' => 'StrongPass99!',
        'must_change_password' => false,
        'status' => 'active',
    ]);
    $this->token = $this->user->createToken('web', ['*'])->plainTextToken;
});

afterEach(function (): void {
    app(TenantContext::class)->forget();
    $this->purgeAllTenantDatabases();
});

it('returns first_name and last_name on GET /me', function (): void {
    $this->user->forceFill(['first_name' => 'Asha', 'last_name' => 'Nair'])->save();

    $response = $this->withHeaders([
        'Authorization' => 'Bearer '.$this->token,
        'X-Tenant' => 'tenant_me_test',
    ])->getJson('http://me.test/api/v1/me');

    $response->assertOk()
        ->assertJsonPath('data.first_name', 'Asha')
        ->assertJsonPath('data.last_name', 'Nair')
        ->assertJsonPath('data.name', 'Dr. Asha Nair');
});

it('updates first_name and last_name with Malayalam Unicode characters', function (): void {
    $response = $this->withHeaders([
        'Authorization' => 'Bearer '.$this->token,
        'X-Tenant' => 'tenant_me_test',
    ])->patchJson('http://me.test/api/v1/me', [
        'first_name' => 'അരുൺ',
        'last_name' => 'നായർ',
    ]);

    $response->assertOk()
        ->assertJsonPath('data.first_name', 'അരുൺ')
        ->assertJsonPath('data.last_name', 'നായർ')
        ->assertJsonPath('data.name', 'Dr. Asha Nair');
});

it('accepts initials such as K. S. in first_name and last_name', function (): void {
    $response = $this->withHeaders([
        'Authorization' => 'Bearer '.$this->token,
        'X-Tenant' => 'tenant_me_test',
    ])->patchJson('http://me.test/api/v1/me', [
        'first_name' => 'K. S.',
        'last_name' => "O'Connor-Menon",
    ]);

    $response->assertOk()
        ->assertJsonPath('data.first_name', 'K. S.')
        ->assertJsonPath('data.last_name', "O'Connor-Menon");
});

it('trims whitespace and normalizes blank first_name and last_name to null', function (): void {
    $this->user->forceFill(['first_name' => 'Asha', 'last_name' => 'Nair'])->save();

    $response = $this->withHeaders([
        'Authorization' => 'Bearer '.$this->token,
        'X-Tenant' => 'tenant_me_test',
    ])->patchJson('http://me.test/api/v1/me', [
        'first_name' => '  Asha  ',
        'last_name' => '   ',
    ]);

    $response->assertOk()
        ->assertJsonPath('data.first_name', 'Asha')
        ->assertJsonPath('data.last_name', null);
});

it('rejects control characters and values over 100 chars with 422', function (): void {
    $this->withHeaders([
        'Authorization' => 'Bearer '.$this->token,
        'X-Tenant' => 'tenant_me_test',
    ])->patchJson('http://me.test/api/v1/me', [
        'first_name' => "Asha\x07",
    ])->assertUnprocessable();

    $this->withHeaders([
        'Authorization' => 'Bearer '.$this->token,
        'X-Tenant' => 'tenant_me_test',
    ])->patchJson('http://me.test/api/v1/me', [
        'first_name' => str_repeat('a', 101),
    ])->assertUnprocessable();
});

it('rejects forbidden profile fields name, email, mobile, and status with 422', function (string $field, mixed $value): void {
    $this->withHeaders([
        'Authorization' => 'Bearer '.$this->token,
        'X-Tenant' => 'tenant_me_test',
    ])->patchJson('http://me.test/api/v1/me', [
        $field => $value,
    ])->assertUnprocessable()
        ->assertJsonValidationErrors([$field]);
})->with([
    'name' => ['name', 'Changed Name'],
    'email' => ['email', 'other@me.test'],
    'mobile' => ['mobile', '+919999999999'],
    'status' => ['status', 'suspended'],
]);

it('records user.profile_updated audit entry with old_values and new_values and no secrets', function (): void {
    $this->user->forceFill(['first_name' => 'Asha', 'last_name' => 'Nair'])->save();

    $this->withHeaders([
        'Authorization' => 'Bearer '.$this->token,
        'X-Tenant' => 'tenant_me_test',
    ])->patchJson('http://me.test/api/v1/me', [
        'first_name' => 'Meera',
        'last_name' => 'Nair',
    ])->assertOk();

    app(TenantContext::class)->setTenant($this->tenant);

    /** @var Activity|null $log */
    $log = Activity::where('event', 'user.profile_updated')->latest('id')->first();
    expect($log)->not->toBeNull()
        ->and($log->properties->get('old_values'))->toBe(['first_name' => 'Asha'])
        ->and($log->properties->get('new_values'))->toBe(['first_name' => 'Meera'])
        ->and($log->properties->has('password'))->toBeFalse()
        ->and($log->properties->has('token'))->toBeFalse();
});

it('blocks PATCH /me during read-only impersonation with 403', function (): void {
    $impToken = $this->user->createToken('impersonation:01ADMIN:T-1', ['impersonation:read_only'])->plainTextToken;

    $this->withHeaders([
        'Authorization' => 'Bearer '.$impToken,
        'X-Tenant' => 'tenant_me_test',
    ])->patchJson('http://me.test/api/v1/me', [
        'first_name' => 'Blocked',
    ])->assertForbidden();
});

it('throttles excessive PATCH /me requests with 429', function (): void {
    for ($i = 0; $i < 30; $i++) {
        $this->withHeaders([
            'Authorization' => 'Bearer '.$this->token,
            'X-Tenant' => 'tenant_me_test',
        ])->patchJson('http://me.test/api/v1/me', [
            'first_name' => 'Asha',
        ])->assertOk();
    }

    $this->withHeaders([
        'Authorization' => 'Bearer '.$this->token,
        'X-Tenant' => 'tenant_me_test',
    ])->patchJson('http://me.test/api/v1/me', [
        'first_name' => 'Asha',
    ])->assertStatus(429);
});

it('records old_values and new_values in activity_log when UpdateUserAction changes a user name', function (): void {
    $admin = User::create([
        'type' => 'staff',
        'name' => 'IT Admin',
        'email' => 'admin@me.test',
        'password' => 'StrongPass99!',
        'must_change_password' => false,
        'status' => 'active',
    ]);

    app(UpdateUserAction::class)->execute($admin, $this->user, [
        'name' => 'Dr. Asha Menon',
    ]);

    /** @var Activity|null $log */
    $log = Activity::where('event', 'user.updated')->latest('id')->first();
    expect($log)->not->toBeNull()
        ->and($log->properties->get('old_values'))->toBe(['name' => 'Dr. Asha Nair'])
        ->and($log->properties->get('new_values'))->toBe(['name' => 'Dr. Asha Menon']);
});

<?php

declare(strict_types=1);

namespace Tests\Feature\Identity;

use App\Modules\Identity\Models\PersonalAccessToken;
use App\Modules\Identity\Models\Role;
use App\Modules\Identity\Models\RoleAssignment;
use App\Modules\Identity\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Hash;
use Illuminate\Testing\TestResponse;

trait AuthorizationHttpTestHelper
{
    protected function authorizationUser(string $name): User
    {
        return User::create([
            'type' => 'staff',
            'name' => $name,
            'email' => strtolower(str_replace(' ', '-', $name)).'@authorization-b1.test',
            'password' => Hash::make('Password123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);
    }

    protected function authorizationGrant(User $user, string $key, string $type, Model $scope): RoleAssignment
    {
        $role = Role::where('key', $key)->firstOrFail();

        return RoleAssignment::create([
            'user_id' => $user->id,
            'role_id' => $role->id,
            'scope_type' => $type,
            'scope_id' => $scope->getKey(),
            'scope_label' => $scope->getAttribute('scope_label'),
            'is_singleton' => $role->is_singleton,
            'valid_from' => Carbon::now()->subDay(),
            'is_active' => true,
        ]);
    }

    protected function authorizationActAs(User $user): void
    {
        $this->app['auth']->forgetGuards();
        $user->withAccessToken(new PersonalAccessToken(['abilities' => ['*']]));
        $this->actingAs($user, 'sanctum');
    }

    /**
     * @return array{user_id: string, role_key: string, scope_type: string, scope_id: string, scope_label: string}
     */
    protected function authorizationAppointment(User $user, string $role, string $type, Model $scope): array
    {
        return [
            'user_id' => $user->id,
            'role_key' => $role,
            'scope_type' => $type,
            'scope_id' => (string) $scope->getKey(),
            'scope_label' => (string) $scope->getAttribute('scope_label'),
        ];
    }

    /**
     * Capture every tenant DML/DDL statement, including audit/identifier writes.
     * Authentication is established before capture so the assertion measures
     * the authorization-protected request rather than bearer usage tracking.
     *
     * @param  callable(): TestResponse  $request
     */
    protected function assertAuthorizationRejectedWithoutWrites(callable $request, int $status = 403): TestResponse
    {
        $this->authorizationWrites = [];
        $this->captureAuthorizationWrites = true;

        try {
            $response = $request();
            $response->assertStatus($status)->assertHeader('Content-Type', 'application/problem+json');
            expect($this->authorizationWrites)->toBeEmpty();

            return $response;
        } finally {
            $this->captureAuthorizationWrites = false;
        }
    }
}

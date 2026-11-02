<?php

declare(strict_types=1);

namespace App\Modules\Identity\Http\Controllers;

use App\Modules\Identity\Actions\ChangePasswordAction;
use App\Modules\Identity\Actions\LoginAction;
use App\Modules\Identity\Actions\LogoutAction;
use App\Modules\Identity\Http\Requests\ChangePasswordRequest;
use App\Modules\Identity\Http\Requests\LoginRequest;
use App\Modules\Identity\Http\Resources\UserResource;
use App\Modules\Identity\Models\PersonalAccessToken;
use App\Modules\Identity\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AuthController
{
    /**
     * Authenticate user credentials and return personal access token.
     */
    public function login(LoginRequest $request, LoginAction $action): JsonResponse
    {
        /** @var string $identifier */
        $identifier = $request->validated('identifier');
        /** @var string $password */
        $password = $request->validated('password');
        /** @var string $deviceName */
        $deviceName = $request->validated('device_name');
        /** @var string $client */
        $client = $request->validated('client');

        $result = $action->execute(
            identifier: $identifier,
            password: $password,
            deviceName: $deviceName,
            client: $client,
            ip: (string) $request->ip()
        );

        return response()->json([
            'data' => [
                'token' => $result['token'],
                'token_type' => $result['token_type'],
                'expires_at' => $result['expires_at'],
                'must_change_password' => $result['must_change_password'],
                'user' => new UserResource($result['user']),
            ],
            'meta' => [
                'timestamp' => now()->toIso8601String(),
            ],
            'links' => [
                'self' => url('/api/v1/auth/login'),
            ],
        ]);
    }

    /**
     * Revoke current personal access token.
     */
    public function logout(Request $request, LogoutAction $action): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        /** @var PersonalAccessToken|null $token */
        $token = $user->currentAccessToken();

        $action->execute($user, $token);

        return response()->json([
            'data' => [
                'message' => 'Logged out successfully.',
            ],
            'meta' => [
                'timestamp' => now()->toIso8601String(),
            ],
            'links' => [
                'self' => url('/api/v1/auth/logout'),
            ],
        ]);
    }

    /**
     * Change current user's password and revoke all other sessions.
     */
    public function changePassword(ChangePasswordRequest $request, ChangePasswordAction $action): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        /** @var string $currentPassword */
        $currentPassword = $request->validated('current_password');
        /** @var string $newPassword */
        $newPassword = $request->validated('new_password');
        /** @var PersonalAccessToken|null $token */
        $token = $user->currentAccessToken();

        $action->execute(
            user: $user,
            currentPassword: $currentPassword,
            newPassword: $newPassword,
            ip: (string) $request->ip(),
            currentToken: $token
        );

        return response()->json([
            'data' => [
                'message' => 'Password changed successfully.',
            ],
            'meta' => [
                'timestamp' => now()->toIso8601String(),
            ],
            'links' => [
                'self' => url('/api/v1/auth/password/change'),
            ],
        ]);
    }
}

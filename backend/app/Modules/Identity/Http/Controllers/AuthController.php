<?php

declare(strict_types=1);

namespace App\Modules\Identity\Http\Controllers;

use App\Core\Http\ProblemDetails;
use App\Core\Tenancy\TenantContext;
use App\Modules\Identity\Actions\ChangePasswordAction;
use App\Modules\Identity\Actions\LoginAction;
use App\Modules\Identity\Actions\LogoutAction;
use App\Modules\Identity\Actions\RegisterStaffAction;
use App\Modules\Identity\Http\Requests\ChangePasswordRequest;
use App\Modules\Identity\Http\Requests\LoginRequest;
use App\Modules\Identity\Http\Requests\RegisterStaffRequest;
use App\Modules\Identity\Http\Resources\UserResource;
use App\Modules\Identity\Models\PersonalAccessToken;
use App\Modules\Identity\Models\User;
use App\Modules\Identity\Models\UserIdentifier;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Symfony\Component\HttpFoundation\Response;

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
            ip: (string) $request->ip(),
            userAgent: $request->userAgent()
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
        $revokeOtherSessions = $request->has('revoke_other_sessions')
            ? (bool) $request->validated('revoke_other_sessions')
            : true;

        $action->execute(
            user: $user,
            currentPassword: $currentPassword,
            newPassword: $newPassword,
            ip: (string) $request->ip(),
            currentToken: $token,
            revokeOtherSessions: $revokeOtherSessions
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

    /**
     * Public self-registration for staff accounts (behind tenant setting + rate limits, always 202 to avoid enumeration).
     */
    public function registerStaff(
        RegisterStaffRequest $request,
        RegisterStaffAction $action,
        TenantContext $tenantContext,
    ): JsonResponse {
        if (! $action->isSelfRegistrationEnabled()) {
            return ProblemDetails::response(
                title: 'Forbidden',
                detail: 'Staff self-registration is not enabled for this institution.',
                status: Response::HTTP_FORBIDDEN,
                type: ProblemDetails::type('self-registration-disabled'),
            );
        }

        $tenant = $tenantContext->tenant();
        $ip = (string) $request->ip();
        $ipKey = "staff_reg:ip:{$tenant->id}:".hash('sha256', $ip);

        if (RateLimiter::tooManyAttempts($ipKey, 10)) {
            $retryAfter = RateLimiter::availableIn($ipKey);

            return ProblemDetails::response(
                title: 'Too Many Requests',
                detail: 'Too many registration attempts. Please try again later.',
                status: Response::HTTP_TOO_MANY_REQUESTS,
                type: ProblemDetails::type('rate-limited'),
            )->header('Retry-After', (string) $retryAfter);
        }

        $email = $request->validated('email');
        $mobile = $request->validated('mobile');
        $handleKey = null;
        if (is_string($email) && trim($email) !== '') {
            $handleKey = "staff_reg:id:{$tenant->id}:".hash('sha256', UserIdentifier::normalise($email, 'email'));
        } elseif (is_string($mobile) && trim($mobile) !== '') {
            $handleKey = "staff_reg:id:{$tenant->id}:".hash('sha256', UserIdentifier::normalise($mobile, 'mobile'));
        }

        if ($handleKey !== null && RateLimiter::tooManyAttempts($handleKey, 3)) {
            $retryAfter = RateLimiter::availableIn($handleKey);

            return ProblemDetails::response(
                title: 'Too Many Requests',
                detail: 'Too many registration attempts. Please try again later.',
                status: Response::HTTP_TOO_MANY_REQUESTS,
                type: ProblemDetails::type('rate-limited'),
            )->header('Retry-After', (string) $retryAfter);
        }

        if ($action->dailyPendingCount() >= $action->dailyPendingCap()) {
            return ProblemDetails::response(
                title: 'Too Many Requests',
                detail: 'Daily pending staff registration capacity has been reached.',
                status: Response::HTTP_TOO_MANY_REQUESTS,
                type: ProblemDetails::type('daily-registration-cap'),
            );
        }

        RateLimiter::hit($ipKey, 3600);
        if ($handleKey !== null) {
            RateLimiter::hit($handleKey, 3600);
        }

        /** @var array{name: string, email?: string|null, mobile?: string|null, password: string, requested_department_id?: string|null, designation?: string|null, employee_id?: string|null, website?: string|null} $validated */
        $validated = $request->validated();
        $action->execute($validated, $ip);

        return response()->json([
            'data' => [
                'message' => 'If your details are eligible, your registration has been submitted for approval.',
            ],
            'meta' => [
                'timestamp' => now()->toIso8601String(),
            ],
            'links' => [
                'self' => url('/api/v1/auth/register-staff'),
            ],
        ], Response::HTTP_ACCEPTED, ['Cache-Control' => 'no-store']);
    }

    /**
     * Public tenant-resolved authentication capabilities (rate-limited, private cache, Vary: X-Tenant).
     */
    public function capabilities(
        Request $request,
        RegisterStaffAction $action,
        TenantContext $tenantContext,
    ): JsonResponse {
        $tenant = $tenantContext->tenant();
        $ipKey = "auth_cap:ip:{$tenant->id}:".hash('sha256', (string) $request->ip());

        if (RateLimiter::tooManyAttempts($ipKey, 60)) {
            $retryAfter = RateLimiter::availableIn($ipKey);

            return ProblemDetails::response(
                title: 'Too Many Requests',
                detail: 'Too many capability requests. Please try again later.',
                status: Response::HTTP_TOO_MANY_REQUESTS,
                type: ProblemDetails::type('rate-limited'),
            )->header('Retry-After', (string) $retryAfter);
        }

        RateLimiter::hit($ipKey, 60);

        return response()->json([
            'data' => [
                'staff_self_registration_enabled' => $action->isSelfRegistrationEnabled(),
            ],
            'meta' => [
                'timestamp' => now()->toIso8601String(),
            ],
            'links' => [
                'self' => url('/api/v1/auth/capabilities'),
            ],
        ], Response::HTTP_OK, [
            'Cache-Control' => 'private, max-age=60',
            'Vary' => 'X-Tenant',
        ]);
    }
}

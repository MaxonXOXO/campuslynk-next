<?php

declare(strict_types=1);

namespace App\Modules\Identity\Http\Controllers;

use App\Core\Http\ProblemDetails;
use App\Modules\Identity\Actions\ImpersonateUserAction;
use App\Modules\Identity\Http\Requests\ImpersonateRequest;
use App\Modules\Identity\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Laravel\Sanctum\PersonalAccessToken;
use Symfony\Component\HttpFoundation\Response;

class ImpersonationController
{
    public function start(ImpersonateRequest $request, ImpersonateUserAction $action): JsonResponse
    {
        /** @var User $admin */
        $admin = $request->user();

        try {
            $data = $action->execute(
                admin: $admin,
                targetUserId: (string) $request->validated('user_id'),
                ticket: (string) $request->validated('ticket'),
                reason: (string) $request->validated('reason')
            );
        } catch (\InvalidArgumentException $e) {
            return response()->json([
                'type' => ProblemDetails::type('forbidden'),
                'title' => 'Forbidden',
                'status' => 403,
                'detail' => $e->getMessage(),
            ], 403, ['Content-Type' => 'application/problem+json']);
        }

        return response()->json([
            'data' => [
                'token' => $data['token'],
                'user' => [
                    'id' => $data['user']->id,
                    'name' => $data['user']->name,
                    'email' => $data['user']->email,
                    'type' => $data['user']->type,
                ],
                'read_only' => $data['read_only'],
                'expires_at' => $data['expires_at']->toIso8601String(),
                'ticket' => $data['ticket'],
            ],
            'meta' => [
                'timestamp' => now()->toIso8601String(),
            ],
            'links' => [
                'self' => url('/api/v1/impersonation'),
                'stop' => url('/api/v1/impersonation/stop'),
            ],
        ], Response::HTTP_CREATED);
    }

    public function stop(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        /** @var PersonalAccessToken|null $token */
        $token = $user->currentAccessToken();

        if ($token !== null) {
            activity('security')
                ->performedOn($user)
                ->log("Concluded impersonation token [{$token->id}] for user [{$user->name}].");

            $token->delete();
        }

        return response()->json([
            'data' => [
                'message' => 'Impersonation session concluded.',
            ],
            'meta' => [
                'timestamp' => now()->toIso8601String(),
            ],
        ], Response::HTTP_OK);
    }
}

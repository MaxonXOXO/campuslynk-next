<?php

declare(strict_types=1);

namespace App\Modules\Identity\Http\Controllers;

use App\Core\Http\ProblemDetails;
use App\Modules\Identity\Actions\ListMySessionsAction;
use App\Modules\Identity\Actions\RevokeMySessionAction;
use App\Modules\Identity\Actions\RevokeOtherSessionsAction;
use App\Modules\Identity\Models\PersonalAccessToken;
use App\Modules\Identity\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use InvalidArgumentException;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;

class MySessionController
{
    public function index(Request $request, ListMySessionsAction $action): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        /** @var PersonalAccessToken|null $currentToken */
        $currentToken = $user->currentAccessToken();

        $sessions = $action->execute($user, $currentToken);

        return response()->json([
            'data' => $sessions,
            'meta' => [
                'timestamp' => now()->toIso8601String(),
            ],
            'links' => [
                'self' => url('/api/v1/me/sessions'),
            ],
        ]);
    }

    public function destroy(Request $request, string $id, RevokeMySessionAction $action): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        /** @var PersonalAccessToken|null $currentToken */
        $currentToken = $user->currentAccessToken();

        try {
            $action->execute($user, $id, $currentToken);
        } catch (InvalidArgumentException) {
            return ProblemDetails::response(
                type: 'https://errors.campuslynk.net/cannot-revoke-current-session',
                title: 'Cannot Revoke Current Session',
                status: Response::HTTP_UNPROCESSABLE_ENTITY,
                detail: 'You cannot revoke your current active session. Use POST /api/v1/auth/logout instead.',
            );
        } catch (AccessDeniedHttpException) {
            return ProblemDetails::response(
                type: 'https://errors.campuslynk.net/support-session-protected',
                title: 'Support Session Protected',
                status: Response::HTTP_FORBIDDEN,
                detail: 'Read-only support sessions cannot be revoked from this endpoint.',
            );
        }

        return response()->json([
            'data' => [
                'revoked' => true,
            ],
            'meta' => [
                'timestamp' => now()->toIso8601String(),
            ],
            'links' => [
                'self' => url("/api/v1/me/sessions/{$id}"),
            ],
        ]);
    }

    public function destroyOthers(Request $request, RevokeOtherSessionsAction $action): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        /** @var PersonalAccessToken|null $currentToken */
        $currentToken = $user->currentAccessToken();

        $revokedCount = $action->execute($user, $currentToken);

        return response()->json([
            'data' => [
                'revoked_count' => $revokedCount,
            ],
            'meta' => [
                'timestamp' => now()->toIso8601String(),
            ],
            'links' => [
                'self' => url('/api/v1/me/sessions'),
            ],
        ]);
    }
}

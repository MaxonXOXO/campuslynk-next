<?php

declare(strict_types=1);

namespace App\Modules\Identity\Http\Controllers;

use App\Modules\Identity\Actions\AppointPrincipalAction;
use App\Modules\Identity\Actions\ReplacePrincipalAction;
use App\Modules\Identity\Http\Requests\AppointPrincipalRequest;
use App\Modules\Identity\Http\Requests\ReplacePrincipalRequest;
use App\Modules\Identity\Http\Resources\RoleAssignmentResource;
use App\Modules\Identity\Models\User;
use Illuminate\Http\JsonResponse;
use Symfony\Component\HttpFoundation\Response;

class PrincipalController
{
    public function appoint(AppointPrincipalRequest $request, AppointPrincipalAction $action): JsonResponse
    {
        /** @var User $actor */
        $actor = $request->user();

        /** @var array{name: string, email?: string|null, mobile?: string|null, registration_number?: string|null}|null $newUser */
        $newUser = $request->validated('new_user');
        $userId = $request->validated('user_id');
        $orderRecord = $request->validated('order_record');
        $reason = $request->validated('reason');

        $result = $action->execute(
            actor: $actor,
            userId: is_string($userId) && $userId !== '' ? $userId : null,
            newUserAttributes: is_array($newUser) ? $newUser : null,
            orderRecord: is_string($orderRecord) && $orderRecord !== '' ? $orderRecord : null,
            reason: is_string($reason) && $reason !== '' ? $reason : null,
        );

        $result->assignment->load(['role', 'user', 'assignedByUser']);

        $data = [
            'assignment' => (new RoleAssignmentResource($result->assignment))->resolve($request),
            'previous_assignment_id' => null,
        ];

        if ($result->temporaryPassword !== null) {
            $data['temporary_password'] = $result->temporaryPassword;
            $data['expires_at'] = $result->temporaryPasswordExpiresAt?->toIso8601String();
        }

        return response()->json([
            'data' => $data,
            'meta' => [
                'timestamp' => now()->toIso8601String(),
            ],
            'links' => [
                'self' => url('/api/v1/principal/appoint'),
            ],
        ], Response::HTTP_CREATED, ['Cache-Control' => 'no-store']);
    }

    public function replace(ReplacePrincipalRequest $request, ReplacePrincipalAction $action): JsonResponse
    {
        /** @var User $actor */
        $actor = $request->user();

        /** @var array{name: string, email?: string|null, mobile?: string|null, registration_number?: string|null}|null $newUser */
        $newUser = $request->validated('new_user');
        $userId = $request->validated('user_id');
        $reason = (string) $request->validated('reason');
        $orderRecord = $request->validated('order_record');

        $result = $action->execute(
            actor: $actor,
            userId: is_string($userId) && $userId !== '' ? $userId : null,
            newUserAttributes: is_array($newUser) ? $newUser : null,
            reason: $reason,
            orderRecord: is_string($orderRecord) && $orderRecord !== '' ? $orderRecord : null,
        );

        $result->assignment->load(['role', 'user', 'assignedByUser']);

        $data = [
            'assignment' => (new RoleAssignmentResource($result->assignment))->resolve($request),
            'previous_assignment_id' => $result->previousAssignmentId,
        ];

        if ($result->temporaryPassword !== null) {
            $data['temporary_password'] = $result->temporaryPassword;
            $data['expires_at'] = $result->temporaryPasswordExpiresAt?->toIso8601String();
        }

        return response()->json([
            'data' => $data,
            'meta' => [
                'timestamp' => now()->toIso8601String(),
            ],
            'links' => [
                'self' => url('/api/v1/principal/replace'),
            ],
        ], Response::HTTP_CREATED, ['Cache-Control' => 'no-store']);
    }
}

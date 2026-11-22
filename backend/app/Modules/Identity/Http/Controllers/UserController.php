<?php

declare(strict_types=1);

namespace App\Modules\Identity\Http\Controllers;

use App\Modules\Identity\Actions\CreateUserAction;
use App\Modules\Identity\Actions\ReactivateUserAction;
use App\Modules\Identity\Actions\ResetUserPasswordAction;
use App\Modules\Identity\Actions\SuspendUserAction;
use App\Modules\Identity\Actions\UnlockUserAction;
use App\Modules\Identity\Actions\UpdateUserAction;
use App\Modules\Identity\Http\Requests\CreateUserRequest;
use App\Modules\Identity\Http\Requests\UpdateUserRequest;
use App\Modules\Identity\Http\Resources\UserResource;
use App\Modules\Identity\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class UserController
{
    public function index(Request $request): JsonResponse
    {
        $query = User::query()->with(['roleAssignments' => fn ($q) => $q->active()->with('role')]);

        if ($request->has('type')) {
            $query->where('type', (string) $request->query('type'));
        }

        if ($request->has('status')) {
            $query->where('status', (string) $request->query('status'));
        }

        if ($request->has('search')) {
            $search = (string) $request->query('search');
            $query->where(function ($q) use ($search) {
                $q->where('name', 'ilike', "%{$search}%")
                    ->orWhere('email', 'ilike', "%{$search}%")
                    ->orWhere('registration_number', 'ilike', "%{$search}%");
            });
        }

        $users = $query->orderBy('name')->paginate(25);

        return response()->json([
            'data' => UserResource::collection($users->items()),
            'meta' => [
                'current_page' => $users->currentPage(),
                'last_page' => $users->lastPage(),
                'per_page' => $users->perPage(),
                'total' => $users->total(),
            ],
            'links' => [
                'self' => $request->fullUrl(),
            ],
        ]);
    }

    public function show(string $id): JsonResponse
    {
        /** @var User $user */
        $user = User::with(['roleAssignments' => fn ($q) => $q->active()->with('role')])->findOrFail($id);

        return response()->json([
            'data' => new UserResource($user),
            'links' => [
                'self' => url("/api/v1/users/{$user->id}"),
            ],
        ]);
    }

    public function store(CreateUserRequest $request, CreateUserAction $action): JsonResponse
    {
        /** @var User $caller */
        $caller = $request->user();

        /** @var array{type: string, name: string, email?: string|null, mobile?: string|null, registration_number?: string|null, password?: string|null} $validated */
        $validated = $request->validated();

        $result = $action->execute($caller, $validated);
        $result->user->load(['roleAssignments' => fn ($q) => $q->active()->with('role')]);

        $data = (new UserResource($result->user))->resolve($request);
        if ($result->temporaryPassword !== null) {
            $data['temporary_password'] = $result->temporaryPassword;
            $data['expires_at'] = $result->temporaryPasswordExpiresAt->toIso8601String();
        }

        return response()->json([
            'data' => $data,
            'meta' => [
                'timestamp' => now()->toIso8601String(),
            ],
            'links' => [
                'self' => url("/api/v1/users/{$result->user->id}"),
            ],
        ], Response::HTTP_CREATED, ['Cache-Control' => 'no-store']);
    }

    public function update(UpdateUserRequest $request, string $id, UpdateUserAction $action): JsonResponse
    {
        /** @var User $caller */
        $caller = $request->user();

        /** @var User $user */
        $user = User::findOrFail($id);

        $updated = $action->execute($caller, $user, $request->validated());
        $updated->load(['roleAssignments' => fn ($q) => $q->active()->with('role')]);

        return response()->json([
            'data' => new UserResource($updated),
            'meta' => [
                'timestamp' => now()->toIso8601String(),
            ],
            'links' => [
                'self' => url("/api/v1/users/{$user->id}"),
            ],
        ]);
    }

    public function resetPassword(Request $request, string $id, ResetUserPasswordAction $action): JsonResponse
    {
        /** @var User $caller */
        $caller = $request->user();

        /** @var User $targetUser */
        $targetUser = User::findOrFail($id);

        $result = $action->execute($caller, $targetUser, (string) $request->ip());

        return response()->json([
            'data' => [
                'user_id' => $targetUser->id,
                'temporary_password' => $result->temporaryPassword,
                'expires_at' => $result->expiresAt->toIso8601String(),
                'must_change_password' => true,
            ],
            'meta' => [
                'timestamp' => now()->toIso8601String(),
            ],
            'links' => [
                'self' => url("/api/v1/users/{$targetUser->id}/reset-password"),
            ],
        ], Response::HTTP_OK, ['Cache-Control' => 'no-store']);
    }

    public function unlock(Request $request, string $id, UnlockUserAction $action): JsonResponse
    {
        /** @var User $caller */
        $caller = $request->user();

        /** @var User $targetUser */
        $targetUser = User::findOrFail($id);

        $action->execute($caller, $targetUser, (string) $request->ip());

        return response()->json([
            'data' => [
                'message' => 'User account unlocked successfully.',
            ],
            'meta' => [
                'timestamp' => now()->toIso8601String(),
            ],
            'links' => [
                'self' => url("/api/v1/users/{$targetUser->id}/unlock"),
            ],
        ]);
    }

    public function suspend(Request $request, string $id, SuspendUserAction $action): JsonResponse
    {
        /** @var User $caller */
        $caller = $request->user();

        /** @var User $targetUser */
        $targetUser = User::findOrFail($id);

        $action->execute($caller, $targetUser);
        $targetUser->load(['roleAssignments' => fn ($q) => $q->active()->with('role')]);

        return response()->json([
            'data' => new UserResource($targetUser),
            'meta' => [
                'timestamp' => now()->toIso8601String(),
                'message' => 'User suspended successfully.',
            ],
            'links' => [
                'self' => url("/api/v1/users/{$targetUser->id}"),
            ],
        ]);
    }

    public function reactivate(Request $request, string $id, ReactivateUserAction $action): JsonResponse
    {
        /** @var User $caller */
        $caller = $request->user();

        /** @var User $targetUser */
        $targetUser = User::findOrFail($id);

        $action->execute($caller, $targetUser);
        $targetUser->load(['roleAssignments' => fn ($q) => $q->active()->with('role')]);

        return response()->json([
            'data' => new UserResource($targetUser),
            'meta' => [
                'timestamp' => now()->toIso8601String(),
                'message' => 'User reactivated successfully.',
            ],
            'links' => [
                'self' => url("/api/v1/users/{$targetUser->id}"),
            ],
        ]);
    }
}

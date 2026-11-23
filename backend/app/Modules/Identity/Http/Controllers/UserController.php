<?php

declare(strict_types=1);

namespace App\Modules\Identity\Http\Controllers;

use App\Modules\Identity\Actions\ApproveUserAction;
use App\Modules\Identity\Actions\BulkApproveUsersAction;
use App\Modules\Identity\Actions\CreateUserAction;
use App\Modules\Identity\Actions\DeactivateUserAction;
use App\Modules\Identity\Actions\ReactivateUserAction;
use App\Modules\Identity\Actions\RejectUserAction;
use App\Modules\Identity\Actions\ResetUserPasswordAction;
use App\Modules\Identity\Actions\SuspendUserAction;
use App\Modules\Identity\Actions\UnlockUserAction;
use App\Modules\Identity\Actions\UpdateUserAction;
use App\Modules\Identity\Http\Requests\BulkApproveUsersRequest;
use App\Modules\Identity\Http\Requests\CreateUserRequest;
use App\Modules\Identity\Http\Requests\DeactivateUserRequest;
use App\Modules\Identity\Http\Requests\RejectUserRequest;
use App\Modules\Identity\Http\Requests\UpdateUserRequest;
use App\Modules\Identity\Http\Resources\UserResource;
use App\Modules\Identity\Models\User;
use App\Modules\Identity\Services\ScopeAuthorizer;
use App\Modules\Organisation\Contracts\ScopeDirectoryContract;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Symfony\Component\HttpFoundation\Response;

class UserController
{
    public function index(Request $request, ScopeAuthorizer $authorizer, ScopeDirectoryContract $scopeDirectory): JsonResponse
    {
        /** @var User $caller */
        $caller = $request->user();
        $caller->loadMissing(['roleAssignments' => fn ($q) => $q->active()->with('role.permissions')]);

        $query = $authorizer->scopeQuery(User::query(), $caller, 'identity.user.view')
            ->with([
                'roleAssignments' => fn ($q) => $q->active()->with('role'),
                'staffProfile',
            ]);

        if ($request->filled('type')) {
            $query->where('type', (string) $request->query('type'));
        }

        if ($request->filled('status')) {
            $query->where('status', (string) $request->query('status'));
        }

        if ($request->filled('role_key')) {
            $roleKey = (string) $request->query('role_key');
            $query->whereHas('roleAssignments', function (Builder $assignments) use ($roleKey): void {
                $assignments->active()->whereHas('role', fn (Builder $roles) => $roles->where('key', $roleKey));
            });
        }

        if ($request->filled('department_id')) {
            $departmentId = (string) $request->query('department_id');
            $deptScope = $scopeDirectory->query()
                ->where('scope_type', 'department')
                ->where('scope_id', $departmentId)
                ->first();

            if ($deptScope === null || ! is_string($deptScope->scope_label ?? null)) {
                $query->whereRaw('1 = 0');
            } else {
                $deptLabel = $deptScope->scope_label;
                $matchingLabels = $scopeDirectory->query()
                    ->whereRaw('managing_path ~ ?::lquery', ["*.{$deptLabel}.*"])
                    ->orWhereRaw('home_path ~ ?::lquery', ["*.{$deptLabel}.*"])
                    ->pluck('scope_label')
                    ->all();

                if ($matchingLabels === []) {
                    $query->whereRaw('1 = 0');
                } else {
                    $query->whereHas('roleAssignments', function (Builder $assignments) use ($matchingLabels): void {
                        $assignments->active()->whereIn('scope_label', $matchingLabels);
                    });
                }
            }
        }

        if ($request->filled('search')) {
            $search = (string) $request->query('search');
            $query->where(function ($q) use ($search) {
                $q->where('name', 'ilike', "%{$search}%")
                    ->orWhere('email', 'ilike', "%{$search}%")
                    ->orWhere('registration_number', 'ilike', "%{$search}%");
            });
        }

        if ($request->has('must_change_password')) {
            $mustChange = filter_var($request->query('must_change_password'), FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
            if ($mustChange !== null) {
                $query->where('must_change_password', $mustChange);
            }
        }

        if (filter_var($request->query('expired_temp_password'), FILTER_VALIDATE_BOOLEAN)) {
            $query->where('must_change_password', true)
                ->whereNotNull('temporary_password_expires_at')
                ->where('temporary_password_expires_at', '<', now());
        }

        if ($request->filled('requested_department_id')) {
            $reqDeptId = (string) $request->query('requested_department_id');
            $query->whereHas('staffProfile', fn (Builder $sp) => $sp->where('requested_department_id', $reqDeptId));
        }

        $perPage = max(1, min(100, (int) $request->query('per_page', '25')));
        $users = $query->orderBy('name')->paginate($perPage);

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

        Gate::authorize('view', $user);

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

        Gate::authorize('update', $user);

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

        Gate::authorize('resetPassword', $targetUser);

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

        Gate::authorize('unlock', $targetUser);

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

        Gate::authorize('suspend', $targetUser);

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

        Gate::authorize('reactivate', $targetUser);

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

    public function approve(Request $request, string $id, ApproveUserAction $action): JsonResponse
    {
        /** @var User $caller */
        $caller = $request->user();

        /** @var User $targetUser */
        $targetUser = User::findOrFail($id);

        Gate::authorize('approve', $targetUser);

        $action->execute($caller, $targetUser);
        $targetUser->load(['roleAssignments' => fn ($q) => $q->active()->with('role')]);

        return response()->json([
            'data' => new UserResource($targetUser),
            'meta' => [
                'timestamp' => now()->toIso8601String(),
                'message' => 'User approved successfully.',
            ],
            'links' => [
                'self' => url("/api/v1/users/{$targetUser->id}"),
            ],
        ]);
    }

    public function reject(RejectUserRequest $request, string $id, RejectUserAction $action): JsonResponse
    {
        /** @var User $caller */
        $caller = $request->user();

        /** @var User $targetUser */
        $targetUser = User::findOrFail($id);

        Gate::authorize('reject', $targetUser);

        $reason = (string) $request->validated('reason');
        $action->execute($caller, $targetUser, $reason);
        $targetUser->load(['roleAssignments' => fn ($q) => $q->active()->with('role')]);

        return response()->json([
            'data' => new UserResource($targetUser),
            'meta' => [
                'timestamp' => now()->toIso8601String(),
                'message' => 'User rejected successfully.',
            ],
            'links' => [
                'self' => url("/api/v1/users/{$targetUser->id}"),
            ],
        ]);
    }

    public function deactivate(DeactivateUserRequest $request, string $id, DeactivateUserAction $action): JsonResponse
    {
        /** @var User $caller */
        $caller = $request->user();

        /** @var User $targetUser */
        $targetUser = User::findOrFail($id);

        Gate::authorize('deactivate', $targetUser);

        $reason = (string) $request->validated('reason');
        $action->execute($caller, $targetUser, $reason);
        $targetUser->load(['roleAssignments' => fn ($q) => $q->active()->with('role')]);

        return response()->json([
            'data' => new UserResource($targetUser),
            'meta' => [
                'timestamp' => now()->toIso8601String(),
                'message' => 'User deactivated successfully.',
            ],
            'links' => [
                'self' => url("/api/v1/users/{$targetUser->id}"),
            ],
        ]);
    }

    public function bulkApprove(BulkApproveUsersRequest $request, BulkApproveUsersAction $action): JsonResponse
    {
        /** @var User $caller */
        $caller = $request->user();

        /** @var list<string> $userIds */
        $userIds = $request->validated('user_ids');
        $result = $action->execute($caller, $userIds);

        return response()->json([
            'data' => $result,
            'meta' => [
                'timestamp' => now()->toIso8601String(),
            ],
            'links' => [
                'self' => url('/api/v1/users/bulk-approve'),
            ],
        ]);
    }
}

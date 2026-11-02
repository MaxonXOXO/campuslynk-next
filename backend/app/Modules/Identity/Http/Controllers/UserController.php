<?php

declare(strict_types=1);

namespace App\Modules\Identity\Http\Controllers;

use App\Core\Tenancy\TenantContext;
use App\Modules\Identity\Http\Requests\CreateUserRequest;
use App\Modules\Identity\Http\Requests\UpdateUserRequest;
use App\Modules\Identity\Http\Resources\UserResource;
use App\Modules\Identity\Models\Role;
use App\Modules\Identity\Models\RoleAssignment;
use App\Modules\Identity\Models\User;
use App\Modules\Identity\Models\UserIdentifier;
use App\Modules\Identity\Services\LoginRateLimiter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

class UserController
{
    public function index(Request $request): JsonResponse
    {
        $query = User::query();

        if ($request->has('type')) {
            $query->where('type', (string) $request->query('type'));
        }

        if ($request->has('status')) {
            $query->where('status', (string) $request->query('status'));
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
        $user = User::findOrFail($id);

        return response()->json([
            'data' => new UserResource($user),
            'meta' => [
                'timestamp' => now()->toIso8601String(),
            ],
            'links' => [
                'self' => url("/api/v1/users/{$user->id}"),
            ],
        ]);
    }

    public function store(CreateUserRequest $request): JsonResponse
    {
        $password = (string) ($request->validated('password') ?? Str::password(16));

        /** @var User $user */
        $user = User::create([
            'type' => (string) $request->validated('type'),
            'name' => (string) $request->validated('name'),
            'email' => $request->validated('email') ? strtolower((string) $request->validated('email')) : null,
            'mobile' => $request->validated('mobile') ? (string) $request->validated('mobile') : null,
            'registration_number' => $request->validated('registration_number') ? (string) $request->validated('registration_number') : null,
            'password' => Hash::make($password),
            'must_change_password' => true,
            'status' => 'active',
        ]);

        activity('identity')
            ->performedOn($user)
            ->causedBy($request->user())
            ->log("Created user [{$user->name}] ({$user->type}).");

        return response()->json([
            'data' => new UserResource($user),
            'meta' => [
                'timestamp' => now()->toIso8601String(),
            ],
            'links' => [
                'self' => url("/api/v1/users/{$user->id}"),
            ],
        ], Response::HTTP_CREATED);
    }

    public function update(UpdateUserRequest $request, string $id): JsonResponse
    {
        /** @var User $user */
        $user = User::findOrFail($id);

        $user->fill($request->validated());
        $user->save();

        activity('identity')
            ->performedOn($user)
            ->causedBy($request->user())
            ->log("Updated user [{$user->name}].");

        return response()->json([
            'data' => new UserResource($user),
            'meta' => [
                'timestamp' => now()->toIso8601String(),
            ],
            'links' => [
                'self' => url("/api/v1/users/{$user->id}"),
            ],
        ]);
    }

    public function unlock(Request $request, string $id, LoginRateLimiter $rateLimiter, TenantContext $tenantContext): JsonResponse
    {
        /** @var User $caller */
        $caller = $request->user();

        /** @var User $targetUser */
        $targetUser = User::findOrFail($id);

        // Authorization check: Super Admin, Principal, Admin, or Tutor (for student)
        $callerRoleKeys = Role::whereIn(
            'id',
            RoleAssignment::where('user_id', $caller->id)->whereRaw('is_active is true')->pluck('role_id')
        )->pluck('key')->all();

        $allowedRoles = ['super_admin', 'principal', 'admin'];
        $canUnlock = ! empty(array_intersect($allowedRoles, $callerRoleKeys));

        if (! $canUnlock) {
            if (in_array('tutor', $callerRoleKeys, true) && $targetUser->type === 'student') {
                $canUnlock = true;
            }
        }

        if (! $canUnlock) {
            return response()->json([
                'type' => 'https://api.academic-suite.com/errors/forbidden',
                'title' => 'Forbidden',
                'status' => 403,
                'detail' => 'You do not have authority to unlock this user account.',
            ], 403, ['Content-Type' => 'application/problem+json']);
        }

        $tenant = $tenantContext->getTenant() ?? abort(404, 'Tenant context not resolved.');
        $identifiers = array_filter([$targetUser->email, $targetUser->mobile, $targetUser->registration_number]);

        foreach ($identifiers as $val) {
            $normalised = UserIdentifier::normalise((string) $val);
            $rateLimiter->unlock($tenant->id, $normalised, (string) $request->ip());
        }

        activity('security')
            ->performedOn($targetUser)
            ->causedBy($caller)
            ->log("Administratively unlocked user account [{$targetUser->name}].");

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

    public function suspend(Request $request, string $id): JsonResponse
    {
        /** @var User $caller */
        $caller = $request->user();

        /** @var User $targetUser */
        $targetUser = User::findOrFail($id);

        $targetUser->status = 'suspended';
        $targetUser->save();

        // Revoke all existing access tokens immediately
        $targetUser->tokens()->delete();

        activity('security')
            ->performedOn($targetUser)
            ->causedBy($caller)
            ->log("Suspended user account [{$targetUser->name}].");

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

    public function reactivate(Request $request, string $id): JsonResponse
    {
        /** @var User $caller */
        $caller = $request->user();

        /** @var User $targetUser */
        $targetUser = User::findOrFail($id);

        $targetUser->status = 'active';
        $targetUser->save();

        activity('security')
            ->performedOn($targetUser)
            ->causedBy($caller)
            ->log("Reactivated user account [{$targetUser->name}].");

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

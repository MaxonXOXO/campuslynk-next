<?php

declare(strict_types=1);

namespace App\Modules\Identity\Http\Controllers;

use App\Modules\Identity\Http\Requests\CreateUserRequest;
use App\Modules\Identity\Http\Requests\UpdateUserRequest;
use App\Modules\Identity\Http\Resources\UserResource;
use App\Modules\Identity\Models\User;
use App\Modules\Identity\Models\UserIdentifier;
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

        if ($user->email !== null) {
            UserIdentifier::create([
                'user_id' => $user->id,
                'kind' => 'email',
                'value' => $user->email,
                'value_normalised' => UserIdentifier::normalise('email', $user->email),
                'is_primary' => true,
            ]);
        }

        if ($user->mobile !== null) {
            UserIdentifier::create([
                'user_id' => $user->id,
                'kind' => 'mobile',
                'value' => $user->mobile,
                'value_normalised' => UserIdentifier::normalise('mobile', $user->mobile),
                'is_primary' => true,
            ]);
        }

        if ($user->registration_number !== null) {
            UserIdentifier::create([
                'user_id' => $user->id,
                'kind' => 'registration_number',
                'value' => $user->registration_number,
                'value_normalised' => UserIdentifier::normalise('registration_number', $user->registration_number),
                'is_primary' => true,
            ]);
        }

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
}

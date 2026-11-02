<?php

declare(strict_types=1);

namespace App\Modules\Identity\Http\Controllers;

use App\Modules\Identity\Models\RoleAssignment;
use App\Modules\Identity\Models\User;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class MeController
{
    /**
     * Retrieve the currently authenticated user with active assignments and capabilities.
     */
    public function __invoke(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $now = Carbon::now();

        /** @var Collection<int, RoleAssignment> $assignments */
        $assignments = RoleAssignment::query()
            ->with(['role.permissions'])
            ->where('user_id', $user->id)
            ->whereRaw('is_active is true')
            ->where('valid_from', '<=', $now)
            ->where(function ($query) use ($now) {
                $query->whereNull('valid_to')->orWhere('valid_to', '>', $now);
            })
            ->get();

        $assignmentData = $assignments->map(fn (RoleAssignment $a) => [
            'id' => $a->id,
            'role_key' => $a->role->key,
            'role_name' => $a->role->name,
            'scope_type' => $a->scope_type,
            'scope_label' => $a->scope_label,
            'is_singleton' => (bool) $a->is_singleton,
            'valid_from' => $a->valid_from?->toIso8601String(),
            'valid_to' => $a->valid_to?->toIso8601String(),
        ])->values()->all();

        /** @var list<string> $capabilities */
        $capabilities = $assignments
            ->flatMap(fn (RoleAssignment $a) => $a->role->permissions->pluck('key'))
            ->unique()
            ->sort()
            ->values()
            ->all();

        return response()->json([
            'data' => [
                'id' => $user->id,
                'type' => $user->type,
                'name' => $user->name,
                'email' => $user->email,
                'mobile' => $user->mobile,
                'registration_number' => $user->registration_number,
                'status' => $user->status,
                'must_change_password' => $user->must_change_password,
                'last_login_at' => $user->last_login_at?->toIso8601String(),
                'assignments' => $assignmentData,
                'capabilities' => $capabilities,
            ],
            'meta' => [
                'timestamp' => now()->toIso8601String(),
            ],
            'links' => [
                'self' => url('/api/v1/me'),
            ],
        ]);
    }
}

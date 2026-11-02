<?php

declare(strict_types=1);

namespace App\Modules\Identity\Http\Controllers;

use App\Modules\Identity\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MeController
{
    /**
     * Retrieve the currently authenticated user with RBAC placeholders.
     */
    public function __invoke(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

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
                'assignments' => [], // Placeholder for Step 4 Scoped RBAC
                'capabilities' => [], // Placeholder for Step 4 Scoped RBAC
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

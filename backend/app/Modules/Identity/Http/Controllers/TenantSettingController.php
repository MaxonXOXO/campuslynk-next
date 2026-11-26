<?php

declare(strict_types=1);

namespace App\Modules\Identity\Http\Controllers;

use App\Modules\Identity\Actions\GetTenantSettingsAction;
use App\Modules\Identity\Actions\UpdateTenantSettingAction;
use App\Modules\Identity\Http\Requests\UpdateTenantSettingRequest;
use App\Modules\Identity\Models\User;
use Illuminate\Http\JsonResponse;

class TenantSettingController
{
    public function index(GetTenantSettingsAction $action): JsonResponse
    {
        $result = $action->execute();

        return response()->json([
            'data' => $result,
            'meta' => [
                'timestamp' => now()->toIso8601String(),
            ],
            'links' => [
                'self' => url('/api/v1/settings'),
            ],
        ]);
    }

    public function update(
        UpdateTenantSettingRequest $request,
        string $key,
        UpdateTenantSettingAction $action,
    ): JsonResponse {
        /** @var User $actor */
        $actor = $request->user();
        /** @var array<string, mixed> $value */
        $value = $request->validated('value');
        $reason = $request->validated('reason');

        $updated = $action->execute(
            actor: $actor,
            key: $key,
            value: $value,
            reason: is_string($reason) ? $reason : null,
            ip: (string) $request->ip(),
        );

        return response()->json([
            'data' => $updated,
            'meta' => [
                'timestamp' => now()->toIso8601String(),
            ],
            'links' => [
                'self' => url("/api/v1/settings/{$key}"),
            ],
        ]);
    }
}

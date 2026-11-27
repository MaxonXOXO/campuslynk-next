<?php

declare(strict_types=1);

namespace App\Modules\Identity\Http\Controllers;

use App\Modules\Identity\Actions\ListAuditLogsAction;
use App\Modules\Identity\Http\Requests\ListAuditLogsRequest;
use App\Modules\Identity\Models\User;
use Illuminate\Http\JsonResponse;

class AuditLogController
{
    public function index(ListAuditLogsRequest $request, ListAuditLogsAction $action): JsonResponse
    {
        /** @var User $actor */
        $actor = $request->user();
        /** @var array{log_name?: string|null, event?: string|null, causer_id?: string|null, from?: string|null, to?: string|null, search?: string|null, page?: int, per_page?: int} $validated */
        $validated = $request->validated();

        $result = $action->execute($actor, $validated);

        return response()->json([
            'data' => $result['data'],
            'meta' => [
                ...$result['meta'],
                'timestamp' => now()->toIso8601String(),
            ],
            'links' => [
                'self' => url('/api/v1/audit-logs'),
            ],
        ]);
    }
}

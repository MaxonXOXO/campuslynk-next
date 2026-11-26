<?php

declare(strict_types=1);

namespace App\Modules\Organisation\Http\Controllers;

use App\Core\Http\ProblemDetails;
use App\Modules\Organisation\Actions\CompleteSetupAction;
use App\Modules\Organisation\Actions\GetSetupStatusAction;
use App\Modules\Organisation\Actions\SaveSetupStepAction;
use App\Modules\Organisation\Actions\UnlockSetupSectionsAction;
use App\Modules\Organisation\Http\Requests\SaveSetupStepRequest;
use App\Modules\Organisation\Http\Requests\UnlockSetupSectionsRequest;
use App\Modules\Organisation\Http\Resources\SetupStatusResource;
use Illuminate\Http\JsonResponse;

class SetupController
{
    public function status(GetSetupStatusAction $action): JsonResponse
    {
        $status = $action->execute();

        return response()->json([
            'data' => new SetupStatusResource($status),
            'meta' => [
                'timestamp' => now()->toIso8601String(),
            ],
            'links' => [
                'self' => url('/api/v1/setup/status'),
            ],
        ]);
    }

    public function saveStep(SaveSetupStepRequest $request, string $step, SaveSetupStepAction $action): JsonResponse
    {
        /** @var array<string, mixed> $payload */
        $payload = $request->all();

        try {
            $status = $action->execute($step, $payload);
        } catch (\InvalidArgumentException $e) {
            return ProblemDetails::response(
                title: 'Unprocessable Content',
                detail: $e->getMessage(),
                status: 422,
                type: ProblemDetails::type('unprocessable')
            );
        }

        return response()->json([
            'data' => new SetupStatusResource($status),
            'meta' => [
                'timestamp' => now()->toIso8601String(),
            ],
            'links' => [
                'self' => url("/api/v1/setup/steps/{$step}"),
            ],
        ]);
    }

    public function complete(CompleteSetupAction $action): JsonResponse
    {
        $status = $action->execute();

        return response()->json([
            'data' => new SetupStatusResource($status),
            'meta' => [
                'timestamp' => now()->toIso8601String(),
            ],
            'links' => [
                'self' => url('/api/v1/setup/complete'),
            ],
        ]);
    }

    public function unlock(UnlockSetupSectionsRequest $request, UnlockSetupSectionsAction $action): JsonResponse
    {
        $actor = $request->user();
        abort_if($actor === null, 401, 'Unauthenticated.');

        /** @var list<string> $sections */
        $sections = $request->validated('sections');
        $reason = (string) $request->validated('reason');

        $status = $action->execute($actor, $sections, $reason, (string) $request->ip());

        return response()->json([
            'data' => new SetupStatusResource($status),
            'meta' => [
                'timestamp' => now()->toIso8601String(),
            ],
            'links' => [
                'self' => url('/api/v1/setup/unlock'),
            ],
        ]);
    }
}

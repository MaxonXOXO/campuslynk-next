<?php

declare(strict_types=1);

namespace App\Modules\Organisation\Http\Controllers;

use App\Modules\Identity\Services\ScopeAuthorizer;
use App\Modules\Organisation\Actions\CreateBatchAction;
use App\Modules\Organisation\Actions\PromoteBatchSemesterAction;
use App\Modules\Organisation\Http\Requests\CreateBatchRequest;
use App\Modules\Organisation\Http\Resources\BatchResource;
use App\Modules\Organisation\Models\Batch;
use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class BatchController
{
    public function __construct(
        protected ScopeAuthorizer $authorizer
    ) {}

    public function index(Request $request): JsonResponse
    {
        /** @var Authenticatable $user */
        $user = $request->user();

        $batches = Batch::visibleTo($user, 'organisation.batch.view')
            ->orderBy('name')
            ->paginate(25);

        return response()->json([
            'data' => BatchResource::collection($batches->items()),
            'meta' => [
                'current_page' => $batches->currentPage(),
                'last_page' => $batches->lastPage(),
                'per_page' => $batches->perPage(),
                'total' => $batches->total(),
            ],
            'links' => [
                'self' => $request->fullUrl(),
            ],
        ]);
    }

    public function store(CreateBatchRequest $request, CreateBatchAction $action): JsonResponse
    {
        $batch = $action->execute(
            programId: (string) $request->validated('program_id'),
            homeDepartmentId: (string) $request->validated('home_department_id'),
            academicYearId: (string) $request->validated('academic_year_id'),
            regulationId: (string) $request->validated('regulation_id'),
            name: (string) $request->validated('name'),
            entryType: (string) ($request->validated('entry_type') ?? 'regular'),
            currentSemester: (int) ($request->validated('current_semester') ?? 1)
        );

        return response()->json([
            'data' => new BatchResource($batch),
            'meta' => [
                'timestamp' => now()->toIso8601String(),
            ],
            'links' => [
                'self' => url("/api/v1/batches/{$batch->id}"),
            ],
        ], Response::HTTP_CREATED);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        /** @var Authenticatable $user */
        $user = $request->user();

        /** @var Batch $batch */
        $batch = Batch::findOrFail($id);

        if (! $this->authorizer->can($user, 'organisation.batch.view', $batch)) {
            return response()->json([
                'type' => 'https://api.academic-suite.com/errors/forbidden',
                'title' => 'Forbidden',
                'status' => 403,
                'detail' => 'You do not have permission to view this batch.',
            ], 403, ['Content-Type' => 'application/problem+json']);
        }

        return response()->json([
            'data' => new BatchResource($batch),
            'meta' => [
                'timestamp' => now()->toIso8601String(),
            ],
            'links' => [
                'self' => url("/api/v1/batches/{$batch->id}"),
            ],
        ]);
    }

    public function promote(Request $request, string $id, PromoteBatchSemesterAction $action): JsonResponse
    {
        /** @var Authenticatable $user */
        $user = $request->user();

        /** @var Batch $batch */
        $batch = Batch::findOrFail($id);

        if (! $this->authorizer->can($user, 'organisation.batch.promote_semester', $batch)) {
            return response()->json([
                'type' => 'https://api.academic-suite.com/errors/forbidden',
                'title' => 'Forbidden',
                'status' => 403,
                'detail' => 'You do not have permission to promote this batch.',
            ], 403, ['Content-Type' => 'application/problem+json']);
        }

        $promoted = $action->execute($batch);

        return response()->json([
            'data' => new BatchResource($promoted),
            'meta' => [
                'timestamp' => now()->toIso8601String(),
                'message' => "Batch successfully promoted to Semester {$promoted->current_semester}.",
            ],
            'links' => [
                'self' => url("/api/v1/batches/{$promoted->id}"),
            ],
        ]);
    }
}

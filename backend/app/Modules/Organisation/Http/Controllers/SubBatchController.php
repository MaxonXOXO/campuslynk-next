<?php

declare(strict_types=1);

namespace App\Modules\Organisation\Http\Controllers;

use App\Modules\Identity\Services\ScopeAuthorizer;
use App\Modules\Organisation\Models\Batch;
use App\Modules\Organisation\Models\SubBatch;
use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

class SubBatchController
{
    public function __construct(
        protected ScopeAuthorizer $authorizer
    ) {}

    public function index(Request $request, string $batchId): JsonResponse
    {
        /** @var Authenticatable $user */
        $user = $request->user();

        /** @var Batch $batch */
        $batch = Batch::findOrFail($batchId);

        if (! $this->authorizer->can($user, 'organisation.batch.view', $batch)) {
            return response()->json([
                'type' => 'https://api.academic-suite.com/errors/forbidden',
                'title' => 'Forbidden',
                'status' => 403,
                'detail' => 'You do not have permission to view sub-batches for this batch.',
            ], 403, ['Content-Type' => 'application/problem+json']);
        }

        $subBatches = SubBatch::where('batch_id', $batch->id)
            ->orderBy('name')
            ->get();

        return response()->json([
            'data' => $subBatches->map(fn (SubBatch $sb) => [
                'id' => $sb->id,
                'batch_id' => $sb->batch_id,
                'kind' => $sb->kind,
                'name' => $sb->name,
                'course_offering_id' => $sb->course_offering_id,
                'scope_label' => $sb->scope_label,
                'home_path' => $sb->home_path,
                'managing_path' => $sb->managing_path,
            ]),
            'meta' => [
                'total' => $subBatches->count(),
            ],
            'links' => [
                'self' => $request->fullUrl(),
            ],
        ]);
    }

    public function store(Request $request, string $batchId): JsonResponse
    {
        /** @var Authenticatable $user */
        $user = $request->user();

        /** @var Batch $batch */
        $batch = Batch::findOrFail($batchId);

        if (! $this->authorizer->can($user, 'organisation.batch.create', $batch)) {
            return response()->json([
                'type' => 'https://api.academic-suite.com/errors/forbidden',
                'title' => 'Forbidden',
                'status' => 403,
                'detail' => 'You do not have permission to create sub-batches for this batch.',
            ], 403, ['Content-Type' => 'application/problem+json']);
        }

        $validated = $request->validate([
            'kind' => ['required', 'string', 'in:lab,mentoring,workshop'],
            'name' => ['required', 'string', 'max:100'],
            'course_offering_id' => ['nullable', 'string', 'max:36'],
        ]);

        $randomSuffix = strtolower(Str::random(6));
        $cleanName = (string) preg_replace('/[^a-zA-Z0-9_]/', '_', strtolower((string) $validated['name']));
        $scopeLabel = 'sb_'.substr($cleanName, 0, 20).'_'.$randomSuffix;
        ScopeAuthorizer::validateScopeLabel($scopeLabel);

        $homePath = "{$batch->home_path}.{$scopeLabel}";
        $managingPath = "{$batch->managing_path}.{$scopeLabel}";

        /** @var SubBatch $subBatch */
        $subBatch = SubBatch::create([
            'batch_id' => $batch->id,
            'kind' => (string) $validated['kind'],
            'name' => (string) $validated['name'],
            'course_offering_id' => isset($validated['course_offering_id']) ? (string) $validated['course_offering_id'] : null,
            'scope_label' => $scopeLabel,
            'home_path' => $homePath,
            'managing_path' => $managingPath,
        ]);

        activity('organisation')
            ->performedOn($subBatch)
            ->causedBy((string) $user->getAuthIdentifier())
            ->log("Created sub-batch [{$subBatch->name}] for batch [{$batch->name}].");

        return response()->json([
            'data' => [
                'id' => $subBatch->id,
                'batch_id' => $subBatch->batch_id,
                'kind' => $subBatch->kind,
                'name' => $subBatch->name,
                'course_offering_id' => $subBatch->course_offering_id,
                'scope_label' => $subBatch->scope_label,
                'home_path' => $subBatch->home_path,
                'managing_path' => $subBatch->managing_path,
            ],
            'meta' => [
                'timestamp' => now()->toIso8601String(),
            ],
            'links' => [
                'self' => url("/api/v1/sub-batches/{$subBatch->id}"),
            ],
        ], Response::HTTP_CREATED);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        /** @var Authenticatable $user */
        $user = $request->user();

        /** @var SubBatch $subBatch */
        $subBatch = SubBatch::findOrFail($id);

        if (! $this->authorizer->can($user, 'organisation.batch.view', $subBatch)) {
            return response()->json([
                'type' => 'https://api.academic-suite.com/errors/forbidden',
                'title' => 'Forbidden',
                'status' => 403,
                'detail' => 'You do not have permission to view this sub-batch.',
            ], 403, ['Content-Type' => 'application/problem+json']);
        }

        return response()->json([
            'data' => [
                'id' => $subBatch->id,
                'batch_id' => $subBatch->batch_id,
                'kind' => $subBatch->kind,
                'name' => $subBatch->name,
                'course_offering_id' => $subBatch->course_offering_id,
                'scope_label' => $subBatch->scope_label,
                'home_path' => $subBatch->home_path,
                'managing_path' => $subBatch->managing_path,
            ],
            'meta' => [
                'timestamp' => now()->toIso8601String(),
            ],
            'links' => [
                'self' => url("/api/v1/sub-batches/{$subBatch->id}"),
            ],
        ]);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        /** @var Authenticatable $user */
        $user = $request->user();

        /** @var SubBatch $subBatch */
        $subBatch = SubBatch::findOrFail($id);

        if (! $this->authorizer->can($user, 'organisation.batch.create', $subBatch)) {
            return response()->json([
                'type' => 'https://api.academic-suite.com/errors/forbidden',
                'title' => 'Forbidden',
                'status' => 403,
                'detail' => 'You do not have permission to modify this sub-batch.',
            ], 403, ['Content-Type' => 'application/problem+json']);
        }

        $validated = $request->validate([
            'kind' => ['sometimes', 'string', 'in:lab,mentoring,workshop'],
            'name' => ['sometimes', 'string', 'max:100'],
            'course_offering_id' => ['nullable', 'string', 'max:36'],
        ]);

        $subBatch->fill($validated);
        $subBatch->save();

        activity('organisation')
            ->performedOn($subBatch)
            ->causedBy((string) $user->getAuthIdentifier())
            ->log("Updated sub-batch [{$subBatch->name}].");

        return response()->json([
            'data' => [
                'id' => $subBatch->id,
                'batch_id' => $subBatch->batch_id,
                'kind' => $subBatch->kind,
                'name' => $subBatch->name,
                'course_offering_id' => $subBatch->course_offering_id,
                'scope_label' => $subBatch->scope_label,
                'home_path' => $subBatch->home_path,
                'managing_path' => $subBatch->managing_path,
            ],
            'meta' => [
                'timestamp' => now()->toIso8601String(),
            ],
            'links' => [
                'self' => url("/api/v1/sub-batches/{$subBatch->id}"),
            ],
        ]);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        /** @var Authenticatable $user */
        $user = $request->user();

        /** @var SubBatch $subBatch */
        $subBatch = SubBatch::findOrFail($id);

        if (! $this->authorizer->can($user, 'organisation.batch.create', $subBatch)) {
            return response()->json([
                'type' => 'https://api.academic-suite.com/errors/forbidden',
                'title' => 'Forbidden',
                'status' => 403,
                'detail' => 'You do not have permission to delete this sub-batch.',
            ], 403, ['Content-Type' => 'application/problem+json']);
        }

        activity('organisation')
            ->performedOn($subBatch)
            ->causedBy((string) $user->getAuthIdentifier())
            ->log("Deleted sub-batch [{$subBatch->name}].");

        $subBatch->delete();

        return response()->json([
            'data' => [
                'message' => 'Sub-batch deleted successfully.',
            ],
            'meta' => [
                'timestamp' => now()->toIso8601String(),
            ],
        ]);
    }
}

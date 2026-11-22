<?php

declare(strict_types=1);

namespace App\Modules\Organisation\Http\Controllers;

use App\Modules\Organisation\Actions\CreateDepartmentAction;
use App\Modules\Organisation\Actions\DeleteDepartmentAction;
use App\Modules\Organisation\Actions\UpdateDepartmentAction;
use App\Modules\Organisation\Http\Requests\CreateDepartmentRequest;
use App\Modules\Organisation\Http\Requests\UpdateDepartmentRequest;
use App\Modules\Organisation\Http\Resources\DepartmentResource;
use App\Modules\Organisation\Models\Department;
use App\Modules\Organisation\Models\Stream;
use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Symfony\Component\HttpFoundation\Response;

class DepartmentController
{
    public function index(Request $request): JsonResponse
    {
        /** @var Authenticatable $caller */
        $caller = $request->user();
        $query = Department::visibleTo($caller, 'organisation.batch.view')->with('stream');

        if ($request->has('stream')) {
            $stream = (string) $request->query('stream');
            $query->whereHas('stream', function ($q) use ($stream): void {
                $q->where('code', $stream)->orWhere('id', $stream);
            });
        }

        if ($request->has('kind')) {
            $query->where('kind', (string) $request->query('kind'));
        }

        $departments = $query->whereRaw('is_active is true')->orderBy('code')->get();

        return response()->json([
            'data' => DepartmentResource::collection($departments),
            'meta' => [
                'total' => $departments->count(),
            ],
            'links' => [
                'self' => $request->fullUrl(),
            ],
        ]);
    }

    public function show(string $id): JsonResponse
    {
        $dept = Department::with('stream')->findOrFail($id);

        Gate::authorize('view', $dept);

        return response()->json([
            'data' => new DepartmentResource($dept),
            'links' => [
                'self' => url("/api/v1/departments/{$dept->id}"),
            ],
        ]);
    }

    public function store(CreateDepartmentRequest $request, CreateDepartmentAction $action): JsonResponse
    {
        $validated = $request->validated();
        $stream = Stream::findOrFail((string) $validated['stream_id']);

        Gate::authorize('create', [Department::class, $stream]);

        $dept = $action->execute(
            code: (string) $validated['code'],
            name: (string) $validated['name'],
            streamId: (string) $validated['stream_id'],
            kind: (string) ($validated['kind'] ?? 'academic')
        );

        $dept->load('stream');

        return response()->json([
            'data' => new DepartmentResource($dept),
            'links' => [
                'self' => url("/api/v1/departments/{$dept->id}"),
            ],
        ], Response::HTTP_CREATED);
    }

    public function update(UpdateDepartmentRequest $request, string $id, UpdateDepartmentAction $action): JsonResponse
    {
        /** @var Department $dept */
        $dept = Department::with('stream')->findOrFail($id);

        Gate::authorize('update', $dept);

        /** @var array{name?: string, kind?: string, is_active?: bool} $validated */
        $validated = $request->validated();

        $updated = $action->execute($dept, $validated);
        $updated->load('stream');

        return response()->json([
            'data' => new DepartmentResource($updated),
            'links' => [
                'self' => url("/api/v1/departments/{$updated->id}"),
            ],
        ]);
    }

    public function destroy(string $id, DeleteDepartmentAction $action): JsonResponse
    {
        /** @var Department $dept */
        $dept = Department::findOrFail($id);

        Gate::authorize('delete', $dept);

        $action->execute($dept);

        return response()->json([
            'data' => [
                'message' => 'Department deleted successfully.',
            ],
            'meta' => [
                'timestamp' => now()->toIso8601String(),
            ],
        ]);
    }
}

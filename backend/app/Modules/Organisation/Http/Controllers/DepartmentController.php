<?php

declare(strict_types=1);

namespace App\Modules\Organisation\Http\Controllers;

use App\Modules\Organisation\Actions\CreateDepartmentAction;
use App\Modules\Organisation\Actions\UpdateDepartmentAction;
use App\Modules\Organisation\Http\Resources\DepartmentResource;
use App\Modules\Organisation\Models\Department;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class DepartmentController
{
    public function index(Request $request): JsonResponse
    {
        $query = Department::query();

        if ($request->has('stream')) {
            $query->where('funding_stream', (string) $request->query('stream'));
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
        $dept = Department::findOrFail($id);

        return response()->json([
            'data' => new DepartmentResource($dept),
            'links' => [
                'self' => url("/api/v1/departments/{$dept->id}"),
            ],
        ]);
    }

    public function store(Request $request, CreateDepartmentAction $action): JsonResponse
    {
        $validated = $request->validate([
            'code' => ['required', 'string', 'max:16'],
            'name' => ['required', 'string', 'max:255'],
            'stream_id' => ['required', 'string', 'max:36'],
            'funding_stream' => ['required', 'string', 'in:AIDED,SF,SHARED'],
            'kind' => ['nullable', 'string', 'in:academic,general,administrative'],
        ]);

        $dept = $action->execute(
            code: (string) $validated['code'],
            name: (string) $validated['name'],
            streamId: (string) $validated['stream_id'],
            fundingStream: (string) $validated['funding_stream'],
            kind: (string) ($validated['kind'] ?? 'academic')
        );

        return response()->json([
            'data' => new DepartmentResource($dept),
            'links' => [
                'self' => url("/api/v1/departments/{$dept->id}"),
            ],
        ], Response::HTTP_CREATED);
    }

    public function update(Request $request, string $id, UpdateDepartmentAction $action): JsonResponse
    {
        /** @var Department $dept */
        $dept = Department::findOrFail($id);

        $validated = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'kind' => ['sometimes', 'string', 'in:academic,general,administrative'],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        $updated = $action->execute($dept, $validated);

        return response()->json([
            'data' => new DepartmentResource($updated),
            'links' => [
                'self' => url("/api/v1/departments/{$updated->id}"),
            ],
        ]);
    }
}

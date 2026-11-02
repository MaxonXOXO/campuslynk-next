<?php

declare(strict_types=1);

namespace App\Modules\Organisation\Http\Controllers;

use App\Modules\Organisation\Actions\CreateProgramAction;
use App\Modules\Organisation\Actions\UpdateProgramAction;
use App\Modules\Organisation\Models\Program;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class ProgramController
{
    public function index(Request $request): JsonResponse
    {
        $query = Program::query();

        if ($request->has('department_id')) {
            $query->where('department_id', (string) $request->query('department_id'));
        }

        $programs = $query->orderBy('code')->get();

        return response()->json([
            'data' => $programs->map(fn (Program $p) => [
                'id' => $p->id,
                'department_id' => $p->department_id,
                'code' => $p->code,
                'name' => $p->name,
                'duration_semesters' => $p->duration_semesters,
                'scope_label' => $p->scope_label,
            ]),
            'meta' => [
                'total' => $programs->count(),
            ],
            'links' => [
                'self' => $request->fullUrl(),
            ],
        ]);
    }

    public function show(string $id): JsonResponse
    {
        /** @var Program $program */
        $program = Program::findOrFail($id);

        return response()->json([
            'data' => [
                'id' => $program->id,
                'department_id' => $program->department_id,
                'code' => $program->code,
                'name' => $program->name,
                'duration_semesters' => $program->duration_semesters,
                'scope_label' => $program->scope_label,
            ],
            'links' => [
                'self' => url("/api/v1/programs/{$program->id}"),
            ],
        ]);
    }

    public function store(Request $request, CreateProgramAction $action): JsonResponse
    {
        $validated = $request->validate([
            'department_id' => ['required', 'string', 'max:36'],
            'code' => ['required', 'string', 'max:16'],
            'name' => ['required', 'string', 'max:255'],
            'duration_semesters' => ['nullable', 'integer', 'min:1', 'max:12'],
        ]);

        $program = $action->execute(
            departmentId: (string) $validated['department_id'],
            code: (string) $validated['code'],
            name: (string) $validated['name'],
            durationSemesters: (int) ($validated['duration_semesters'] ?? 6)
        );

        return response()->json([
            'data' => [
                'id' => $program->id,
                'department_id' => $program->department_id,
                'code' => $program->code,
                'name' => $program->name,
                'duration_semesters' => $program->duration_semesters,
                'scope_label' => $program->scope_label,
            ],
            'links' => [
                'self' => url("/api/v1/programs/{$program->id}"),
            ],
        ], Response::HTTP_CREATED);
    }

    public function update(Request $request, string $id, UpdateProgramAction $action): JsonResponse
    {
        /** @var Program $program */
        $program = Program::findOrFail($id);

        $validated = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'duration_semesters' => ['sometimes', 'integer', 'min:1', 'max:12'],
        ]);

        $updated = $action->execute($program, $validated);

        return response()->json([
            'data' => [
                'id' => $updated->id,
                'department_id' => $updated->department_id,
                'code' => $updated->code,
                'name' => $updated->name,
                'duration_semesters' => $updated->duration_semesters,
                'scope_label' => $updated->scope_label,
            ],
            'links' => [
                'self' => url("/api/v1/programs/{$updated->id}"),
            ],
        ]);
    }
}

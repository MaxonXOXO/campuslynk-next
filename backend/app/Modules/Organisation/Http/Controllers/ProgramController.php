<?php

declare(strict_types=1);

namespace App\Modules\Organisation\Http\Controllers;

use App\Modules\Organisation\Models\Program;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

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
}

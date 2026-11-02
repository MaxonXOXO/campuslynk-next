<?php

declare(strict_types=1);

namespace App\Modules\Organisation\Http\Controllers;

use App\Modules\Organisation\Actions\CreateAcademicYearAction;
use App\Modules\Organisation\Actions\UpdateAcademicYearAction;
use App\Modules\Organisation\Models\AcademicYear;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class AcademicYearController
{
    public function index(Request $request): JsonResponse
    {
        $query = AcademicYear::query();

        if ($request->boolean('current_only')) {
            $query->whereRaw('is_current is true');
        }

        $years = $query->orderByDesc('start_date')->get();

        return response()->json([
            'data' => $years->map(fn (AcademicYear $y) => [
                'id' => $y->id,
                'label' => $y->label,
                'start_date' => $y->start_date->toDateString(),
                'end_date' => $y->end_date->toDateString(),
                'is_current' => (bool) $y->is_current,
            ]),
            'meta' => [
                'total' => $years->count(),
            ],
            'links' => [
                'self' => $request->fullUrl(),
            ],
        ]);
    }

    public function show(string $id): JsonResponse
    {
        /** @var AcademicYear $year */
        $year = AcademicYear::findOrFail($id);

        return response()->json([
            'data' => [
                'id' => $year->id,
                'label' => $year->label,
                'start_date' => $year->start_date->toDateString(),
                'end_date' => $year->end_date->toDateString(),
                'is_current' => (bool) $year->is_current,
            ],
            'links' => [
                'self' => url("/api/v1/academic-years/{$year->id}"),
            ],
        ]);
    }

    public function store(Request $request, CreateAcademicYearAction $action): JsonResponse
    {
        $validated = $request->validate([
            'label' => ['required', 'string', 'max:32'],
            'start_date' => ['required', 'date'],
            'end_date' => ['required', 'date', 'after:start_date'],
            'is_current' => ['nullable', 'boolean'],
        ]);

        $year = $action->execute(
            label: (string) $validated['label'],
            startDate: Carbon::parse((string) $validated['start_date']),
            endDate: Carbon::parse((string) $validated['end_date']),
            isCurrent: (bool) ($validated['is_current'] ?? false)
        );

        return response()->json([
            'data' => [
                'id' => $year->id,
                'label' => $year->label,
                'start_date' => $year->start_date->toDateString(),
                'end_date' => $year->end_date->toDateString(),
                'is_current' => (bool) $year->is_current,
            ],
            'links' => [
                'self' => url("/api/v1/academic-years/{$year->id}"),
            ],
        ], Response::HTTP_CREATED);
    }

    public function update(Request $request, string $id, UpdateAcademicYearAction $action): JsonResponse
    {
        /** @var AcademicYear $year */
        $year = AcademicYear::findOrFail($id);

        $validated = $request->validate([
            'label' => ['sometimes', 'string', 'max:32'],
            'start_date' => ['sometimes', 'date'],
            'end_date' => ['sometimes', 'date', 'after:start_date'],
            'is_current' => ['sometimes', 'boolean'],
        ]);

        /** @var array{label?: string, start_date?: Carbon, end_date?: Carbon, is_current?: bool} $data */
        $data = [];
        if (isset($validated['label'])) {
            $data['label'] = (string) $validated['label'];
        }
        if (isset($validated['start_date'])) {
            $data['start_date'] = Carbon::parse((string) $validated['start_date']);
        }
        if (isset($validated['end_date'])) {
            $data['end_date'] = Carbon::parse((string) $validated['end_date']);
        }
        if (isset($validated['is_current'])) {
            $data['is_current'] = (bool) $validated['is_current'];
        }

        $updated = $action->execute($year, $data);

        return response()->json([
            'data' => [
                'id' => $updated->id,
                'label' => $updated->label,
                'start_date' => $updated->start_date->toDateString(),
                'end_date' => $updated->end_date->toDateString(),
                'is_current' => (bool) $updated->is_current,
            ],
            'links' => [
                'self' => url("/api/v1/academic-years/{$updated->id}"),
            ],
        ]);
    }
}

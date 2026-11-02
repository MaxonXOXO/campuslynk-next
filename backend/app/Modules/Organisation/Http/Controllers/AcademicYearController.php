<?php

declare(strict_types=1);

namespace App\Modules\Organisation\Http\Controllers;

use App\Modules\Organisation\Models\AcademicYear;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

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
}

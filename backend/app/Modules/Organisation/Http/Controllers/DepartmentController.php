<?php

declare(strict_types=1);

namespace App\Modules\Organisation\Http\Controllers;

use App\Modules\Organisation\Http\Resources\DepartmentResource;
use App\Modules\Organisation\Models\Department;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

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
}

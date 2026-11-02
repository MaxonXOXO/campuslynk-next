<?php

declare(strict_types=1);

namespace App\Modules\Organisation\Http\Controllers;

use App\Modules\Organisation\Models\WorkshopSection;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class WorkshopSectionController
{
    public function index(Request $request): JsonResponse
    {
        $sections = WorkshopSection::orderBy('code')->get();

        return response()->json([
            'data' => $sections->map(fn (WorkshopSection $s) => [
                'id' => $s->id,
                'code' => $s->code,
                'name' => $s->name,
                'scope_label' => $s->scope_label,
            ]),
            'meta' => [
                'total' => $sections->count(),
            ],
            'links' => [
                'self' => $request->fullUrl(),
            ],
        ]);
    }
}

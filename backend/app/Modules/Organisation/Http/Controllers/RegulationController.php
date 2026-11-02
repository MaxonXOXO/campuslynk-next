<?php

declare(strict_types=1);

namespace App\Modules\Organisation\Http\Controllers;

use App\Modules\Organisation\Models\Regulation;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class RegulationController
{
    public function index(Request $request): JsonResponse
    {
        $regulations = Regulation::orderByDesc('effective_from_year')->get();

        return response()->json([
            'data' => $regulations->map(fn (Regulation $r) => [
                'id' => $r->id,
                'code' => $r->code,
                'name' => $r->name,
                'effective_from_year' => $r->effective_from_year,
                'config' => $r->config_json,
            ]),
            'meta' => [
                'total' => $regulations->count(),
            ],
            'links' => [
                'self' => $request->fullUrl(),
            ],
        ]);
    }
}

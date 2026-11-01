<?php

use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function () {
    Route::get('/health', function (): JsonResponse {
        return response()->json([
            'data' => [
                'status' => 'ok',
            ],
            'meta' => [
                'timestamp' => now()->toIso8601String(),
                'version' => '1.0.0',
            ],
            'links' => [
                'self' => url('/api/v1/health'),
            ],
        ]);
    })->name('api.v1.health');
});

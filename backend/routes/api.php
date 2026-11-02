<?php

declare(strict_types=1);

use App\Core\Http\Controllers\MetaController;
use App\Modules\Identity\Http\Controllers\AuthController;
use App\Modules\Identity\Http\Controllers\MeController;
use App\Modules\Identity\Middleware\EnsurePasswordNotMustChange;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function (): void {
    // Public Endpoints
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

    Route::get('/meta', MetaController::class)->name('api.v1.meta');

    // Public Authentication
    Route::post('/auth/login', [AuthController::class, 'login'])->name('api.v1.auth.login');

    // Authenticated Routes (Sanctum)
    Route::middleware('auth:sanctum')->group(function (): void {
        Route::post('/auth/logout', [AuthController::class, 'logout'])->name('api.v1.auth.logout');
        Route::post('/auth/password/change', [AuthController::class, 'changePassword'])->name('api.v1.auth.password.change');

        // Authenticated routes requiring must_change_password to be false
        Route::middleware(EnsurePasswordNotMustChange::class)->group(function (): void {
            Route::get('/me', MeController::class)->name('api.v1.me');
        });
    });
});

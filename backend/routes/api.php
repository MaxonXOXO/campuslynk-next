<?php

declare(strict_types=1);

use App\Core\Http\Controllers\MetaController;
use App\Modules\Identity\Http\Controllers\AuthController;
use App\Modules\Identity\Http\Controllers\ImpersonationController;
use App\Modules\Identity\Http\Controllers\MeController;
use App\Modules\Identity\Http\Controllers\RoleAssignmentController;
use App\Modules\Identity\Http\Controllers\UserController;
use App\Modules\Identity\Middleware\EnforceImpersonationRestrictions;
use App\Modules\Identity\Middleware\EnsurePasswordNotMustChange;
use App\Modules\Identity\Middleware\RequirePermission;
use App\Modules\Organisation\Http\Controllers\BatchController;
use App\Modules\Organisation\Http\Controllers\DepartmentController;
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

        // Authenticated routes requiring must_change_password to be false and respecting impersonation safety
        Route::middleware([EnsurePasswordNotMustChange::class, EnforceImpersonationRestrictions::class])->group(function (): void {
            Route::get('/me', MeController::class)->name('api.v1.me');

            // Impersonation
            Route::post('/impersonation', [ImpersonationController::class, 'start'])
                ->middleware(RequirePermission::class.':identity.user.impersonate')
                ->name('api.v1.impersonation.start');
            Route::post('/impersonation/stop', [ImpersonationController::class, 'stop'])
                ->name('api.v1.impersonation.stop');

            // Identity: User Directory & Management
            Route::get('/users', [UserController::class, 'index'])
                ->middleware(RequirePermission::class.':identity.user.view')
                ->name('api.v1.users.index');
            Route::post('/users', [UserController::class, 'store'])
                ->middleware(RequirePermission::class.':identity.user.create')
                ->name('api.v1.users.store');
            Route::get('/users/{id}', [UserController::class, 'show'])
                ->middleware(RequirePermission::class.':identity.user.view')
                ->name('api.v1.users.show');
            Route::put('/users/{id}', [UserController::class, 'update'])
                ->middleware(RequirePermission::class.':identity.user.update')
                ->name('api.v1.users.update');

            // Identity: Scoped Roles & Delegation
            Route::get('/roles', [RoleAssignmentController::class, 'index'])
                ->middleware(RequirePermission::class.':identity.role.assign')
                ->name('api.v1.roles.index');
            Route::post('/roles/assign', [RoleAssignmentController::class, 'assign'])
                ->middleware(RequirePermission::class.':identity.role.assign')
                ->name('api.v1.roles.assign');
            Route::post('/roles/revoke', [RoleAssignmentController::class, 'revoke'])
                ->middleware(RequirePermission::class.':identity.role.assign')
                ->name('api.v1.roles.revoke');

            // Organisation: Departments
            Route::get('/departments', [DepartmentController::class, 'index'])
                ->middleware(RequirePermission::class.':organisation.batch.view')
                ->name('api.v1.departments.index');

            // Organisation: Batches
            Route::get('/batches', [BatchController::class, 'index'])
                ->middleware(RequirePermission::class.':organisation.batch.view')
                ->name('api.v1.batches.index');
            Route::post('/batches', [BatchController::class, 'store'])
                ->middleware(RequirePermission::class.':organisation.batch.create')
                ->name('api.v1.batches.store');
            Route::get('/batches/{id}', [BatchController::class, 'show'])
                ->middleware(RequirePermission::class.':organisation.batch.view')
                ->name('api.v1.batches.show');
            Route::post('/batches/{id}/promote', [BatchController::class, 'promote'])
                ->middleware(RequirePermission::class.':organisation.batch.promote_semester')
                ->name('api.v1.batches.promote');
        });
    });
});

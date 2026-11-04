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
use App\Modules\Identity\Middleware\EnsureSuperAdminAtInstitutionScope;
use App\Modules\Identity\Middleware\RequirePermission;
use App\Modules\Organisation\Http\Controllers\AcademicYearController;
use App\Modules\Organisation\Http\Controllers\BatchController;
use App\Modules\Organisation\Http\Controllers\DepartmentController;
use App\Modules\Organisation\Http\Controllers\GovernanceRuleController;
use App\Modules\Organisation\Http\Controllers\ProgramController;
use App\Modules\Organisation\Http\Controllers\RegulationController;
use App\Modules\Organisation\Http\Controllers\SetupController;
use App\Modules\Organisation\Http\Controllers\StreamController;
use App\Modules\Organisation\Http\Controllers\SubBatchController;
use App\Modules\Organisation\Http\Controllers\WorkshopSectionController;
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

            // Setup Wizard (Super Admin at institution scope)
            Route::middleware(EnsureSuperAdminAtInstitutionScope::class)->prefix('setup')->group(function (): void {
                Route::get('/status', [SetupController::class, 'status'])->name('api.v1.setup.status');
                Route::put('/steps/{step}', [SetupController::class, 'saveStep'])->name('api.v1.setup.steps.save');
                Route::post('/complete', [SetupController::class, 'complete'])->name('api.v1.setup.complete');
            });

            if (app()->environment('testing')) {
                // Route flagged as having side-effects on GET (must be blocked while impersonating)
                Route::get('/test/side-effect-action', function (): JsonResponse {
                    return response()->json([
                        'data' => [
                            'executed' => true,
                        ],
                    ]);
                })->middleware([RequirePermission::class.':identity.user.view', 'without_impersonation'])->name('api.v1.test.side-effect');
            }

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
            Route::post('/users/{id}/unlock', [UserController::class, 'unlock'])
                ->middleware(RequirePermission::class.':identity.user.unlock')
                ->name('api.v1.users.unlock');
            Route::post('/users/{id}/suspend', [UserController::class, 'suspend'])
                ->middleware(RequirePermission::class.':identity.user.suspend')
                ->name('api.v1.users.suspend');
            Route::post('/users/{id}/reactivate', [UserController::class, 'reactivate'])
                ->middleware(RequirePermission::class.':identity.user.suspend')
                ->name('api.v1.users.reactivate');

            // Identity: Scoped Roles & Delegation
            Route::get('/roles', [RoleAssignmentController::class, 'index'])
                ->middleware(RequirePermission::class.':identity.role.assign')
                ->name('api.v1.roles.index');

            Route::get('/role-assignments', [RoleAssignmentController::class, 'listAssignments'])
                ->middleware(RequirePermission::class.':identity.role.assign')
                ->name('api.v1.role-assignments.index');
            Route::post('/role-assignments', [RoleAssignmentController::class, 'assign'])
                ->middleware(RequirePermission::class.':identity.role.assign')
                ->name('api.v1.role-assignments.store');
            Route::delete('/role-assignments/{id}', [RoleAssignmentController::class, 'destroy'])
                ->middleware(RequirePermission::class.':identity.role.assign')
                ->name('api.v1.role-assignments.destroy');

            // Organisation: Lookups & Structural CRUD
            Route::get('/programs', [ProgramController::class, 'index'])
                ->middleware(RequirePermission::class.':organisation.batch.view')
                ->name('api.v1.programs.index');
            Route::post('/programs', [ProgramController::class, 'store'])
                ->middleware(RequirePermission::class.':organisation.department.manage')
                ->name('api.v1.programs.store');
            Route::get('/programs/{id}', [ProgramController::class, 'show'])
                ->middleware(RequirePermission::class.':organisation.batch.view')
                ->name('api.v1.programs.show');
            Route::put('/programs/{id}', [ProgramController::class, 'update'])
                ->middleware(RequirePermission::class.':organisation.department.manage')
                ->name('api.v1.programs.update');

            Route::get('/academic-years', [AcademicYearController::class, 'index'])
                ->middleware(RequirePermission::class.':organisation.batch.view')
                ->name('api.v1.academic-years.index');
            Route::post('/academic-years', [AcademicYearController::class, 'store'])
                ->middleware(RequirePermission::class.':organisation.academic_calendar.manage')
                ->name('api.v1.academic-years.store');
            Route::get('/academic-years/{id}', [AcademicYearController::class, 'show'])
                ->middleware(RequirePermission::class.':organisation.batch.view')
                ->name('api.v1.academic-years.show');
            Route::put('/academic-years/{id}', [AcademicYearController::class, 'update'])
                ->middleware(RequirePermission::class.':organisation.academic_calendar.manage')
                ->name('api.v1.academic-years.update');

            Route::get('/regulations', [RegulationController::class, 'index'])
                ->middleware(RequirePermission::class.':organisation.batch.view')
                ->name('api.v1.regulations.index');
            Route::get('/workshop-sections', [WorkshopSectionController::class, 'index'])
                ->middleware(RequirePermission::class.':organisation.batch.view')
                ->name('api.v1.workshop-sections.index');

            // Organisation: Streams
            Route::get('/streams', [StreamController::class, 'index'])
                ->middleware(RequirePermission::class.':organisation.batch.view')
                ->name('api.v1.streams.index');
            Route::post('/streams', [StreamController::class, 'store'])
                ->middleware(RequirePermission::class.':organisation.stream.manage')
                ->name('api.v1.streams.store');
            Route::patch('/streams/{id}', [StreamController::class, 'update'])
                ->middleware(RequirePermission::class.':organisation.stream.manage')
                ->name('api.v1.streams.update');
            Route::delete('/streams/{id}', [StreamController::class, 'destroy'])
                ->middleware(RequirePermission::class.':organisation.stream.manage')
                ->name('api.v1.streams.destroy');

            // Organisation: Departments
            Route::get('/departments', [DepartmentController::class, 'index'])
                ->middleware(RequirePermission::class.':organisation.batch.view')
                ->name('api.v1.departments.index');
            Route::post('/departments', [DepartmentController::class, 'store'])
                ->middleware(RequirePermission::class.':organisation.department.manage')
                ->name('api.v1.departments.store');
            Route::get('/departments/{id}', [DepartmentController::class, 'show'])
                ->middleware(RequirePermission::class.':organisation.batch.view')
                ->name('api.v1.departments.show');
            Route::put('/departments/{id}', [DepartmentController::class, 'update'])
                ->middleware(RequirePermission::class.':organisation.department.manage')
                ->name('api.v1.departments.update');

            // Organisation: Governance Rules
            Route::get('/governance-rules', [GovernanceRuleController::class, 'index'])
                ->middleware(RequirePermission::class.':organisation.department.manage')
                ->name('api.v1.governance-rules.index');
            Route::put('/governance-rules/{id}', [GovernanceRuleController::class, 'update'])
                ->middleware(RequirePermission::class.':organisation.department.manage')
                ->name('api.v1.governance-rules.update');

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
            Route::put('/batches/{id}', [BatchController::class, 'update'])
                ->middleware(RequirePermission::class.':organisation.batch.create')
                ->name('api.v1.batches.update');
            Route::post('/batches/{id}/promote', [BatchController::class, 'promote'])
                ->middleware(RequirePermission::class.':organisation.batch.promote_semester')
                ->name('api.v1.batches.promote');

            // Organisation: Sub-Batches CRUD
            Route::get('/batches/{batchId}/sub-batches', [SubBatchController::class, 'index'])
                ->middleware(RequirePermission::class.':organisation.batch.view')
                ->name('api.v1.batches.sub-batches.index');
            Route::post('/batches/{batchId}/sub-batches', [SubBatchController::class, 'store'])
                ->middleware(RequirePermission::class.':organisation.batch.create')
                ->name('api.v1.batches.sub-batches.store');
            Route::get('/sub-batches/{id}', [SubBatchController::class, 'show'])
                ->middleware(RequirePermission::class.':organisation.batch.view')
                ->name('api.v1.sub-batches.show');
            Route::put('/sub-batches/{id}', [SubBatchController::class, 'update'])
                ->middleware(RequirePermission::class.':organisation.batch.create')
                ->name('api.v1.sub-batches.update');
            Route::delete('/sub-batches/{id}', [SubBatchController::class, 'destroy'])
                ->middleware(RequirePermission::class.':organisation.batch.create')
                ->name('api.v1.sub-batches.destroy');
        });
    });
});

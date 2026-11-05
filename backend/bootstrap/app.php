<?php

use App\Core\Modules\Middleware\EnforceModuleLicense;
use App\Core\Tenancy\Middleware\ResolveTenant;
use App\Modules\Identity\Middleware\EnforceImpersonationRestrictions;
use App\Modules\Identity\Middleware\EnsurePasswordNotMustChange;
use App\Modules\Identity\Middleware\EnsureSuperAdminAtInstitutionScope;
use App\Modules\Identity\Middleware\RequirePermission;
use App\Modules\Identity\Middleware\WithoutImpersonation;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->api(prepend: [
            ResolveTenant::class,
        ]);

        $middleware->alias([
            'without_impersonation' => WithoutImpersonation::class,
            'require_permission' => RequirePermission::class,
            'module' => EnforceModuleLicense::class,
            'require_module' => EnforceModuleLicense::class,
        ]);

        $middleware->priority([
            ResolveTenant::class,
            EnforceModuleLicense::class,
            EnsurePasswordNotMustChange::class,
            EnsureSuperAdminAtInstitutionScope::class,
            EnforceImpersonationRestrictions::class,
            RequirePermission::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        //
    })->create();

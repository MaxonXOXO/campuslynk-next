<?php

declare(strict_types=1);

use App\Core\Modules\ModuleRegistry;
use App\Modules\Identity\Middleware\EnsureSuperAdminAtInstitutionScope;
use App\Modules\Identity\Middleware\RequirePermission;
use Illuminate\Routing\Route as RouteItem;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Str;
use Symfony\Component\Process\Process;
use Tests\TestCase;

uses(TestCase::class);

$originalRoutes = null;

beforeEach(function () use (&$originalRoutes) {
    if ($originalRoutes === null) {
        $originalRoutes = clone Route::getRoutes();
    }
});

afterEach(function () use (&$originalRoutes) {
    if ($originalRoutes !== null) {
        $restored = clone $originalRoutes;
        $restored->refreshNameLookups();
        $restored->refreshActionLookups();
        Route::setRoutes($restored);
    }
});

const PUBLIC_ALLOW_LIST = [
    '/up',
    '/api/v1/health',
    '/api/v1/meta',
    '/api/v1/auth/login',
];

const SELF_SERVICE_EXEMPTIONS = [
    '/api/v1/auth/logout',
    '/api/v1/auth/password/change',
    '/api/v1/me',
    '/api/v1/impersonation/stop',
];

it('enforces that every registered route is either protected by auth:sanctum or explicitly allow-listed', function () {
    /** @var array<RouteItem> $routes */
    $routes = Route::getRoutes()->getRoutes();

    $unprotectedRoutes = [];

    foreach ($routes as $route) {
        $uri = '/'.ltrim($route->uri(), '/');

        // Check if route is in the explicit public allow-list
        if (in_array($uri, PUBLIC_ALLOW_LIST, true)) {
            continue;
        }

        // Check if route gathers auth:sanctum middleware
        $middleware = $route->gatherMiddleware();
        if (! in_array('auth:sanctum', $middleware, true)) {
            $unprotectedRoutes[] = sprintf('[%s] %s (middleware: %s)', implode('|', $route->methods()), $uri, implode(',', $middleware));
        }
    }

    expect($unprotectedRoutes)->toBeEmpty(
        'Found routes that are neither protected by auth:sanctum nor on the public allow-list:'.PHP_EOL.implode(PHP_EOL, $unprotectedRoutes)
    );
});

it('fails the route audit when a new unprotected route is added (negative test)', function () {
    // Dynamically register a rogue unprotected route
    Route::get('/api/v1/rogue-endpoint', fn () => response()->json(['rogue' => true]));

    /** @var array<RouteItem> $routes */
    $routes = Route::getRoutes()->getRoutes();

    $unprotectedRoutes = [];

    foreach ($routes as $route) {
        $uri = '/'.ltrim($route->uri(), '/');

        if (in_array($uri, PUBLIC_ALLOW_LIST, true)) {
            continue;
        }

        $middleware = $route->gatherMiddleware();
        if (! in_array('auth:sanctum', $middleware, true)) {
            $unprotectedRoutes[] = $uri;
        }
    }

    expect($unprotectedRoutes)->toContain('/api/v1/rogue-endpoint');
});

it('enforces that every authenticated feature route declares explicit permission middleware', function () {
    /** @var array<RouteItem> $routes */
    $routes = Route::getRoutes()->getRoutes();

    $unpermissionedRoutes = [];

    foreach ($routes as $route) {
        $uri = '/'.ltrim($route->uri(), '/');

        if (in_array($uri, PUBLIC_ALLOW_LIST, true) || in_array($uri, SELF_SERVICE_EXEMPTIONS, true)) {
            continue;
        }

        $middleware = $route->gatherMiddleware();
        $hasPermission = false;
        foreach ($middleware as $m) {
            if (is_string($m) && (
                str_starts_with($m, RequirePermission::class)
                || str_starts_with($m, 'can:')
                || str_starts_with($m, 'permission:')
                || $m === EnsureSuperAdminAtInstitutionScope::class
            )) {
                $hasPermission = true;
                break;
            }
        }

        if (! $hasPermission) {
            $unpermissionedRoutes[] = sprintf('[%s] %s', implode('|', $route->methods()), $uri);
        }
    }

    expect($unpermissionedRoutes)->toBeEmpty(
        'Found authenticated feature routes that do not declare explicit permission middleware:'.PHP_EOL.implode(PHP_EOL, $unpermissionedRoutes)
    );
});

it('fails the route audit when an authenticated feature route lacks permission middleware (negative test)', function () {
    Route::middleware('auth:sanctum')->get('/api/v1/unpermissioned-rogue-route', fn () => response()->json(['rogue' => true]));

    /** @var array<RouteItem> $routes */
    $routes = Route::getRoutes()->getRoutes();

    $unpermissionedRoutes = [];

    foreach ($routes as $route) {
        $uri = '/'.ltrim($route->uri(), '/');

        if (in_array($uri, PUBLIC_ALLOW_LIST, true) || in_array($uri, SELF_SERVICE_EXEMPTIONS, true)) {
            continue;
        }

        $middleware = $route->gatherMiddleware();
        $hasPermission = false;
        foreach ($middleware as $m) {
            if (is_string($m) && (
                str_starts_with($m, RequirePermission::class)
                || str_starts_with($m, 'can:')
                || str_starts_with($m, 'permission:')
                || $m === EnsureSuperAdminAtInstitutionScope::class
            )) {
                $hasPermission = true;
                break;
            }
        }

        if (! $hasPermission) {
            $unpermissionedRoutes[] = $uri;
        }
    }

    expect($unpermissionedRoutes)->toContain('/api/v1/unpermissioned-rogue-route');
});

it('verifies that no test route is registered outside the testing environment', function () {
    // 1. Inspect route definition file(s): any test route must be protected inside an environment('testing') check
    $apiRoutesFile = file_get_contents(base_path('routes/api.php'));
    expect($apiRoutesFile)->not->toBeFalse();
    expect($apiRoutesFile)->toContain("app()->environment('testing')");

    // 2. Execute route:list in an isolated process with APP_ENV=production
    $process = new Process([
        PHP_BINARY,
        base_path('artisan'),
        'route:list',
        '--path=api/v1',
        '--json',
    ], base_path(), [
        'APP_ENV' => 'production',
        'APP_KEY' => 'base64:4s8x9d7G1H0JkL2m3n4o5p6q7r8s9t0u1v2w3x4y5zA=',
    ]);

    $process->mustRun();
    /** @var array<int, array{uri?: string}> $routes */
    $routes = json_decode($process->getOutput(), true, 512, JSON_THROW_ON_ERROR);

    $testRoutes = array_filter($routes, function (array $route): bool {
        $uri = $route['uri'] ?? '';

        return str_contains($uri, 'test/');
    });

    expect($testRoutes)->toBeEmpty(
        'Expected zero test/ routes in production route table, but found: '.json_encode($testRoutes)
    );
});

it('enforces that every route belonging to a non-core module carries module licence middleware', function () {
    /** @var array<RouteItem> $routes */
    $routes = Route::getRoutes()->getRoutes();
    $moduleRegistry = app(ModuleRegistry::class);

    $violatingRoutes = [];

    foreach ($routes as $route) {
        $action = $route->getAction();
        $controller = is_string($action['uses'] ?? null) ? $action['uses'] : '';

        // Check if controller is in a module
        if (preg_match('/^App\\\\Modules\\\\([A-Za-z0-9]+)\\\\/', $controller, $matches)) {
            $moduleName = $matches[1];
            $moduleSlug = Str::snake($moduleName);

            // Skip core modules (identity, organisation)
            if ($moduleRegistry->isCore($moduleSlug)) {
                continue;
            }

            // Check if route has module middleware
            $middleware = $route->gatherMiddleware();
            $hasModuleMiddleware = false;
            foreach ($middleware as $m) {
                if (is_string($m) && (
                    $m === "module:{$moduleSlug}" ||
                    $m === "require_module:{$moduleSlug}" ||
                    str_starts_with($m, "module:{$moduleSlug}") ||
                    str_starts_with($m, "require_module:{$moduleSlug}")
                )) {
                    $hasModuleMiddleware = true;
                    break;
                }
            }

            if (! $hasModuleMiddleware) {
                $violatingRoutes[] = sprintf('[%s] %s (missing module:%s)', implode('|', $route->methods()), $route->uri(), $moduleSlug);
            }
        }
    }

    expect($violatingRoutes)->toBeEmpty(
        'Found non-core module routes missing module:{slug} middleware:'.PHP_EOL.implode(PHP_EOL, $violatingRoutes)
    );
});

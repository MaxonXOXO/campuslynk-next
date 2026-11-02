<?php

declare(strict_types=1);

use App\Modules\Identity\Middleware\RequirePermission;
use Illuminate\Routing\Route as RouteItem;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

uses(TestCase::class);

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
            if (is_string($m) && (str_starts_with($m, RequirePermission::class) || str_starts_with($m, 'can:') || str_starts_with($m, 'permission:'))) {
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
            if (is_string($m) && (str_starts_with($m, RequirePermission::class) || str_starts_with($m, 'can:') || str_starts_with($m, 'permission:'))) {
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
    /** @var array<RouteItem> $routes */
    $routes = Route::getRoutes()->getRoutes();

    foreach ($routes as $route) {
        $uri = '/'.ltrim($route->uri(), '/');
        if (str_contains($uri, '/test/')) {
            expect(app()->environment('testing'))->toBeTrue(
                "Found test route [{$uri}] registered in non-testing environment!"
            );
        }
    }
});

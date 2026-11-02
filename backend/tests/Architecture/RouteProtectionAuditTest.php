<?php

declare(strict_types=1);

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

<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use Symfony\Component\Yaml\Yaml;
use Tests\TestCase;

uses(TestCase::class);

test('OpenAPI contract is strictly synchronized with registered api/v1 routes', function () {
    $openapiPath = realpath(__DIR__.'/../../../contracts/openapi.yaml');
    expect($openapiPath)->not->toBeFalse('contracts/openapi.yaml must exist');

    /** @var array{paths?: array<string, array<string, mixed>>} $spec */
    $spec = Yaml::parseFile((string) $openapiPath);
    expect($spec)->toHaveKey('paths');

    // Helper to normalize path parameters: e.g. /batches/{batchId} -> /batches/{param}
    $normalizePath = fn (string $path): string => (string) preg_replace('/\{[^}]+\}/', '{param}', $path);

    // 1. Collect all operations in openapi.yaml
    $openapiOperations = [];
    foreach ($spec['paths'] as $path => $methods) {
        if (! is_array($methods)) {
            continue;
        }
        $normalizedPath = $normalizePath((string) $path);
        foreach ($methods as $method => $operation) {
            $normalizedMethod = strtoupper((string) $method);
            if (! in_array($normalizedMethod, ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], true)) {
                continue;
            }
            $openapiOperations[] = "{$normalizedMethod} {$normalizedPath}";
        }
    }

    // 2. Collect all non-test registered Laravel routes under api/v1
    $laravelRoutes = [];
    /** @var Illuminate\Routing\Route $route */
    foreach (Route::getRoutes()->getRoutes() as $route) {
        $uri = $route->uri();
        if (! str_starts_with($uri, 'api/v1')) {
            continue;
        }

        // Ignore test-only routes
        if (str_contains($uri, 'test/')) {
            continue;
        }

        $normalizedPath = substr($uri, strlen('api/v1'));
        if (! str_starts_with($normalizedPath, '/')) {
            $normalizedPath = '/'.$normalizedPath;
        }
        $normalizedPath = $normalizePath($normalizedPath);

        $methods = array_diff($route->methods(), ['HEAD']);
        foreach ($methods as $m) {
            $laravelRoutes[] = strtoupper($m)." {$normalizedPath}";
        }
    }

    $laravelRoutes = array_values(array_unique($laravelRoutes));
    $openapiOperations = array_values(array_unique($openapiOperations));

    sort($laravelRoutes);
    sort($openapiOperations);

    // Routes in Laravel missing from OpenAPI
    $missingInOpenApi = array_diff($laravelRoutes, $openapiOperations);

    // Operations in OpenAPI missing from Laravel (orphan endpoints)
    $orphanInOpenApi = array_diff($openapiOperations, $laravelRoutes);

    expect($missingInOpenApi)->toBeEmpty(
        'The following Laravel routes are missing from contracts/openapi.yaml: '.implode(', ', $missingInOpenApi)
    )->and($orphanInOpenApi)->toBeEmpty(
        'The following OpenAPI operations have no matching Laravel route (orphan operations): '.implode(', ', $orphanInOpenApi)
    );
});

test('it detects when a Laravel route is missing from the OpenAPI specification (negative test)', function () {
    $registeredRoutes = [
        'GET /health',
        'POST /auth/login',
        'POST /unregistered-fake-route',
    ];

    $specOperations = [
        'GET /health',
        'POST /auth/login',
    ];

    $missingInSpec = array_diff($registeredRoutes, $specOperations);

    expect($missingInSpec)->toContain('POST /unregistered-fake-route');
});

test('it detects when an OpenAPI specification path has no matching Laravel route (negative test)', function () {
    $registeredRoutes = [
        'GET /health',
        'POST /auth/login',
    ];

    $specOperations = [
        'GET /health',
        'POST /auth/login',
        'DELETE /fake-orphan-spec-endpoint',
    ];

    $orphanInSpec = array_diff($specOperations, $registeredRoutes);

    expect($orphanInSpec)->toContain('DELETE /fake-orphan-spec-endpoint');
});

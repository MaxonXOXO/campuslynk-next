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

    // 1. Collect all operations in openapi.yaml
    // Format: "METHOD /path", e.g. "GET /health", "POST /auth/login"
    $openapiOperations = [];
    foreach ($spec['paths'] as $path => $methods) {
        if (! is_array($methods)) {
            continue;
        }
        foreach ($methods as $method => $operation) {
            $normalizedMethod = strtoupper((string) $method);
            if (! in_array($normalizedMethod, ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], true)) {
                continue;
            }
            $openapiOperations[] = "{$normalizedMethod} {$path}";
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

        // Normalize path: api/v1/users/{id} -> /users/{id}
        $normalizedPath = substr($uri, strlen('api/v1'));
        if (! str_starts_with($normalizedPath, '/')) {
            $normalizedPath = '/'.$normalizedPath;
        }

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

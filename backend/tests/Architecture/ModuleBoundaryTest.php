<?php

declare(strict_types=1);

use App\Core\Tenancy\Concerns\UsesTenantConnection;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;

// 1. Dynamic module discovery
$moduleDirs = glob(__DIR__.'/../../app/Modules/*', GLOB_ONLYDIR) ?: [];
$modules = array_values(array_filter(array_map('basename', $moduleDirs), fn (string $name) => $name !== ''));

// Cross-module rule: For every ordered pair (A, B), where A !== B:
// Module A may NOT import or use B's Models, Actions, Http\Controllers, Http\Requests, or Policies.
// Only B's Contracts and Events are permitted.
foreach ($modules as $moduleA) {
    foreach ($modules as $moduleB) {
        if ($moduleA === $moduleB) {
            continue;
        }

        arch("module {$moduleA} does not access {$moduleB} internal models, actions, controllers, requests, or policies")
            ->expect("App\\Modules\\{$moduleA}")
            ->not->toUse([
                "App\\Modules\\{$moduleB}\\Models",
                "App\\Modules\\{$moduleB}\\Actions",
                "App\\Modules\\{$moduleB}\\Http\\Controllers",
                "App\\Modules\\{$moduleB}\\Http\\Requests",
                "App\\Modules\\{$moduleB}\\Policies",
            ]);
    }
}

// 2. Strict types declared across app/Core and app/Modules (single authoritative check)
test('every PHP file in app/Core and app/Modules explicitly declares strict types', function () {
    $findPhpFiles = function (string $dir) use (&$findPhpFiles): array {
        $files = [];
        $items = glob($dir.'/*', GLOB_NOSORT) ?: [];
        foreach ($items as $item) {
            if (is_dir($item)) {
                $files = array_merge($files, $findPhpFiles($item));
            } elseif (str_ends_with($item, '.php')) {
                $files[] = $item;
            }
        }

        return $files;
    };

    $appCoreDir = realpath(__DIR__.'/../../app/Core');
    $appModulesDir = realpath(__DIR__.'/../../app/Modules');

    $allPhpFiles = array_merge(
        $appCoreDir ? $findPhpFiles($appCoreDir) : [],
        $appModulesDir ? $findPhpFiles($appModulesDir) : []
    );

    expect($allPhpFiles)->not->toBeEmpty();

    $missing = [];
    foreach ($allPhpFiles as $file) {
        $content = (string) file_get_contents($file);
        if (! str_contains($content, 'declare(strict_types=1);')) {
            $missing[] = basename($file);
        }
    }

    expect($missing)->toBeEmpty('Files missing declare(strict_types=1);: '.implode(', ', $missing));
});

// 3. Action classes are final and implement execute (single authoritative check covering all modules)
test('every Action class is final and implements an execute method', function () {
    $actionFiles = glob(__DIR__.'/../../app/Modules/*/Actions/*.php') ?: [];
    expect($actionFiles)->not->toBeEmpty();

    $nonFinal = [];
    $missingExecute = [];

    foreach ($actionFiles as $file) {
        $normalized = str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $file);
        $base = str_replace(['/', '\\'], DIRECTORY_SEPARATOR, realpath(__DIR__.'/../../app') ?: '');
        $subPath = str_replace($base, '', $normalized);
        $class = 'App'.str_replace([DIRECTORY_SEPARATOR, '.php'], ['\\', ''], $subPath);

        if (! class_exists($class)) {
            continue;
        }

        $ref = new ReflectionClass($class);
        if ($ref->isAbstract()) {
            continue;
        }

        if (! $ref->isFinal()) {
            $nonFinal[] = $class;
        }

        if (! $ref->hasMethod('execute')) {
            $missingExecute[] = $class;
        }
    }

    expect($nonFinal)->toBeEmpty('Action classes that must be final: '.implode(', ', $nonFinal))
        ->and($missingExecute)->toBeEmpty('Action classes that must implement execute(): '.implode(', ', $missingExecute));
});

// 4. Thin controllers: controllers must NOT call DB::statement, DB::insert, DB::update, DB::delete, DB::raw
test('module controllers are thin and execute no direct DB statements, raw queries, or writes', function () {
    $controllerFiles = glob(__DIR__.'/../../app/Modules/*/Http/Controllers/*.php') ?: [];
    expect($controllerFiles)->not->toBeEmpty();

    $forbiddenPatterns = [
        'DB::statement',
        'DB::insert',
        'DB::update',
        'DB::delete',
        'DB::raw',
        'DB::unprepared',
    ];

    $violations = [];

    foreach ($controllerFiles as $file) {
        $content = (string) file_get_contents($file);
        $shortName = basename($file);

        foreach ($forbiddenPatterns as $pattern) {
            if (str_contains($content, $pattern)) {
                $violations[] = "{$shortName} contains forbidden call [{$pattern}]. All writes must go through an Action.";
            }
        }
    }

    expect($violations)->toBeEmpty(implode(PHP_EOL, $violations));
});

// 5. Model invariants: Every Eloquent model in App\Modules\* uses UsesTenantConnection and HasUlids
test('all module models use UsesTenantConnection and HasUlids', function () {
    $modelFiles = glob(__DIR__.'/../../app/Modules/*/Models/*.php') ?: [];
    expect($modelFiles)->not->toBeEmpty();

    $missingTenantConnection = [];
    $missingHasUlids = [];

    foreach ($modelFiles as $file) {
        $normalized = str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $file);
        $base = str_replace(['/', '\\'], DIRECTORY_SEPARATOR, realpath(__DIR__.'/../../app') ?: '');
        $subPath = str_replace($base, '', $normalized);
        $class = 'App'.str_replace([DIRECTORY_SEPARATOR, '.php'], ['\\', ''], $subPath);

        if (! class_exists($class)) {
            continue;
        }

        $ref = new ReflectionClass($class);
        if ($ref->isAbstract() || ! $ref->isSubclassOf(Model::class)) {
            continue;
        }

        $traits = class_uses_recursive($class);

        if (! in_array(UsesTenantConnection::class, $traits, true)) {
            $missingTenantConnection[] = $class;
        }

        if (! in_array(HasUlids::class, $traits, true)) {
            $missingHasUlids[] = $class;
        }
    }

    expect($missingTenantConnection)->toBeEmpty(
        'Models missing UsesTenantConnection: '.implode(', ', $missingTenantConnection)
    )->and($missingHasUlids)->toBeEmpty(
        'Models missing HasUlids: '.implode(', ', $missingHasUlids)
    );
});

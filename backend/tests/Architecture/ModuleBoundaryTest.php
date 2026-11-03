<?php

declare(strict_types=1);

use App\Core\Tenancy\Concerns\UsesTenantConnection;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;

$moduleDirs = glob(__DIR__.'/../../app/Modules/*', GLOB_ONLYDIR) ?: [];

// 1. Cross-module encapsulation: No module may directly import another module's Models, Actions, Controllers, Requests, Policies
foreach ($moduleDirs as $moduleDir) {
    $moduleName = basename($moduleDir);
    arch("other modules do not directly access {$moduleName} internals")
        ->expect([
            "App\\Modules\\{$moduleName}\\Models",
            "App\\Modules\\{$moduleName}\\Actions",
            "App\\Modules\\{$moduleName}\\Http\\Controllers",
            "App\\Modules\\{$moduleName}\\Http\\Requests",
            "App\\Modules\\{$moduleName}\\Policies",
        ])
        ->toOnlyBeUsedIn([
            "App\\Modules\\{$moduleName}",
            'App\\Core',
            'App\\Providers',
            'Database\\Migrations',
            'Database\\Seeders',
        ]);
}

// 4. Strict types declared across app/Core and app/Modules
arch('strict types are declared across app Core and Modules')
    ->expect(['App\Core', 'App\Modules'])
    ->toUseStrictTypes();

// 5. Action naming & shape via Pest arch
foreach ($moduleDirs as $moduleDir) {
    $moduleName = basename($moduleDir);
    if (is_dir($moduleDir.'/Actions')) {
        arch("actions in {$moduleName} are final and implement execute")
            ->expect("App\\Modules\\{$moduleName}\\Actions")
            ->classes()
            ->toBeFinal()
            ->toHaveMethod('execute');
    }
}

// 2. Thin controllers: controllers must NOT call DB::statement, DB::insert, DB::update, DB::delete, DB::raw
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

// 3. Model invariants: Every Eloquent model in App\Modules\* uses UsesTenantConnection and HasUlids
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

// 4 (deep audit): Every single PHP file in app/Core and app/Modules declares declare(strict_types=1);
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

// 5 (deep audit): Every Action class in App\Modules\*\Actions is final and has execute method
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

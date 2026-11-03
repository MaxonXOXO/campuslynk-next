<?php

declare(strict_types=1);

use App\Core\Modules\Contracts\ModuleManifestContract;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\File;

it('rejects invalid module names at validation', function (string $invalidName) {
    $exitCode = Artisan::call('make:module', ['name' => $invalidName]);

    expect($exitCode)->toBe(1);
})->with([
    'lowercase' => 'attendance',
    'snake_case' => 'sample_feature',
    'kebab-case' => 'sample-feature',
    'starts_with_number' => '123Bad',
    'special_chars' => 'Bad@Module!',
    'path_traversal' => '../EvilModule',
    'sql_injection' => "Module'; DROP TABLE users;--",
]);

it('rejects duplicate module names if directory already exists', function () {
    $exitCode = Artisan::call('make:module', ['name' => 'Identity']);

    expect($exitCode)->toBe(1);
});

it('scaffolds a complete valid module with canonical structure and manifest', function () {
    $moduleName = 'SampleFeature';
    $slug = 'sample_feature';
    $moduleDir = app_path("Modules/{$moduleName}");
    $docsFile = base_path("../docs/modules/{$slug}.md");
    $testDir = base_path("tests/Feature/{$moduleName}");

    // Ensure clean slate before test
    if (File::isDirectory($moduleDir)) {
        File::deleteDirectory($moduleDir);
    }
    if (File::exists($docsFile)) {
        File::delete($docsFile);
    }
    if (File::isDirectory($testDir)) {
        File::deleteDirectory($testDir);
    }

    try {
        $exitCode = Artisan::call('make:module', [
            'name' => $moduleName,
        ]);

        expect($exitCode)->toBe(0);

        // 1. Verify expected canonical directories
        $expectedDirs = [
            'Actions',
            'Contracts',
            'Database/Migrations',
            'Events',
            'Http/Controllers',
            'Http/Requests',
            'Http/Resources',
            'Listeners',
            'Models',
            'Policies',
            'Routes',
        ];

        foreach ($expectedDirs as $subDir) {
            expect(File::isDirectory("{$moduleDir}/{$subDir}"))->toBeTrue("Missing directory: {$subDir}");
        }

        // 2. Verify files exist
        $manifestPath = "{$moduleDir}/{$moduleName}Module.php";
        $routesPath = "{$moduleDir}/Routes/api.php";
        $testStubPath = "{$testDir}/{$moduleName}ModuleSmokeTest.php";

        expect(File::exists($manifestPath))->toBeTrue()
            ->and(File::exists($routesPath))->toBeTrue()
            ->and(File::exists($docsFile))->toBeTrue()
            ->and(File::exists($testStubPath))->toBeTrue();

        // 3. Verify Routes/api.php carries module licence middleware for non-core module
        $routesContent = File::get($routesPath);
        expect($routesContent)->toContain("module:{$slug}");

        // 4. Verify docs/modules/{slug}.md standard sections
        $docsContent = File::get($docsFile);
        expect($docsContent)->toContain('# Sample Feature Module')
            ->toContain('## Overview')
            ->toContain('## Owned Tables')
            ->toContain('## Permissions Catalogue')
            ->toContain('## Endpoints')
            ->toContain('## Domain Events')
            ->toContain('## Cross-Module Contracts');

        // 5. Require generated file and instantiate manifest class
        require_once $manifestPath;
        $className = "App\\Modules\\{$moduleName}\\{$moduleName}Module";
        expect(class_exists($className))->toBeTrue();

        /** @var ModuleManifestContract $module */
        $module = new $className(app());
        expect($module)->toBeInstanceOf(ModuleManifestContract::class)
            ->and($module->slug())->toBe($slug)
            ->and($module->name())->toBe('Sample Feature')
            ->and($module->isCore())->toBeFalse()
            ->and($module->permissions())->toContain("{$slug}.view");
    } finally {
        // Clean up scaffolded test module
        if (File::isDirectory($moduleDir)) {
            File::deleteDirectory($moduleDir);
        }
        if (File::exists($docsFile)) {
            File::delete($docsFile);
        }
        if (File::isDirectory($testDir)) {
            File::deleteDirectory($testDir);
        }
    }
});

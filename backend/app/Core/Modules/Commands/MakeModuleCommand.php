<?php

declare(strict_types=1);

namespace App\Core\Modules\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;

class MakeModuleCommand extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'make:module
                            {name : The StudlyCase name of the module (e.g. Attendance, AssessmentEngine)}
                            {--core : Mark the module as a core platform module}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Scaffold a new modular architecture module with canonical directory structure, manifest, docs, and test stub';

    public function handle(): int
    {
        $name = trim((string) $this->argument('name'));

        // 1. Validate StudlyCase name
        if (! preg_match('/^[A-Z][a-zA-Z0-9]+$/', $name)) {
            $this->error(sprintf('Invalid module name [%s]. The module name must be in StudlyCase (e.g. Attendance, AssessmentEngine).', $name));

            return self::FAILURE;
        }

        $moduleDir = app_path("Modules/{$name}");

        // 2. Reject already existing module
        if (File::isDirectory($moduleDir)) {
            $this->error(sprintf('Module [%s] already exists at [%s].', $name, $moduleDir));

            return self::FAILURE;
        }

        $slug = Str::snake($name);
        $headlineName = Str::headline($slug);
        $isCore = (bool) $this->option('core');
        $isCoreString = $isCore ? 'true' : 'false';

        $this->info(sprintf('Scaffolding module [%s] (slug: %s, core: %s)...', $name, $slug, $isCoreString));

        // 3. Create canonical directories
        $subDirs = [
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

        foreach ($subDirs as $dir) {
            File::ensureDirectoryExists("{$moduleDir}/{$dir}");
        }

        // 4. Generate Routes/api.php
        $middlewareLines = $isCore
            ? "    'auth:sanctum',"
            : "    'auth:sanctum',\n    'module:{$slug}',";

        $routesContent = <<<PHP
<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;

Route::middleware([
{$middlewareLines}
])->prefix('{$slug}')->name('api.v1.{$slug}.')->group(function (): void {
    // Declared routes for {$headlineName} module
});

PHP;
        File::put("{$moduleDir}/Routes/api.php", $routesContent);

        // 5. Generate {Name}Module.php
        $moduleClassContent = <<<PHP
<?php

declare(strict_types=1);

namespace App\Modules\\{$name};

use App\Core\Modules\Contracts\ModuleManifestContract;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\ServiceProvider;

class {$name}Module extends ServiceProvider implements ModuleManifestContract
{
    public function slug(): string
    {
        return '{$slug}';
    }

    public function name(): string
    {
        return '{$headlineName}';
    }

    public function isCore(): bool
    {
        return {$isCoreString};
    }

    /**
     * @return list<string>
     */
    public function permissions(): array
    {
        return [
            '{$slug}.view',
        ];
    }

    /**
     * @return array<string, class-string<\Illuminate\Database\Seeder>>
     */
    public function seeders(): array
    {
        return [];
    }

    public function registerRoutes(): void
    {
        \$routesPath = __DIR__.'/Routes/api.php';
        if (file_exists(\$routesPath)) {
            Route::prefix('api/v1')
                ->middleware('api')
                ->group(\$routesPath);
        }
    }

    public function register(): void
    {
        // Bind module contracts and implementations
    }

    public function boot(): void
    {
        \$this->registerRoutes();
    }
}

PHP;
        File::put("{$moduleDir}/{$name}Module.php", $moduleClassContent);

        // 6. Generate docs/modules/{slug}.md
        $docsDir = base_path('../docs/modules');
        if (! File::isDirectory($docsDir)) {
            File::ensureDirectoryExists($docsDir);
        }

        $docsContent = <<<MARKDOWN
# {$headlineName} Module

## Overview
Detailed description of the {$headlineName} module and its domain capabilities.

## Owned Tables
- None yet (declared in Database/Migrations).

## Permissions Catalogue
- `{$slug}.view`: View access to {$headlineName} resources.

## Endpoints
- None yet (declared in Routes/api.php).

## Domain Events
- None yet (declared in Events/).

## Cross-Module Contracts
- None yet (declared in Contracts/).

MARKDOWN;
        File::put("{$docsDir}/{$slug}.md", $docsContent);

        // 7. Generate baseline feature test stub
        $testDir = base_path("tests/Feature/{$name}");
        File::ensureDirectoryExists($testDir);

        $testContent = <<<PHP
<?php

declare(strict_types=1);

use App\Core\Modules\Contracts\ModuleManifestContract;
use App\Modules\\{$name}\\{$name}Module;

it('implements ModuleManifestContract and returns expected manifest attributes', function () {
    \$module = new {$name}Module(app());

    expect(\$module)->toBeInstanceOf(ModuleManifestContract::class)
        ->and(\$module->slug())->toBe('{$slug}')
        ->and(\$module->name())->toBe('{$headlineName}')
        ->and(\$module->isCore())->toBe({$isCoreString})
        ->and(\$module->permissions())->toBeArray();
});

PHP;
        File::put("{$testDir}/{$name}ModuleSmokeTest.php", $testContent);

        $this->info("Module [{$name}] successfully scaffolded.");

        return self::SUCCESS;
    }
}

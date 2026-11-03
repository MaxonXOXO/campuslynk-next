<?php

declare(strict_types=1);

namespace App\Core\Modules;

use App\Core\Modules\Contracts\ModuleManifestContract;
use Illuminate\Contracts\Foundation\Application;
use Illuminate\Support\Facades\File;

class ModuleRegistry
{
    /**
     * @var array<string, ModuleManifestContract>
     */
    protected array $modules = [];

    public function __construct(protected Application $app)
    {
        // Discover installed modules dynamically under app/Modules/
        $this->discover();
    }

    public function register(ModuleManifestContract $module): void
    {
        $this->modules[$module->slug()] = $module;
    }

    /**
     * Discover installed modules dynamically.
     */
    public function discover(): void
    {
        $modulesPath = app_path('Modules');
        if (! File::isDirectory($modulesPath)) {
            return;
        }

        $directories = File::directories($modulesPath);
        foreach ($directories as $dir) {
            $moduleName = basename($dir);
            $class = "App\\Modules\\{$moduleName}\\{$moduleName}Module";

            if (class_exists($class) && is_subclass_of($class, ModuleManifestContract::class)) {
                $instance = new $class($this->app);
                if (! isset($this->modules[$instance->slug()])) {
                    $this->register($instance);
                }
            }
        }
    }

    /**
     * @return array<string, ModuleManifestContract>
     */
    public function all(): array
    {
        return $this->modules;
    }

    public function get(string $slug): ?ModuleManifestContract
    {
        return $this->modules[$slug] ?? null;
    }

    public function has(string $slug): bool
    {
        return isset($this->modules[$slug]);
    }

    public function isCore(string $slug): bool
    {
        $module = $this->get($slug);

        return $module !== null && $module->isCore();
    }
}

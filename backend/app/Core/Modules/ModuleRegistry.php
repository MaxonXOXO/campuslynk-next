<?php

declare(strict_types=1);

namespace App\Core\Modules;

use App\Core\Modules\Contracts\ModuleManifestContract;
use Illuminate\Contracts\Foundation\Application;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\File;

class ModuleRegistry
{
    /**
     * @var array<string, ModuleManifestContract>
     */
    protected array $modules = [];

    protected bool $discovered = false;

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
        if ($this->discovered) {
            return;
        }

        $modulesPath = app_path('Modules');
        if (! File::isDirectory($modulesPath)) {
            $this->discovered = true;

            return;
        }

        $directories = File::directories($modulesPath);
        sort($directories);

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

        $this->discovered = true;
    }

    /**
     * Run tenant seeders registered across modules matching the given profile.
     */
    public function seed(string $profile): void
    {
        foreach ($this->modules as $module) {
            $seeders = $module->seeders();
            if (isset($seeders[$profile])) {
                $seederClass = $seeders[$profile];
                /** @var Seeder $seeder */
                $seeder = $this->app->make($seederClass);
                $seeder->__invoke();
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

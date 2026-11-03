<?php

declare(strict_types=1);

namespace App\Core\Modules;

use App\Core\Modules\Commands\MakeModuleCommand;
use Illuminate\Support\ServiceProvider;

class ModulesServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(ModuleRegistry::class, function ($app) {
            return new ModuleRegistry($app);
        });
    }

    public function boot(): void
    {
        if ($this->app->runningInConsole()) {
            $this->commands([
                MakeModuleCommand::class,
            ]);
        }
    }
}

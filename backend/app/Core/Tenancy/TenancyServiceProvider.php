<?php

declare(strict_types=1);

namespace App\Core\Tenancy;

use App\Core\Tenancy\Bootstrappers\CacheBootstrapper;
use App\Core\Tenancy\Bootstrappers\DatabaseBootstrapper;
use App\Core\Tenancy\Bootstrappers\FilesystemBootstrapper;
use App\Core\Tenancy\Bootstrappers\LoggingBootstrapper;
use App\Core\Tenancy\Commands\AppInstallCommand;
use App\Core\Tenancy\Commands\TenantsCreateCommand;
use App\Core\Tenancy\Commands\TenantsMigrateCommand;
use App\Core\Tenancy\Listeners\QueueTenantScopeListener;
use App\Core\Tenancy\Services\TenantProvisioner;
use Illuminate\Contracts\Events\Dispatcher;
use Illuminate\Support\ServiceProvider;

class TenancyServiceProvider extends ServiceProvider
{
    /**
     * Register any tenancy application services.
     */
    public function register(): void
    {
        $this->app->singleton(TenantContext::class, function (): TenantContext {
            return new TenantContext([
                new DatabaseBootstrapper,
                new CacheBootstrapper,
                new FilesystemBootstrapper,
                new LoggingBootstrapper,
            ]);
        });

        $this->app->singleton(TenantProvisioner::class, function ($app): TenantProvisioner {
            return new TenantProvisioner($app->make(TenantContext::class));
        });
    }

    /**
     * Bootstrap tenancy services and worker teardown listeners.
     */
    public function boot(Dispatcher $events): void
    {
        // Register Console Commands
        if ($this->app->runningInConsole()) {
            $this->commands([
                AppInstallCommand::class,
                TenantsCreateCommand::class,
                TenantsMigrateCommand::class,
            ]);
        }

        // Subscribe to Queue events for fail-closed tenant scoping
        $listener = new QueueTenantScopeListener($this->app->make(TenantContext::class));
        $listener->subscribe($events);

        // Application termination hook for Octane / FrankenPHP worker cleanup
        $this->app->terminating(function (): void {
            /** @var TenantContext $context */
            $context = $this->app->make(TenantContext::class);
            $context->forget();
        });
    }
}

<?php

declare(strict_types=1);

namespace App\Core\Tenancy;

use App\Core\Auth\Commands\UsersUnlockCommand;
use App\Core\Tenancy\Bootstrappers\CacheBootstrapper;
use App\Core\Tenancy\Bootstrappers\DatabaseBootstrapper;
use App\Core\Tenancy\Bootstrappers\FilesystemBootstrapper;
use App\Core\Tenancy\Bootstrappers\LoggingBootstrapper;
use App\Core\Tenancy\Commands\AppInstallCommand;
use App\Core\Tenancy\Commands\LandlordMigrateCommand;
use App\Core\Tenancy\Commands\TenantsCreateCommand;
use App\Core\Tenancy\Commands\TenantsLicenseRenewCommand;
use App\Core\Tenancy\Commands\TenantsMigrateCommand;
use App\Core\Tenancy\Exceptions\UnconfiguredDefaultConnectionException;
use App\Core\Tenancy\Listeners\QueueTenantScopeListener;
use App\Core\Tenancy\Services\TenantProvisioner;
use Illuminate\Contracts\Events\Dispatcher;
use Illuminate\Database\DatabaseManager;
use Illuminate\Queue\Queue;
use Illuminate\Support\ServiceProvider;
use Laravel\Octane\Events\RequestTerminated;

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

        // Fail-closed default connection: any query without tenant context throws
        $this->app->resolving('db', function (DatabaseManager $db): void {
            $db->extend('unconfigured', function (): never {
                throw new UnconfiguredDefaultConnectionException;
            });
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
                LandlordMigrateCommand::class,
                TenantsCreateCommand::class,
                TenantsMigrateCommand::class,
                TenantsLicenseRenewCommand::class,
                UsersUnlockCommand::class,
            ]);
        }

        // Subscribe to Queue events for fail-closed tenant scoping
        /** @var TenantContext $context */
        $context = $this->app->make(TenantContext::class);
        $listener = new QueueTenantScopeListener($context);
        $listener->subscribe($events);

        // Inject active tenant_id into all queued payloads automatically
        Queue::createPayloadUsing(function () use ($context): array {
            if ($context->hasTenant()) {
                return ['tenant_id' => $context->tenant()->id];
            }

            return [];
        });

        // Octane RequestTerminated event hook for persistent worker cleanup
        $events->listen(RequestTerminated::class, function () use ($context): void {
            $context->forget();
        });

        // Application termination hook for worker cleanup
        $this->app->terminating(function () use ($context): void {
            $context->forget();
        });
    }
}

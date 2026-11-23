<?php

declare(strict_types=1);

namespace App\Modules\Identity;

use App\Core\Contracts\ScopeAuthorizerContract;
use App\Core\Modules\Contracts\ModuleManifestContract;
use App\Modules\Identity\Actions\ChangePasswordAction;
use App\Modules\Identity\Actions\LoginAction;
use App\Modules\Identity\Commands\PermissionsSyncCommand;
use App\Modules\Identity\Commands\UsersUnlockCommand;
use App\Modules\Identity\Contracts\AuthenticatesUserContract;
use App\Modules\Identity\Contracts\ChangesPasswordContract;
use App\Modules\Identity\Contracts\IssuesTemporaryPasswordContract;
use App\Modules\Identity\Events\UserApproved;
use App\Modules\Identity\Events\UserRejected;
use App\Modules\Identity\Listeners\ArchiveFirstYearBatchAssignmentsListener;
use App\Modules\Identity\Listeners\LogUserApprovalNotificationListener;
use App\Modules\Identity\Models\User;
use App\Modules\Identity\Policies\UserPolicy;
use App\Modules\Identity\Services\ScopeAuthorizer;
use App\Modules\Identity\Services\TemporaryPasswordIssuer;
use App\Modules\Organisation\Events\BatchSemesterPromoted;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\ServiceProvider;

class IdentityModule extends ServiceProvider implements ModuleManifestContract
{
    public function slug(): string
    {
        return 'identity';
    }

    public function name(): string
    {
        return 'Identity';
    }

    public function isCore(): bool
    {
        return true;
    }

    public function seeders(): array
    {
        return [
            'rbac' => Database\Seeders\RbacBaselineSeeder::class,
            'none' => Database\Seeders\RbacBaselineSeeder::class,
            'baseline' => Database\Seeders\RbacBaselineSeeder::class,
            'kerala-polytechnic' => Database\Seeders\RbacBaselineSeeder::class,
        ];
    }

    public function registerRoutes(): void
    {
        $routesPath = __DIR__.'/Routes/api.php';
        if (file_exists($routesPath)) {
            Route::prefix('api/v1')
                ->middleware('api')
                ->group($routesPath);
        }
    }

    /**
     * All permissions declared by the Identity module.
     * Pattern: identity.<resource>.<action>
     *
     * @return list<string>
     */
    public function permissions(): array
    {
        return [
            'identity.user.view',
            'identity.user.create',
            'identity.user.update',
            'identity.user.unlock',
            'identity.user.approve',
            'identity.user.import',
            'identity.user.suspend',
            'identity.user.deactivate',
            'identity.user.delete',
            'identity.user.reset_password',
            'identity.user.impersonate',
            'identity.role.assign',
            'identity.online_status.view',
            'identity.audit_log.view',
        ];
    }

    /**
     * Role-to-permission mappings for the Identity module.
     *
     * @return array<string, list<string>>
     */
    public function rolePermissions(): array
    {
        return [
            'super_admin' => [
                'identity.user.view',
                'identity.user.create',
                'identity.user.update',
                'identity.user.unlock',
                'identity.user.approve',
                'identity.user.import',
                'identity.user.suspend',
                'identity.user.deactivate',
                'identity.user.delete',
                'identity.user.reset_password',
                'identity.user.impersonate',
                'identity.role.assign',
                'identity.online_status.view',
                'identity.audit_log.view',
            ],
            'principal' => [
                'identity.user.view',
                'identity.user.create',
                'identity.user.update',
                'identity.user.unlock',
                'identity.user.approve',
                'identity.user.import',
                'identity.user.suspend',
                'identity.user.deactivate',
                'identity.user.reset_password',
                'identity.role.assign',
                'identity.online_status.view',
                'identity.audit_log.view',
            ],
            'admin' => [
                'identity.user.view',
                'identity.user.create',
                'identity.user.update',
                'identity.user.approve',
            ],
            'hod' => [
                'identity.user.view',
                'identity.role.assign',
            ],
            'gen_dept_coordinator' => [
                'identity.user.view',
                'identity.role.assign',
            ],
            'academic_coordinator' => [
                'identity.user.view',
                'identity.user.approve',
            ],
            'tutor' => [
                'identity.user.view',
                'identity.user.approve',
                'identity.user.suspend',
                'identity.user.reset_password',
            ],
        ];
    }

    public function register(): void
    {
        $this->app->bind(AuthenticatesUserContract::class, LoginAction::class);
        $this->app->bind(ChangesPasswordContract::class, ChangePasswordAction::class);
        $this->app->bind(IssuesTemporaryPasswordContract::class, TemporaryPasswordIssuer::class);
        $this->app->singleton(ScopeAuthorizerContract::class, ScopeAuthorizer::class);
    }

    public function boot(): void
    {
        Gate::policy(User::class, UserPolicy::class);

        Event::listen(
            BatchSemesterPromoted::class,
            ArchiveFirstYearBatchAssignmentsListener::class
        );
        Event::listen(
            [UserApproved::class, UserRejected::class],
            LogUserApprovalNotificationListener::class
        );

        if ($this->app->runningInConsole()) {
            $this->commands([
                UsersUnlockCommand::class,
                PermissionsSyncCommand::class,
            ]);
        }
    }
}

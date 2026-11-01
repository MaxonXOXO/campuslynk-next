<?php

namespace App\Providers;

use Illuminate\Support\ServiceProvider;
use RuntimeException;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        $this->validateDeployProfile();
    }

    /**
     * Validate the deployment profile configuration at application boot.
     *
     * @throws RuntimeException
     */
    protected function validateDeployProfile(): void
    {
        $profile = config('app_profile.deploy_profile');

        if (! is_string($profile) || ! in_array($profile, ['onprem', 'cloud'], true)) {
            throw new RuntimeException(sprintf(
                'Invalid or missing DEPLOY_PROFILE: "%s". Must be either "onprem" or "cloud". Check your environment configuration.',
                is_scalar($profile) ? (string) $profile : gettype($profile)
            ));
        }
    }
}

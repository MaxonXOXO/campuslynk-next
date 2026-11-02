<?php

namespace App\Providers;

use App\Core\Auth\Models\PersonalAccessToken;
use Illuminate\Http\Middleware\TrustProxies;
use Illuminate\Support\ServiceProvider;
use Laravel\Sanctum\Sanctum;
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
        $this->validateProductionAppKey();

        Sanctum::usePersonalAccessTokenModel(PersonalAccessToken::class);

        $proxies = config('app.trusted_proxies');
        if (! empty($proxies)) {
            /** @var array<int, string>|string $proxies */
            TrustProxies::at($proxies);
        }
    }

    /**
     * Prohibit empty, insecure, or example APP_KEY values in production.
     *
     * @throws RuntimeException
     */
    public function validateProductionAppKey(): void
    {
        if (! $this->app->environment('production')) {
            return;
        }

        $key = config('app.key');

        if (! is_string($key) || trim($key) === '') {
            throw new RuntimeException('Application key is missing. Refusing to boot in production without a valid APP_KEY.');
        }

        $prohibitedKeys = [
            'base64:c29tZXJhbmRvbXN0cmluZ2ZvcmFwcGtleXNlY3VyZTEyMw==',
            'base64:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
            'base64:EXAMPLE_INSECURE_APP_KEY_REPLACE_ME==',
            'base64:o+PwvSaXMDgy1jfacfUAh5aH0pBRCtm10lxCmmE7NtU=',
        ];

        if (in_array($key, $prohibitedKeys, true)
            || str_contains(strtolower($key), 'example')
            || str_contains(strtolower($key), 'placeholder')
            || str_contains(strtolower($key), 'change_me')
        ) {
            throw new RuntimeException('Insecure application key: Refusing to boot in production using an example or default placeholder key.');
        }

        if (str_starts_with($key, 'base64:')) {
            $rawKey = base64_decode(substr($key, 7), true);
            if ($rawKey === false || strlen($rawKey) !== 32) {
                throw new RuntimeException('Invalid application key length: AES-256-CBC requires a 32-byte key.');
            }
        } elseif (strlen($key) !== 32) {
            throw new RuntimeException('Invalid application key length: AES-256-CBC requires a 32-byte key.');
        }
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

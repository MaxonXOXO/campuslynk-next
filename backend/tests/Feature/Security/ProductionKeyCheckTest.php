<?php

declare(strict_types=1);

use App\Providers\AppServiceProvider;

afterEach(function () {
    app()->detectEnvironment(fn () => 'testing');
    config(['app.key' => env('APP_KEY')]);
});

it('refuses to boot in production when APP_KEY is empty', function () {
    app()->detectEnvironment(fn () => 'production');
    config(['app.key' => '']);

    $provider = new AppServiceProvider(app());
    $provider->validateProductionAppKey();
})->throws(RuntimeException::class, 'Application key is missing');

it('refuses to boot in production when APP_KEY is a known example placeholder', function () {
    app()->detectEnvironment(fn () => 'production');
    config(['app.key' => 'base64:c29tZXJhbmRvbXN0cmluZ2ZvcmFwcGtleXNlY3VyZTEyMw==']);

    $provider = new AppServiceProvider(app());
    $provider->validateProductionAppKey();
})->throws(RuntimeException::class, 'Insecure application key');

it('refuses to boot in production when APP_KEY is the legacy compose placeholder', function () {
    app()->detectEnvironment(fn () => 'production');
    config(['app.key' => 'base64:o+PwvSaXMDgy1jfacfUAh5aH0pBRCtm10lxCmmE7NtU=']);

    $provider = new AppServiceProvider(app());
    $provider->validateProductionAppKey();
})->throws(RuntimeException::class, 'Insecure application key');

it('refuses to boot in production when APP_KEY has invalid byte length', function () {
    app()->detectEnvironment(fn () => 'production');
    config(['app.key' => 'base64:'.base64_encode('short_key')]);

    $provider = new AppServiceProvider(app());
    $provider->validateProductionAppKey();
})->throws(RuntimeException::class, 'Invalid application key length');

it('allows boot in production when APP_KEY is a valid 32-byte key', function () {
    app()->detectEnvironment(fn () => 'production');
    $validKey = 'base64:'.base64_encode(random_bytes(32));
    config(['app.key' => $validKey]);

    $provider = new AppServiceProvider(app());
    $provider->validateProductionAppKey();

    expect(true)->toBeTrue();
});

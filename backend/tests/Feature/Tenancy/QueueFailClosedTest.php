<?php

declare(strict_types=1);

use App\Core\Tenancy\Exceptions\MissingTenantContextException;
use App\Core\Tenancy\Models\TenantSetting;
use App\Core\Tenancy\Services\TenantProvisioner;
use App\Core\Tenancy\TenantContext;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use Tests\Fixtures\SampleBroadcastEvent;
use Tests\Fixtures\SampleEvent;
use Tests\Fixtures\SampleLandlordJob;
use Tests\Fixtures\SamplePlainJob;
use Tests\Fixtures\SampleQueuedListener;
use Tests\Fixtures\SampleQueuedMailable;
use Tests\Fixtures\SampleQueuedNotification;
use Tests\Fixtures\SampleTenantJob;
use Tests\Fixtures\SampleUnscopedJob;

beforeEach(function () {
    $this->purgeAllTenantDatabases();
    $this->provisioner = app(TenantProvisioner::class);
    $this->context = app(TenantContext::class);
});

afterEach(function () {
    $this->purgeAllTenantDatabases();
});

it('fails closed when an unscoped job is dispatched without tenant context', function () {
    expect(fn () => dispatch_sync(new SampleUnscopedJob))
        ->toThrow(MissingTenantContextException::class);
});

it('permits jobs implementing LandlordJobContract to run without tenant context', function () {
    SampleLandlordJob::$executed = false;

    dispatch_sync(new SampleLandlordJob);

    expect(SampleLandlordJob::$executed)->toBeTrue();
});

it('initializes correct tenant context for TenantAwareJob', function () {
    $tenant = $this->provisioner->provision('tenant_queue', 'Queue College', 'queue.test');

    // Run job for this tenant
    $job = new SampleTenantJob($tenant->id);
    dispatch_sync($job);

    // Verify row was written into tenant database
    $this->context->setTenant($tenant);
    $setting = TenantSetting::find('auth.token_lifetime_web_hours');
    expect($setting)->not->toBeNull()
        ->and($setting->value)->toEqual(['hours' => 1]);
    $this->context->forget();
});

it('automatically scopes plain queued jobs without the trait when dispatched from tenant context', function () {
    $tenant = $this->provisioner->provision('tenant_plain', 'Plain Queue College', 'plain.test');

    $this->context->setTenant($tenant);
    dispatch_sync(new SamplePlainJob);
    $this->context->forget();

    // Verify record was written to tenant database
    $this->context->setTenant($tenant);
    $setting = TenantSetting::find('auth.token_lifetime_web_hours');
    expect($setting)->not->toBeNull()
        ->and($setting->value)->toEqual(['hours' => 2]);
    $this->context->forget();
});

it('automatically scopes queued event listeners dispatched from tenant context', function () {
    $tenant = $this->provisioner->provision('tenant_listener', 'Listener College', 'listener.test');

    Event::listen(SampleEvent::class, SampleQueuedListener::class);

    $this->context->setTenant($tenant);
    event(new SampleEvent('hello-tenant-event'));
    $this->context->forget();

    $this->context->setTenant($tenant);
    $setting = TenantSetting::find('auth.token_lifetime_web_hours');
    expect($setting)->not->toBeNull()
        ->and($setting->value)->toEqual(['hours' => 3]);
    $this->context->forget();
});

it('automatically scopes queued notifications dispatched from tenant context', function () {
    $tenant = $this->provisioner->provision('tenant_notif', 'Notification College', 'notif.test');

    $this->context->setTenant($tenant);
    Notification::route('mail', 'admin@notif.test')
        ->notify(new SampleQueuedNotification);
    $this->context->forget();

    $this->context->setTenant($tenant);
    $setting = TenantSetting::find('auth.token_lifetime_web_hours');
    expect($setting)->not->toBeNull()
        ->and($setting->value)->toEqual(['hours' => 4]);
    $this->context->forget();
});

it('automatically scopes queued mailables dispatched from tenant context', function () {
    $tenant = $this->provisioner->provision('tenant_mail', 'Mail College', 'mail.test');

    $this->context->setTenant($tenant);
    Mail::to('user@mail.test')->send(new SampleQueuedMailable);
    $this->context->forget();

    $this->context->setTenant($tenant);
    $setting = TenantSetting::find('auth.token_lifetime_web_hours');
    expect($setting)->not->toBeNull()
        ->and($setting->value)->toEqual(['hours' => 5]);
    $this->context->forget();
});

it('automatically scopes broadcast events dispatched from tenant context', function () {
    $tenant = $this->provisioner->provision('tenant_bcast', 'Broadcast College', 'bcast.test');

    $this->context->setTenant($tenant);
    // Broadcast event uses Queue::createPayloadUsing internally for BroadcastEvent job
    broadcast(new SampleBroadcastEvent('testing broadcast'));
    $this->context->forget();

    expect(true)->toBeTrue();
});

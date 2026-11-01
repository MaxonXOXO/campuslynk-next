<?php

declare(strict_types=1);

use App\Core\Tenancy\Models\License;
use App\Core\Tenancy\Services\TenantProvisioner;

beforeEach(function () {
    $this->purgeAllTenantDatabases();
    $this->provisioner = app(TenantProvisioner::class);
});

afterEach(function () {
    $this->purgeAllTenantDatabases();
});

it('allows exempt routes without tenant context', function () {
    $response = $this->getJson('/api/v1/health');

    $response->assertStatus(200)
        ->assertJsonPath('data.status', 'ok');
});

it('returns 404 RFC 7807 problem details on unknown host for non-exempt routes', function () {
    $response = $this->withServerVariables(['HTTP_HOST' => 'unknown.college.in'])
        ->getJson('/api/v1/meta');

    $response->assertStatus(404)
        ->assertHeader('Content-Type', 'application/problem+json')
        ->assertJsonPath('title', 'Tenant Not Found')
        ->assertJsonPath('status', 404);
});

it('returns 403 when tenant is suspended', function () {
    config(['app_profile.deploy_profile' => 'cloud']);

    $tenant = $this->provisioner->provision('tenant_susp', 'Suspended College', 'susp.test', 'cloud');
    $tenant->update(['status' => 'suspended']);

    $response = $this->getJson('http://susp.test/api/v1/meta');

    $response->assertStatus(403)
        ->assertHeader('Content-Type', 'application/problem+json')
        ->assertJsonPath('title', 'Tenant Suspended')
        ->assertJsonPath('status', 403);
});

it('returns 403 when tenant license and grace period are expired', function () {
    config(['app_profile.deploy_profile' => 'cloud']);

    $tenant = $this->provisioner->provision('tenant_lic', 'Expired License College', 'lic.test', 'cloud');
    /** @var License $license */
    $license = $tenant->license;
    $license->update(['valid_until' => now()->subDays(35)]);

    $response = $this->getJson('http://lic.test/api/v1/meta');

    $response->assertStatus(403)
        ->assertHeader('Content-Type', 'application/problem+json')
        ->assertJsonPath('title', 'License Expired')
        ->assertJsonPath('status', 403);
});

it('returns 400 when host domain and X-Tenant header mismatch', function () {
    config(['app_profile.deploy_profile' => 'cloud']);

    $tenant1 = $this->provisioner->provision('tenant_one', 'One College', 'one.test', 'cloud');
    $tenant2 = $this->provisioner->provision('tenant_two', 'Two College', 'two.test', 'cloud');

    $response = $this->withHeaders(['X-Tenant' => $tenant2->slug])
        ->getJson('http://one.test/api/v1/meta');

    $response->assertStatus(400)
        ->assertHeader('Content-Type', 'application/problem+json')
        ->assertJsonPath('title', 'Tenant Mismatch')
        ->assertJsonPath('status', 400);
});

it('resolves valid tenant and serves /api/v1/meta probe in standard envelope', function () {
    config(['app_profile.deploy_profile' => 'cloud']);

    $tenant = $this->provisioner->provision('tenant_meta', 'Meta College', 'meta.test', 'cloud');

    $response = $this->getJson('http://meta.test/api/v1/meta');

    $response->assertStatus(200)
        ->assertJsonPath('data.server_version', '1.0.0')
        ->assertJsonPath('data.api_version', 'v1')
        ->assertJsonPath('meta.tenant.slug', 'tenant_meta')
        ->assertJsonPath('meta.tenant.name', 'Meta College');
});

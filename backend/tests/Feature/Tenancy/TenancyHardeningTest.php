<?php

declare(strict_types=1);

use App\Core\Tenancy\Models\Domain;
use App\Core\Tenancy\Models\License;
use App\Core\Tenancy\Models\TenantDatabase;
use App\Core\Tenancy\Models\TenantSetting;
use App\Core\Tenancy\Services\TenantProvisioner;
use App\Core\Tenancy\TenantContext;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

beforeEach(function () {
    $this->purgeAllTenantDatabases();
    $this->provisioner = app(TenantProvisioner::class);
    $this->context = app(TenantContext::class);
});

afterEach(function () {
    $this->purgeAllTenantDatabases();
});

// -----------------------------------------------------------------------------
// A4. Cache Invalidation & Licenses
// -----------------------------------------------------------------------------

it('invalidates cache immediately when tenant status changes', function () {
    config(['app_profile.deploy_profile' => 'cloud']);

    $tenant = $this->provisioner->provision('tenant_inval_stat', 'Status Inval College', 'stat.test', 'cloud');

    // 1. Warm cache
    $res1 = $this->getJson('http://stat.test/api/v1/meta');
    $res1->assertOk()
        ->assertJsonPath('meta.tenant.slug', 'tenant_inval_stat');

    // 2. Change status to suspended
    $tenant->update(['status' => 'suspended']);

    // 3. Next request must immediately receive 403 Forbidden without waiting for TTL
    $res2 = $this->getJson('http://stat.test/api/v1/meta');
    $res2->assertStatus(403)
        ->assertJsonPath('title', 'Tenant Suspended');
});

it('invalidates cache immediately when license is changed or expired', function () {
    config(['app_profile.deploy_profile' => 'cloud']);

    $tenant = $this->provisioner->provision('tenant_inval_lic', 'License Inval College', 'licinval.test', 'cloud');

    // 1. Warm cache
    $res1 = $this->getJson('http://licinval.test/api/v1/meta');
    $res1->assertOk();

    // 2. Expire license past grace period
    $tenant->license->update(['valid_until' => now()->subDays(35)]);

    // 3. Next request must immediately receive 403 Forbidden
    $res2 = $this->getJson('http://licinval.test/api/v1/meta');
    $res2->assertStatus(403)
        ->assertJsonPath('title', 'License Expired');
});

it('invalidates cache immediately when domain is modified', function () {
    config(['app_profile.deploy_profile' => 'cloud']);

    $tenant = $this->provisioner->provision('tenant_inval_dom', 'Domain Inval College', 'olddom.test', 'cloud');

    // 1. Warm cache on old domain
    $res1 = $this->getJson('http://olddom.test/api/v1/meta');
    $res1->assertOk();

    // 2. Change domain
    $domain = $tenant->primaryDomain;
    $domain->update(['domain' => 'newdom.test']);

    // 3. Old domain must immediately return 404
    $resOld = $this->getJson('http://olddom.test/api/v1/meta');
    $resOld->assertStatus(404);

    // 4. New domain must immediately return 200
    $resNew = $this->getJson('http://newdom.test/api/v1/meta');
    $resNew->assertOk()
        ->assertJsonPath('meta.tenant.slug', 'tenant_inval_dom');
});

it('returns 403 Forbidden when a tenant has no license row', function () {
    config(['app_profile.deploy_profile' => 'cloud']);

    $tenant = $this->provisioner->provision('tenant_no_lic', 'No Lic College', 'nolic.test', 'cloud');

    // Delete license row
    $tenant->license()->delete();

    $res = $this->getJson('http://nolic.test/api/v1/meta');
    $res->assertStatus(403)
        ->assertJsonPath('title', 'License Required')
        ->assertJsonPath('detail', 'No active license found for this institution.');
});

// -----------------------------------------------------------------------------
// A5. app:install domain and hostname validation
// -----------------------------------------------------------------------------

it('validates that app:install rejects invalid hostnames', function () {
    $exitCode = Artisan::call('app:install', [
        '--domain' => 'http://invalid-host/path',
        '--no-interaction' => true,
    ]);

    expect($exitCode)->not->toBe(0);
});

// -----------------------------------------------------------------------------
// A6. Prepared statements parameter binding safety under emulation
// -----------------------------------------------------------------------------

it('safely handles bound parameters with quotes, backslashes, null bytes and multibyte text', function () {
    $tenant = $this->provisioner->provision('tenant_prep_safe', 'Prep Safe College', 'safe.test');

    $this->context->setTenant($tenant);

    $testPayload = [
        'single_quote' => "O'Reilly ' OR '1'='1",
        'double_quote' => 'He said "Hello" and \\"escaped\\"',
        'backslashes' => 'C:\\Windows\\System32\\drivers\\etc\\hosts\\\\',
        'null_byte' => "admin\0injection_attempt",
        'malayalam' => 'കാമ്പസ് ലിങ്ക് പോളിടെക്നിക് മാനേജ്മെന്റ് സിസ്റ്റം',
        'emojis' => '🎓📚🚀✨ 100%',
        'mixed' => "Special: ';\nDROP TABLE students;-- \\ \0 മലയാളം 🌟",
    ];

    DB::connection('tenant')->table('tenant_settings')->insert([
        'key' => 'security_payload_test',
        'value' => json_encode($testPayload, JSON_THROW_ON_ERROR),
        'created_at' => now(),
        'updated_at' => now(),
    ]);

    // Query back using parameter bindings
    $retrieved = TenantSetting::where('key', 'security_payload_test')->first();

    expect($retrieved)->not->toBeNull()
        ->and($retrieved->value['single_quote'])->toBe($testPayload['single_quote'])
        ->and($retrieved->value['double_quote'])->toBe($testPayload['double_quote'])
        ->and($retrieved->value['backslashes'])->toBe($testPayload['backslashes'])
        ->and($retrieved->value['malayalam'])->toBe($testPayload['malayalam'])
        ->and($retrieved->value['emojis'])->toBe($testPayload['emojis'])
        ->and($retrieved->value['mixed'])->toBe($testPayload['mixed']);

    // Direct parameter query test
    $direct = DB::connection('tenant')->selectOne(
        'SELECT ? as param_text',
        ["' OR 1=1; -- മലയാളം 🎓"]
    );

    expect($direct->param_text)->toBe("' OR 1=1; -- മലയാളം 🎓");

    // Null byte safety check: PostgreSQL / PDO does not execute injection through null bytes
    $nullByteQuery = DB::connection('tenant')->selectOne(
        'SELECT ? as null_param',
        ["safe_prefix\0injection_payload"]
    );
    expect($nullByteQuery->null_param)->toBe('safe_prefix');

    $this->context->forget();
});

// -----------------------------------------------------------------------------
// A8. Landlord DB Integrity Constraints
// -----------------------------------------------------------------------------

it('enforces CHECK constraint on tenants.status', function () {
    expect(function () {
        DB::connection('landlord')->table('tenants')->insert([
            'id' => (string) Str::ulid(),
            'slug' => 'bad_status_test',
            'name' => 'Bad Status College',
            'status' => 'invalid_status_enum',
            'deploy_profile' => 'cloud',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    })->toThrow(QueryException::class);
});

it('enforces CHECK constraint on tenants.deploy_profile', function () {
    expect(function () {
        DB::connection('landlord')->table('tenants')->insert([
            'id' => (string) Str::ulid(),
            'slug' => 'bad_profile_test',
            'name' => 'Bad Profile College',
            'status' => 'active',
            'deploy_profile' => 'invalid_profile',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    })->toThrow(QueryException::class);
});

it('enforces partial unique index for primary domains per tenant', function () {
    $tenant = $this->provisioner->provision('tenant_multi_dom', 'Multi Dom College', 'prim1.test');

    expect(function () use ($tenant) {
        Domain::create([
            'tenant_id' => $tenant->id,
            'domain' => 'prim2.test',
            'is_primary' => true,
        ]);
    })->toThrow(QueryException::class);
});

it('enforces UNIQUE (tenant_id) constraint on tenant_databases', function () {
    $tenant = $this->provisioner->provision('tenant_dup_db', 'Dup DB College', 'dupdb.test');

    expect(function () use ($tenant) {
        TenantDatabase::create([
            'tenant_id' => $tenant->id,
            'host' => '127.0.0.1',
            'port' => 6432,
            'database' => 'tenant_another_db',
            'username' => 'another_u',
            'password' => 'secret',
        ]);
    })->toThrow(QueryException::class);
});

it('enforces UNIQUE (tenant_id) constraint on licenses', function () {
    $tenant = $this->provisioner->provision('tenant_dup_lic', 'Dup Lic College', 'duplic.test');

    expect(function () use ($tenant) {
        License::create([
            'tenant_id' => $tenant->id,
            'plan' => 'enterprise',
            'modules' => ['identity'],
            'valid_until' => now()->addYear(),
        ]);
    })->toThrow(QueryException::class);
});

it('enforces UNIQUE (tenant_id, version) constraint on schema_versions', function () {
    $tenant = $this->provisioner->provision('tenant_dup_sch', 'Dup Sch College', 'dupsch.test');

    // Inserting a duplicate (tenant_id, version) row into schema_versions must throw QueryException
    expect(function () use ($tenant) {
        DB::connection('landlord')->table('schema_versions')->insert([
            'id' => (string) Str::ulid(),
            'tenant_id' => $tenant->id,
            'version' => '1.0.0',
            'migrated_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    })->toThrow(QueryException::class);
});

// -----------------------------------------------------------------------------
// A9. PostgreSQL Role Hygiene Verification
// -----------------------------------------------------------------------------

it('verifies that tenant PostgreSQL roles are created with least-privilege hygiene flags', function () {
    $tenant = $this->provisioner->provision('tenant_hygiene', 'Hygiene College', 'hygiene.test');
    $roleName = (string) config('tenancy.db_prefix', 'tenant_').'tenant_hygiene_u';

    $roleInfo = DB::connection('pgsql_admin')->selectOne(
        'SELECT rolname, rolsuper, rolcreaterole, rolcreatedb, rolreplication, rolinherit FROM pg_roles WHERE rolname = ?',
        [$roleName]
    );

    expect($roleInfo)->not->toBeNull()
        ->and($roleInfo->rolname)->toBe($roleName)
        ->and($roleInfo->rolsuper)->toBeFalse()
        ->and($roleInfo->rolcreaterole)->toBeFalse()
        ->and($roleInfo->rolcreatedb)->toBeFalse()
        ->and($roleInfo->rolreplication)->toBeFalse()
        ->and($roleInfo->rolinherit)->toBeFalse();
});

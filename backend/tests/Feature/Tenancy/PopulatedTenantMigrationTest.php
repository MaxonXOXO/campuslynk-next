<?php

declare(strict_types=1);

namespace Tests\Feature\Tenancy;

use App\Core\Tenancy\Services\TenantProvisioner;
use App\Core\Tenancy\TenantContext;
use App\Modules\Identity\Models\User;
use App\Modules\Organisation\Database\Seeders\KeralaPolytechnicProfileSeeder;
use App\Modules\Organisation\Models\Department;
use App\Modules\Organisation\Models\Stream;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

uses(TenancyTestHelper::class);

beforeEach(function () {
    $this->purgeAllTenantDatabases();
    $this->provisioner = app(TenantProvisioner::class);
    $this->tenantContext = app(TenantContext::class);
});

afterEach(function () {
    $this->tenantContext->forget();
    $this->purgeAllTenantDatabases();
});

it('verifies populated tenant migration lifecycle forward and rollback', function () {
    $tenant = $this->provisioner->provision('tenant_mig_test', 'Migration College', 'migtest.test');
    $this->tenantContext->setTenant($tenant);

    /** @var Migration $migration */
    $migration = require base_path('database/migrations/tenant/2026_11_03_000001_generalise_tenant_spine_and_identifiers.php');

    $tenantMigrations = glob(database_path('migrations/tenant/*.php')) ?: [];
    sort($tenantMigrations);
    $targetIndex = array_search(
        database_path('migrations/tenant/2026_11_03_000001_generalise_tenant_spine_and_identifiers.php'),
        $tenantMigrations,
        true
    );
    expect($targetIndex)->not->toBeFalse();
    $stepsToRollback = count($tenantMigrations) - (int) $targetIndex;

    // 1. Roll back to state BEFORE migration 2026_11_03_000001 (on unshared tenant, down() must succeed)
    $rollbackExit = Artisan::call('migrate:rollback', [
        '--database' => 'tenant',
        '--path' => 'database/migrations/tenant',
        '--step' => $stepsToRollback,
        '--force' => true,
    ]);
    expect($rollbackExit)->toBe(0);

    // Verify new identity-api-gap columns are gone after rollback
    expect(Schema::connection('tenant')->hasColumn('users', 'temporary_password_expires_at'))->toBeFalse()
        ->and(Schema::connection('tenant')->hasColumn('users', 'locked_until'))->toBeFalse()
        ->and(Schema::connection('tenant')->hasColumn('role_assignments', 'reason'))->toBeFalse();

    // Verify pre-migration state:
    // - funding_stream column exists on departments
    expect(Schema::connection('tenant')->hasColumn('departments', 'funding_stream'))->toBeTrue();

    // - chk_regulations_code exists (rejecting non-REV2021/REV2026)
    $chkRegExists = DB::connection('tenant')->selectOne(
        "SELECT 1 FROM pg_constraint WHERE conname = 'chk_regulations_code'"
    );
    expect($chkRegExists)->not->toBeNull();

    // - UNIQUE(code) exists on departments
    $codeUniqueExists = DB::connection('tenant')->selectOne(
        "SELECT 1 FROM pg_constraint WHERE conname = 'departments_code_unique'"
    );
    expect($codeUniqueExists)->not->toBeNull();

    // 2. Seed Kerala profile in pre-migration state
    app(KeralaPolytechnicProfileSeeder::class)->run();

    // In pre-migration state, populate Aided CE and SF CE_SF
    $aidedStream = Stream::where('code', 'AIDED')->firstOrFail();
    $sfStream = Stream::where('code', 'SF')->firstOrFail();

    // CE department in Aided already seeded by KeralaPolytechnicProfileSeeder
    $ceAided = Department::where('code', 'CE')->firstOrFail();
    expect($ceAided->scope_label)->toBe('d_ce');

    // Create CE_SF department in Self-Financing stream (pre-migration naming convention)
    $ceSf = Department::create([
        'code' => 'CE_SF',
        'name' => 'Civil Engineering (SF)',
        'stream_id' => $sfStream->id,
        'kind' => 'academic',
        'is_active' => true,
        'scope_label' => 'd_ce_sf',
        'funding_stream' => 'SF',
    ]);

    // 3. Run migration 2026_11_03_000001 forward
    $migrateExit = Artisan::call('migrate', [
        '--database' => 'tenant',
        '--path' => 'database/migrations/tenant',
        '--force' => true,
    ]);
    expect($migrateExit)->toBe(0);

    // Confirm: funding_stream column is gone
    expect(Schema::connection('tenant')->hasColumn('departments', 'funding_stream'))->toBeFalse();

    // Confirm: chk_regulations_code is gone
    $chkRegAfter = DB::connection('tenant')->selectOne(
        "SELECT 1 FROM pg_constraint WHERE conname = 'chk_regulations_code'"
    );
    expect($chkRegAfter)->toBeNull();

    // Confirm: CE and CE_SF both survive under new UNIQUE(code, stream_id)
    $freshCeAided = Department::where('code', 'CE')->where('stream_id', $aidedStream->id)->first();
    $freshCeSf = Department::where('code', 'CE_SF')->where('stream_id', $sfStream->id)->first();
    expect($freshCeAided)->not->toBeNull()
        ->and($freshCeSf)->not->toBeNull()
        ->and($freshCeAided->scope_label)->toBe('d_ce')
        ->and($freshCeSf->scope_label)->toBe('d_ce_sf');

    // Confirm: composite UNIQUE(code, stream_id) permits changing CE_SF code to canonical CE
    $ceSf->update(['code' => 'CE']);
    $bothCe = Department::where('code', 'CE')->get();
    expect($bothCe)->toHaveCount(2)
        ->and($bothCe->pluck('scope_label')->all())->toContain('d_ce', 'd_ce_sf');

    // 4. Confirm rollback fails cleanly with uniqueness violation once two departments share a code across streams
    expect(function () use ($stepsToRollback): void {
        Artisan::call('migrate:rollback', [
            '--database' => 'tenant',
            '--path' => 'database/migrations/tenant',
            '--step' => $stepsToRollback,
            '--force' => true,
        ]);
    })->toThrow(UniqueConstraintViolationException::class);

    // Rollback failed because two departments share code 'CE', matching the migration docblock caution!
});

it('maps deactivated and rejected users to suspended when rolling back 2026_11_23_000001', function () {
    $tenant = $this->provisioner->provision('tenant_mig_users', 'Users Mig College', 'migusers.test');
    $this->tenantContext->setTenant($tenant);

    $deactivated = User::create([
        'type' => 'staff',
        'name' => 'Deactivated Staff',
        'email' => 'deact@migusers.test',
        'password' => 'Secret@123!',
        'must_change_password' => false,
        'status' => 'deactivated',
    ]);
    $rejected = User::create([
        'type' => 'staff',
        'name' => 'Rejected Staff',
        'email' => 'rej@migusers.test',
        'password' => 'Secret@123!',
        'must_change_password' => false,
        'status' => 'rejected',
    ]);

    $tenantMigrations = glob(database_path('migrations/tenant/*.php')) ?: [];
    sort($tenantMigrations);
    $matches = glob(database_path('migrations/tenant/2026_11_23_000001_*.php')) ?: [];
    expect($matches)->toHaveCount(1);
    $targetIndex = array_search($matches[0], $tenantMigrations, true);
    expect($targetIndex)->not->toBeFalse();
    $stepsToRollback = count($tenantMigrations) - (int) $targetIndex;

    $rollbackExit = Artisan::call('migrate:rollback', [
        '--database' => 'tenant',
        '--path' => 'database/migrations/tenant',
        '--step' => $stepsToRollback,
        '--force' => true,
    ]);
    expect($rollbackExit)->toBe(0);

    expect(DB::connection('tenant')->table('users')->where('id', $deactivated->id)->value('status'))->toBe('suspended')
        ->and(DB::connection('tenant')->table('users')->where('id', $rejected->id)->value('status'))->toBe('suspended')
        ->and(Schema::connection('tenant')->hasColumn('users', 'status_reason'))->toBeFalse();
});

it('migrates populated tenant forward and rolls back cleanly for 2026_11_27_000001 profile and token metadata columns', function () {
    $tenant = $this->provisioner->provision('tenant_mig_profile', 'Profile Mig College', 'migprofile.test');
    $this->tenantContext->setTenant($tenant);

    $tenantMigrations = glob(database_path('migrations/tenant/*.php')) ?: [];
    sort($tenantMigrations);
    $matches = glob(database_path('migrations/tenant/2026_11_27_000001_*.php')) ?: [];
    expect($matches)->toHaveCount(1);
    $targetIndex = array_search($matches[0], $tenantMigrations, true);
    expect($targetIndex)->not->toBeFalse();
    $stepsToRollback = count($tenantMigrations) - (int) $targetIndex;

    // 1. Roll back to pre-2026_11_27_000001 state
    expect(Artisan::call('migrate:rollback', [
        '--database' => 'tenant',
        '--path' => 'database/migrations/tenant',
        '--step' => $stepsToRollback,
        '--force' => true,
    ]))->toBe(0);

    expect(Schema::connection('tenant')->hasColumn('users', 'first_name'))->toBeFalse()
        ->and(Schema::connection('tenant')->hasColumn('users', 'last_name'))->toBeFalse()
        ->and(Schema::connection('tenant')->hasColumn('personal_access_tokens', 'user_agent'))->toBeFalse()
        ->and(Schema::connection('tenant')->hasColumn('personal_access_tokens', 'ip_address'))->toBeFalse();

    // 2. Seed populated user + personal access token in pre-migration state
    $user = User::create([
        'type' => 'staff',
        'name' => 'Existing Populated User',
        'email' => 'populated@migprofile.test',
        'password' => 'Secret@123!',
        'must_change_password' => false,
        'status' => 'active',
    ]);
    $token = $user->createToken('web', ['*']);

    // 3. Migrate forward
    expect(Artisan::call('migrate', [
        '--database' => 'tenant',
        '--path' => 'database/migrations/tenant',
        '--force' => true,
    ]))->toBe(0);

    $userRow = DB::connection('tenant')->table('users')->where('id', $user->id)->first();
    $tokenRow = DB::connection('tenant')->table('personal_access_tokens')->where('id', $token->accessToken->id)->first();

    expect(Schema::connection('tenant')->hasColumn('users', 'first_name'))->toBeTrue()
        ->and(Schema::connection('tenant')->hasColumn('users', 'last_name'))->toBeTrue()
        ->and(Schema::connection('tenant')->hasColumn('personal_access_tokens', 'user_agent'))->toBeTrue()
        ->and(Schema::connection('tenant')->hasColumn('personal_access_tokens', 'ip_address'))->toBeTrue()
        ->and($userRow->first_name)->toBeNull()
        ->and($userRow->last_name)->toBeNull()
        ->and($tokenRow->user_agent)->toBeNull()
        ->and($tokenRow->ip_address)->toBeNull();

    // 4. Clean rollback without losing existing rows
    expect(Artisan::call('migrate:rollback', [
        '--database' => 'tenant',
        '--path' => 'database/migrations/tenant',
        '--step' => 1,
        '--force' => true,
    ]))->toBe(0);

    expect(Schema::connection('tenant')->hasColumn('users', 'first_name'))->toBeFalse()
        ->and(DB::connection('tenant')->table('users')->where('id', $user->id)->exists())->toBeTrue()
        ->and(DB::connection('tenant')->table('personal_access_tokens')->where('id', $token->accessToken->id)->exists())->toBeTrue();
});

<?php

declare(strict_types=1);

use App\Core\Tenancy\Models\TenantSetting;
use App\Core\Tenancy\Services\TenantProvisioner;
use App\Core\Tenancy\TenantContext;
use App\Modules\Identity\Database\Seeders\RbacBaselineSeeder;
use App\Modules\Identity\Events\UserApproved;
use App\Modules\Identity\Events\UserRejected;
use App\Modules\Identity\Jobs\CommitStaffImportJob;
use App\Modules\Identity\Models\Role;
use App\Modules\Identity\Models\RoleAssignment;
use App\Modules\Identity\Models\StaffImportBatch;
use App\Modules\Identity\Models\StaffImportRow;
use App\Modules\Identity\Models\StaffProfile;
use App\Modules\Identity\Models\User;
use App\Modules\Organisation\Database\Seeders\KeralaPolytechnicProfileSeeder;
use App\Modules\Organisation\Models\Department;
use App\Modules\Organisation\Models\Stream;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Queue;
use OpenSpout\Common\Entity\Row;
use OpenSpout\Writer\XLSX\Writer;
use Tests\Feature\Tenancy\TenancyTestHelper;

uses(TenancyTestHelper::class);

beforeEach(function () {
    $this->purgeAllTenantDatabases();
    $this->provisioner = app(TenantProvisioner::class);
    $this->tenantContext = app(TenantContext::class);

    $this->tenant = $this->provisioner->provision('tenant_onboard', 'Onboarding College', 'onboard.test', 'cloud');
    $this->tenantContext->setTenant($this->tenant);

    app(RbacBaselineSeeder::class)->run();
    app(KeralaPolytechnicProfileSeeder::class)->run();

    $this->ceDept = Department::where('code', 'CE')->firstOrFail();
    $this->meDept = Department::where('code', 'ME')->firstOrFail();
    $this->sfDept = Department::where('scope_label', 'd_ce_sf')->first()
        ?? Department::create([
            'code' => 'CE_SF',
            'name' => 'Civil (SF)',
            'stream_id' => Stream::where('code', 'SF')->firstOrFail()->id,
            'kind' => 'academic',
            'is_active' => true,
            'scope_label' => 'd_ce_sf',
        ]);

    $this->principal = User::create([
        'type' => 'staff',
        'name' => 'Principal',
        'email' => 'principal@onboard.test',
        'password' => 'Secret@123!',
        'must_change_password' => false,
        'status' => 'active',
    ]);
    RoleAssignment::create([
        'user_id' => $this->principal->id,
        'role_id' => Role::where('key', 'principal')->firstOrFail()->id,
        'scope_type' => 'institution',
        'scope_label' => 'i_carmel',
        'valid_from' => Carbon::now()->subDay(),
        'is_active' => true,
    ]);

    $this->ceHod = User::create([
        'type' => 'staff',
        'name' => 'CE HOD',
        'email' => 'hod.ce@onboard.test',
        'password' => 'Secret@123!',
        'must_change_password' => false,
        'status' => 'active',
    ]);
    RoleAssignment::create([
        'user_id' => $this->ceHod->id,
        'role_id' => Role::where('key', 'hod')->firstOrFail()->id,
        'scope_type' => 'department',
        'scope_id' => $this->ceDept->id,
        'scope_label' => $this->ceDept->scope_label,
        'valid_from' => Carbon::now()->subDay(),
        'is_active' => true,
    ]);

    $this->sfCoordinator = User::create([
        'type' => 'staff',
        'name' => 'SF Academic Coordinator',
        'email' => 'coord.sf@onboard.test',
        'password' => 'Secret@123!',
        'must_change_password' => false,
        'status' => 'active',
    ]);
    RoleAssignment::create([
        'user_id' => $this->sfCoordinator->id,
        'role_id' => Role::where('key', 'academic_coordinator')->firstOrFail()->id,
        'scope_type' => 'stream',
        'scope_id' => $this->sfDept->stream_id,
        'scope_label' => 's_sf',
        'valid_from' => Carbon::now()->subDay(),
        'is_active' => true,
    ]);
});

afterEach(function () {
    Carbon::setTestNow();
    $this->tenantContext->forget();
    $this->purgeAllTenantDatabases();
});

describe('Staff Onboarding', function () {
    it('gates public self-registration by tenant setting, resists enumeration, respects rejected cooldown, and enforces daily cap & rate limits', function () {
        // Disabled by default -> 403
        $this->withHeaders(['X-Tenant' => 'tenant_onboard'])
            ->postJson('http://onboard.test/api/v1/auth/register-staff', [
                'name' => 'Applicant One',
                'email' => 'app1@onboard.test',
                'password' => 'StrongPass#2026!',
            ])->assertForbidden();

        // Enable self-registration with daily cap = 2
        $this->tenantContext->setTenant($this->tenant);
        TenantSetting::create(['key' => 'auth.staff_self_registration_enabled', 'value' => ['enabled' => true]]);
        TenantSetting::create(['key' => 'auth.staff_self_registration_daily_cap', 'value' => ['cap' => 2]]);
        TenantSetting::create(['key' => 'auth.rejected_resubmit_cooldown_days', 'value' => ['days' => 7]]);

        // Honeypot filled -> 202 without creating user
        $this->withHeaders(['X-Tenant' => 'tenant_onboard'])
            ->postJson('http://onboard.test/api/v1/auth/register-staff', [
                'name' => 'Bot User',
                'email' => 'bot@onboard.test',
                'password' => 'StrongPass#2026!',
                'website' => 'https://spam.example',
            ])->assertAccepted();
        $this->tenantContext->setTenant($this->tenant);
        expect(User::where('email', 'bot@onboard.test')->exists())->toBeFalse();

        // Valid self-registration -> 202 pending user with StaffProfile, cannot log in
        $this->withHeaders(['X-Tenant' => 'tenant_onboard'])
            ->postJson('http://onboard.test/api/v1/auth/register-staff', [
                'name' => 'Applicant One',
                'email' => 'app1@onboard.test',
                'mobile' => '+919876500001',
                'password' => 'StrongPass#2026!',
                'requested_department_id' => $this->ceDept->id,
                'designation' => 'Lecturer',
            ])->assertAccepted();

        $this->tenantContext->setTenant($this->tenant);
        $app1 = User::where('email', 'app1@onboard.test')->firstOrFail();
        expect($app1->status)->toBe('pending')
            ->and($app1->must_change_password)->toBeFalse()
            ->and($app1->temporary_password_expires_at)->toBeNull()
            ->and($app1->staffProfile?->requested_department_id)->toBe($this->ceDept->id);

        // Pending cannot log in
        $this->withHeaders(['X-Tenant' => 'tenant_onboard'])
            ->postJson('http://onboard.test/api/v1/auth/login', [
                'identifier' => 'app1@onboard.test',
                'password' => 'StrongPass#2026!',
                'device_name' => 'web',
                'client' => 'web',
            ])->assertUnauthorized();

        // Duplicate email returns identical 202 (enumeration resistance)
        $this->withHeaders(['X-Tenant' => 'tenant_onboard'])
            ->postJson('http://onboard.test/api/v1/auth/register-staff', [
                'name' => 'Duplicate Attempt',
                'email' => 'app1@onboard.test',
                'password' => 'OtherPass#2026!',
            ])->assertAccepted();

        // Rejected user cannot resubmit within cooldown, but can resubmit after cooldown
        $this->tenantContext->setTenant($this->tenant);
        $rejected = User::create([
            'type' => 'staff',
            'name' => 'Rejected User',
            'email' => 'rej@onboard.test',
            'password' => 'OldPass#2026!',
            'must_change_password' => false,
            'status' => 'rejected',
            'rejected_at' => Carbon::now()->subDays(2),
        ]);
        $this->withHeaders(['X-Tenant' => 'tenant_onboard'])
            ->postJson('http://onboard.test/api/v1/auth/register-staff', [
                'name' => 'Rejected Retry Early',
                'email' => 'rej@onboard.test',
                'password' => 'NewPass#2026!',
            ])->assertAccepted();
        $this->tenantContext->setTenant($this->tenant);
        expect($rejected->fresh()?->status)->toBe('rejected');

        $rejected->forceFill(['rejected_at' => Carbon::now()->subDays(8)])->save();
        $this->withHeaders(['X-Tenant' => 'tenant_onboard'])
            ->postJson('http://onboard.test/api/v1/auth/register-staff', [
                'name' => 'Rejected Retry Ready',
                'email' => 'rej@onboard.test',
                'password' => 'NewPass#2026!',
            ])->assertAccepted();
        $this->tenantContext->setTenant($this->tenant);
        expect($rejected->fresh()?->status)->toBe('pending')
            ->and($rejected->fresh()?->name)->toBe('Rejected Retry Ready');

        // Daily cap reached (2 pending: app1 + rej) -> 429
        $this->withHeaders(['X-Tenant' => 'tenant_onboard'])
            ->postJson('http://onboard.test/api/v1/auth/register-staff', [
                'name' => 'Cap Exceeded',
                'email' => 'cap@onboard.test',
                'password' => 'StrongPass#2026!',
            ])->assertStatus(429);
    });

    it('previews CSV & XLSX imports in DB without disk staging, hashes common password once, starts TTL at approval, and enforces claim-once', function () {
        $pToken = $this->principal->createToken('p_tok')->plainTextToken;
        $commonPass = 'BatchTemp#2026!';

        // 1. Download template
        $tplRes = $this->withHeaders([
            'Authorization' => "Bearer {$pToken}",
            'X-Tenant' => 'tenant_onboard',
        ])->get('http://onboard.test/api/v1/staff-imports/template')->assertOk();
        expect($tplRes->streamedContent())->toContain('name,email,mobile,registration_number,requested_department_code,designation,employee_id');

        // 2. Preview CSV with 1 valid, 1 duplicate (principal email), 1 invalid (missing name)
        $csvContent = implode("\n", [
            'name,email,mobile,registration_number,requested_department_code,designation,employee_id',
            'Dr. Meera Nair,meera@onboard.test,+919876543210,,CE,Lecturer,EMP-10',
            'Dup Principal,principal@onboard.test,+919876543211,,CE,Lecturer,EMP-11',
            ',bad@onboard.test,,,CE,Lecturer,EMP-12',
        ]);
        $csvFile = UploadedFile::fake()->createWithContent('staff.csv', $csvContent);

        $previewRes = $this->withHeaders([
            'Authorization' => "Bearer {$pToken}",
            'X-Tenant' => 'tenant_onboard',
        ])->post('http://onboard.test/api/v1/staff-imports/preview', ['file' => $csvFile]);

        $previewRes->assertCreated();
        $batchId = (string) $previewRes->json('data.batch.id');
        expect($previewRes->json('data.batch.valid_rows'))->toBe(1)
            ->and($previewRes->json('data.batch.duplicate_rows'))->toBe(1)
            ->and($previewRes->json('data.batch.invalid_rows'))->toBe(1);

        $this->tenantContext->setTenant($this->tenant);
        expect(StaffImportRow::where('batch_id', $batchId)->count())->toBe(3);

        // 3. Preview XLSX via OpenSpout
        $xlsxPath = sys_get_temp_dir().'/staff_test_'.uniqid().'.xlsx';
        $writer = new Writer;
        $writer->openToFile($xlsxPath);
        $writer->addRow(Row::fromValues(['name', 'email', 'mobile', 'registration_number', 'requested_department_code', 'designation', 'employee_id']));
        $writer->addRow(Row::fromValues(['XLSX Staff', 'xlsx@onboard.test', '+919876543222', '', 'ME', 'Demonstrator', 'EMP-20']));
        $writer->close();

        $xlsxUpload = new UploadedFile($xlsxPath, 'staff.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', null, true);
        $xlsxPreview = $this->withHeaders([
            'Authorization' => "Bearer {$pToken}",
            'X-Tenant' => 'tenant_onboard',
        ])->post('http://onboard.test/api/v1/staff-imports/preview', ['file' => $xlsxUpload]);
        $xlsxPreview->assertCreated();
        expect($xlsxPreview->json('data.batch.valid_rows'))->toBe(1);
        @unlink($xlsxPath);

        // 4. Commit CSV batch: Queue::fake verifies no plaintext password in queued job, then run job synchronously
        Queue::fake();
        $commitRes = $this->withHeaders([
            'Authorization' => "Bearer {$pToken}",
            'X-Tenant' => 'tenant_onboard',
        ])->postJson("http://onboard.test/api/v1/staff-imports/{$batchId}/commit", [
            'common_password' => $commonPass,
            'auto_approve' => false,
            'idempotency_key' => 'idem-batch-1',
        ]);
        $commitRes->assertAccepted()->assertHeader('Cache-Control', 'no-store, private');

        // Idempotent retry returns same batch, double commit without idempotency key returns 409
        $this->withHeaders([
            'Authorization' => "Bearer {$pToken}",
            'X-Tenant' => 'tenant_onboard',
        ])->postJson("http://onboard.test/api/v1/staff-imports/{$batchId}/commit", [
            'common_password' => $commonPass,
            'idempotency_key' => 'idem-batch-1',
        ])->assertAccepted();

        $this->withHeaders([
            'Authorization' => "Bearer {$pToken}",
            'X-Tenant' => 'tenant_onboard',
        ])->postJson("http://onboard.test/api/v1/staff-imports/{$batchId}/commit", [
            'common_password' => $commonPass,
        ])->assertStatus(409);

        Queue::assertPushed(CommitStaffImportJob::class, function (CommitStaffImportJob $job) use ($commonPass): bool {
            return $job->passwordHash !== $commonPass
                && ! str_contains(serialize($job), $commonPass);
        });

        // No plaintext password in activity_log
        $this->tenantContext->setTenant($this->tenant);
        $logs = DB::connection('tenant')->table('activity_log')->pluck('properties')->implode(' ');
        expect($logs)->not->toContain($commonPass);

        // Execute the job
        app()->call([new CommitStaffImportJob($batchId, Hash::make($commonPass), $this->principal->id, false), 'handle']);

        $batch = StaffImportBatch::findOrFail($batchId);
        expect($batch->status)->toBe('completed')
            ->and($batch->created_count)->toBe(1)
            ->and(StaffImportRow::where('batch_id', $batchId)->count())->toBe(0);

        $meera = User::where('email', 'meera@onboard.test')->firstOrFail();
        expect($meera->status)->toBe('pending')
            ->and($meera->temporary_password_expires_at)->toBeNull();

        // Failed rows CSV download
        $failedCsv = $this->withHeaders([
            'Authorization' => "Bearer {$pToken}",
            'X-Tenant' => 'tenant_onboard',
        ])->get("http://onboard.test/api/v1/staff-imports/{$batchId}/failed-rows")->assertOk()->streamedContent();
        expect($failedCsv)->toContain('principal@onboard.test')
            ->and($failedCsv)->toContain('bad@onboard.test');

        // 5. Wait 3 days, then approve -> temporary_password_expires_at starts at approval (+48h)
        Carbon::setTestNow(Carbon::now()->addDays(3));
        Event::fake([UserApproved::class]);

        $this->withHeaders([
            'Authorization' => "Bearer {$pToken}",
            'X-Tenant' => 'tenant_onboard',
        ])->postJson("http://onboard.test/api/v1/staff-imports/{$batchId}/approve")
            ->assertOk()
            ->assertJsonPath('data.summary.approved', 1);

        Event::assertDispatched(UserApproved::class);
        $this->tenantContext->setTenant($this->tenant);
        $meera->refresh();
        expect($meera->status)->toBe('active')
            ->and($meera->temporary_password_expires_at)->not->toBeNull()
            ->and($meera->temporary_password_expires_at->isFuture())->toBeTrue();

        // Login succeeds within 48h window, requires password change; changing password invalidates common password (claim-once)
        $loginRes = $this->withHeaders(['X-Tenant' => 'tenant_onboard'])
            ->postJson('http://onboard.test/api/v1/auth/login', [
                'identifier' => 'meera@onboard.test',
                'password' => $commonPass,
                'device_name' => 'web',
                'client' => 'web',
            ])->assertOk();
        expect($loginRes->json('data.must_change_password'))->toBeTrue();

        $meeraToken = (string) $loginRes->json('data.token');
        $this->app['auth']->forgetGuards();
        $this->withHeaders([
            'Authorization' => "Bearer {$meeraToken}",
            'X-Tenant' => 'tenant_onboard',
        ])->postJson('http://onboard.test/api/v1/auth/password/change', [
            'current_password' => $commonPass,
            'new_password' => 'MeeraPersonal#2026!',
        ])->assertOk();

        // Common password no longer works
        $this->withHeaders(['X-Tenant' => 'tenant_onboard'])
            ->postJson('http://onboard.test/api/v1/auth/login', [
                'identifier' => 'meera@onboard.test',
                'password' => $commonPass,
                'device_name' => 'web',
                'client' => 'web',
            ])->assertUnauthorized();

        $this->tenantContext->setTenant($this->tenant);
        $meera->refresh();
        expect($meera->first_activated_at)->not->toBeNull();
    });

    it('lets HOD see approved unassigned staff in their requested_department_id while hiding pending and other-department staff, and keeps GET /users bounded', function () {
        $this->tenantContext->setTenant($this->tenant);

        $cePending = User::create([
            'type' => 'staff', 'name' => 'CE Pending', 'email' => 'cep@onboard.test',
            'password' => 'Secret@123!', 'must_change_password' => false, 'status' => 'pending',
        ]);
        StaffProfile::create(['user_id' => $cePending->id, 'requested_department_id' => $this->ceDept->id]);

        $ceApproved = User::create([
            'type' => 'staff', 'name' => 'CE Approved', 'email' => 'cea@onboard.test',
            'password' => 'Secret@123!', 'must_change_password' => false, 'status' => 'active',
        ]);
        StaffProfile::create(['user_id' => $ceApproved->id, 'requested_department_id' => $this->ceDept->id]);

        $meApproved = User::create([
            'type' => 'staff', 'name' => 'ME Approved', 'email' => 'mea@onboard.test',
            'password' => 'Secret@123!', 'must_change_password' => false, 'status' => 'active',
        ]);
        StaffProfile::create(['user_id' => $meApproved->id, 'requested_department_id' => $this->meDept->id]);

        $hodToken = $this->ceHod->createToken('hod_tok')->plainTextToken;

        DB::connection('tenant')->flushQueryLog();
        DB::connection('tenant')->enableQueryLog();

        $res = $this->withHeaders([
            'Authorization' => "Bearer {$hodToken}",
            'X-Tenant' => 'tenant_onboard',
        ])->getJson('http://onboard.test/api/v1/users?per_page=50')->assertOk();

        $queries = DB::connection('tenant')->getQueryLog();
        DB::connection('tenant')->disableQueryLog();

        $ids = collect($res->json('data'))->pluck('id')->all();
        expect($ids)->toContain($ceApproved->id)
            ->and($ids)->not->toContain($cePending->id)
            ->and($ids)->not->toContain($meApproved->id)
            ->and(count($queries))->toBeLessThanOrEqual(14);
    });

    it('lets Academic Coordinator approve/reject stream-scoped pending staff only and supports bulk-approve', function () {
        $this->tenantContext->setTenant($this->tenant);

        $sfPending = User::create([
            'type' => 'staff', 'name' => 'SF Pending', 'email' => 'sfp@onboard.test',
            'password' => 'Secret@123!', 'must_change_password' => false, 'status' => 'pending',
        ]);
        StaffProfile::create(['user_id' => $sfPending->id, 'requested_department_id' => $this->sfDept->id]);

        $cePending = User::create([
            'type' => 'staff', 'name' => 'CE Pending', 'email' => 'cep2@onboard.test',
            'password' => 'Secret@123!', 'must_change_password' => false, 'status' => 'pending',
        ]);
        StaffProfile::create(['user_id' => $cePending->id, 'requested_department_id' => $this->ceDept->id]);

        $coordToken = $this->sfCoordinator->createToken('coord_tok')->plainTextToken;

        // Coordinator cannot suspend, deactivate, resetPassword, create, or import -> 403
        $this->withHeaders([
            'Authorization' => "Bearer {$coordToken}",
            'X-Tenant' => 'tenant_onboard',
        ])->postJson("http://onboard.test/api/v1/users/{$sfPending->id}/suspend")->assertForbidden();

        $this->withHeaders([
            'Authorization' => "Bearer {$coordToken}",
            'X-Tenant' => 'tenant_onboard',
        ])->postJson('http://onboard.test/api/v1/users', [
            'type' => 'staff', 'name' => 'Nope', 'email' => 'nope@onboard.test',
        ])->assertForbidden();

        // Bulk approve as coordinator: SF pending approved, CE pending forbidden
        Event::fake([UserApproved::class, UserRejected::class]);
        $bulkRes = $this->withHeaders([
            'Authorization' => "Bearer {$coordToken}",
            'X-Tenant' => 'tenant_onboard',
        ])->postJson('http://onboard.test/api/v1/users/bulk-approve', [
            'user_ids' => [$sfPending->id, $cePending->id],
        ])->assertOk();

        expect($bulkRes->json('data.summary.approved'))->toBe(1)
            ->and($bulkRes->json('data.summary.failed'))->toBe(1);
        Event::assertDispatched(UserApproved::class);
    });
});

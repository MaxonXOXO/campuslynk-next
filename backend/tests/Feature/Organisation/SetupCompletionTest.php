<?php

declare(strict_types=1);

namespace Tests\Feature\Organisation;

use App\Core\Http\ProblemDetails;
use App\Core\Tenancy\Models\TenantSetting;
use App\Core\Tenancy\Services\TenantProvisioner;
use App\Core\Tenancy\TenantContext;
use App\Core\Validation\JsonSchemaValidator;
use App\Modules\Identity\Models\Activity;
use App\Modules\Identity\Models\Role;
use App\Modules\Identity\Models\RoleAssignment;
use App\Modules\Identity\Models\User;
use App\Modules\Organisation\Actions\SaveSetupStepAction;
use App\Modules\Organisation\Database\Seeders\TenantBaselineSeeder;
use App\Modules\Organisation\Models\AcademicYear;
use App\Modules\Organisation\Models\Department;
use App\Modules\Organisation\Models\Stream;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use InvalidArgumentException;
use PDO;
use RuntimeException;
use Symfony\Component\Process\InputStream;
use Symfony\Component\Process\Process;
use Tests\Feature\Tenancy\TenancyTestHelper;

uses(TenancyTestHelper::class);

beforeEach(function () {
    $this->purgeAllTenantDatabases();
    config(['app_profile.deploy_profile' => 'cloud', 'activitylog.enabled' => true, 'activitylog.buffer.enabled' => false]);
    Carbon::setTestNow('2026-11-12T09:00:00+00:00');

    $this->tenant = app(TenantProvisioner::class)->provision(
        'tenant_setup_completion', 'Setup Completion College', 'setupcompletion.test', 'cloud'
    );
    $this->tenantContext = app(TenantContext::class);
    $this->tenantContext->setTenant($this->tenant);
    app(TenantBaselineSeeder::class)->run();

    $this->admin = User::create([
        'type' => 'staff',
        'name' => 'Setup Administrator',
        'email' => 'admin@setupcompletion.test',
        'password' => Hash::make('Password123!'),
        'status' => 'active',
        'must_change_password' => false,
    ]);
    RoleAssignment::create([
        'user_id' => $this->admin->id,
        'role_id' => Role::where('key', 'super_admin')->firstOrFail()->id,
        'scope_type' => 'institution',
        'scope_label' => 'inst_root',
        'is_singleton' => false,
        'is_active' => true,
    ]);
    $this->token = $this->admin->createToken('setup-completion')->plainTextToken;
    $this->withHeaders(['Authorization' => "Bearer {$this->token}"]);
    $this->app['auth']->forgetGuards();
    $this->setupUrl = 'http://setupcompletion.test/api/v1/setup';

    $this->profile = ['name' => 'Setup Completion College', 'short_code' => 'SCC'];
    $this->calendar = [
        'working_days' => ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        'periods_per_day' => 1,
        'periods' => [['index' => 1, 'start' => '09:00', 'end' => '10:00']],
        'day_order_format' => 'numeric',
    ];
    $this->defaults = [
        'student_self_registration_enabled' => false,
        'parent_self_registration_enabled' => false,
        'approval_mode' => 'manual',
    ];
    $saveStep = app(SaveSetupStepAction::class);
    $saveStep->execute('institution_profile', $this->profile);
    $saveStep->execute('calendar_basics', $this->calendar);

    $stream = Stream::create(['code' => 'AIDED', 'name' => 'Aided', 'scope_label' => 's_aided']);
    Department::create([
        'code' => 'CE',
        'name' => 'Civil Engineering',
        'stream_id' => $stream->id,
        'kind' => 'academic',
        'scope_label' => 'd_ce',
    ]);
    AcademicYear::create([
        'label' => '2026-2027',
        'start_date' => '2026-06-01',
        'end_date' => '2027-03-31',
        'is_current' => true,
    ]);

    $this->setupBefore = TenantSetting::where('key', 'setup')->firstOrFail()->value;
    Carbon::setTestNow('2026-11-12T10:00:00+00:00');
});

afterEach(function () {
    Carbon::setTestNow();
    $this->purgeAllTenantDatabases();
});

it('initializes missing policy defaults and its timestamp, attributes the automatic write, and rejects a second completion with 409', function () {
    $this->getJson("{$this->setupUrl}/status")->assertOk()
        ->assertJsonPath('data.steps.signup_policy.values', null)
        ->assertJsonPath('data.steps.signup_policy.settings_exist', false)
        ->assertJsonPath('data.steps.signup_policy.is_completed', false);

    $this->tenantContext->setTenant($this->tenant);
    expect(TenantSetting::where('key', 'signup_policy')->exists())->toBeFalse();

    $this->app['auth']->forgetGuards();
    $completedAt = now()->toIso8601String();
    $this->postJson("{$this->setupUrl}/complete")->assertOk()
        ->assertJsonPath('data.is_completed', true)
        ->assertJsonPath('data.completed_at', $completedAt)
        ->assertJsonPath('data.steps.signup_policy.values', $this->defaults)
        ->assertJsonPath('data.steps.signup_policy.settings_exist', true)
        ->assertJsonPath('data.steps.signup_policy.is_completed', true)
        ->assertJsonPath('data.steps.signup_policy.completed_at', $completedAt)
        ->assertJsonPath('data.steps.institution_profile.values', $this->profile)
        ->assertJsonPath('data.steps.calendar_basics.values', $this->calendar);

    $this->tenantContext->setTenant($this->tenant);
    $policy = TenantSetting::where('key', 'signup_policy')->firstOrFail();
    $setup = TenantSetting::where('key', 'setup')->firstOrFail();
    expect($policy->value)->toBe($this->defaults)
        ->and(TenantSetting::where('key', 'signup_policy')->count())->toBe(1)
        ->and($setup->value['steps']['institution_profile'])->toBe($this->setupBefore['steps']['institution_profile'])
        ->and($setup->value['steps']['calendar_basics'])->toBe($this->setupBefore['steps']['calendar_basics']);

    $activity = Activity::where('event', 'signup_policy.defaults_initialized')->firstOrFail();
    expect($activity->log_name)->toBe('organisation')
        ->and($activity->subject_type)->toBe(TenantSetting::class)
        ->and($activity->subject_id)->toBe('signup_policy')
        ->and($activity->causer_type)->toBe($this->admin->getMorphClass())
        ->and($activity->causer_id)->toBe($this->admin->id)
        ->and($activity->getProperty('source'))->toBe('setup_completion');
    $policyAttributes = $policy->getAttributes();
    $setupAttributes = $setup->getAttributes();

    $this->app['auth']->forgetGuards();
    $this->getJson("{$this->setupUrl}/status")->assertOk()
        ->assertJsonPath('data.steps.signup_policy.values', $this->defaults)
        ->assertJsonPath('data.steps.signup_policy.settings_exist', true)
        ->assertJsonPath('data.steps.signup_policy.is_completed', true)
        ->assertJsonPath('data.steps.signup_policy.completed_at', $completedAt);

    Carbon::setTestNow(now()->addHour());
    $this->app['auth']->forgetGuards();
    $this->postJson("{$this->setupUrl}/complete")->assertStatus(409)
        ->assertJsonPath('type', ProblemDetails::type('setup-already-completed'));

    $this->tenantContext->setTenant($this->tenant);
    expect($policy->refresh()->getAttributes())->toBe($policyAttributes)
        ->and($setup->refresh()->getAttributes())->toBe($setupAttributes)
        ->and(TenantSetting::where('key', 'signup_policy')->count())->toBe(1)
        ->and(Activity::where('event', 'signup_policy.defaults_initialized')->count())->toBe(1);
});

it('preserves an explicitly saved custom policy, its row timestamps, and its recorded completion timestamp', function () {
    $customPolicy = [
        'student_self_registration_enabled' => true,
        'parent_self_registration_enabled' => true,
        'approval_mode' => 'auto',
    ];
    $savedAt = now()->toIso8601String();
    $this->putJson("{$this->setupUrl}/steps/signup_policy", $customPolicy)->assertOk();
    $this->tenantContext->setTenant($this->tenant);
    $policy = TenantSetting::where('key', 'signup_policy')->firstOrFail();
    $originalAttributes = $policy->getAttributes();
    Carbon::setTestNow(now()->addHour());

    $this->app['auth']->forgetGuards();
    $this->postJson("{$this->setupUrl}/complete")->assertOk()
        ->assertJsonPath('data.steps.signup_policy.values', $customPolicy)
        ->assertJsonPath('data.steps.signup_policy.completed_at', $savedAt)
        ->assertJsonPath('data.steps.signup_policy.is_completed', true);

    $this->tenantContext->setTenant($this->tenant);
    expect($policy->refresh()->getAttributes())->toBe($originalAttributes)
        ->and(Activity::where('event', 'signup_policy.defaults_initialized')->count())->toBe(0);
});

it('adds only the step timestamp when a custom policy row already exists without one', function () {
    $customPolicy = [
        'student_self_registration_enabled' => true,
        'parent_self_registration_enabled' => false,
        'approval_mode' => 'manual',
    ];
    $policy = TenantSetting::create(['key' => 'signup_policy', 'value' => $customPolicy]);
    $originalAttributes = $policy->refresh()->getAttributes();
    Carbon::setTestNow(now()->addHour());
    $completedAt = now()->toIso8601String();

    $this->postJson("{$this->setupUrl}/complete")->assertOk()
        ->assertJsonPath('data.steps.signup_policy.values', $customPolicy)
        ->assertJsonPath('data.steps.signup_policy.completed_at', $completedAt)
        ->assertJsonPath('data.steps.signup_policy.is_completed', true);

    $this->tenantContext->setTenant($this->tenant);
    expect($policy->refresh()->getAttributes())->toBe($originalAttributes)
        ->and(TenantSetting::where('key', 'setup')->firstOrFail()->value)->toBe([
            'completed_at' => $completedAt,
            'steps' => [
                ...$this->setupBefore['steps'],
                'signup_policy' => ['completed_at' => $completedAt],
            ],
        ])
        ->and(Activity::where('event', 'signup_policy.defaults_initialized')->count())->toBe(0);
});

it('recreates a missing policy using defaults without replacing its existing step timestamp', function () {
    $setup = TenantSetting::where('key', 'setup')->firstOrFail();
    $setupData = $setup->value;
    $recordedAt = '2026-11-12T09:30:00+00:00';
    $setupData['steps']['signup_policy'] = ['completed_at' => $recordedAt];
    $setup->value = $setupData;
    $setup->save();

    $this->postJson("{$this->setupUrl}/complete")->assertOk()
        ->assertJsonPath('data.steps.signup_policy.values', $this->defaults)
        ->assertJsonPath('data.steps.signup_policy.completed_at', $recordedAt)
        ->assertJsonPath('data.steps.signup_policy.is_completed', true);

    $this->tenantContext->setTenant($this->tenant);
    expect(TenantSetting::where('key', 'signup_policy')->count())->toBe(1)
        ->and(Activity::where('event', 'signup_policy.defaults_initialized')->count())->toBe(1);
});

it('still rejects missing required configuration or structural prerequisites with 422 and leaves no policy row', function (string $missingPrerequisite, array $expectedMissing) {
    if (str_ends_with($missingPrerequisite, '_row')) {
        TenantSetting::where('key', substr($missingPrerequisite, 0, -4))->delete();
    } elseif (str_ends_with($missingPrerequisite, '_timestamp')) {
        $step = substr($missingPrerequisite, 0, -10);
        $setup = TenantSetting::where('key', 'setup')->firstOrFail();
        $setupData = $setup->value;
        unset($setupData['steps'][$step]);
        $setup->value = $setupData;
        $setup->save();
    } elseif ($missingPrerequisite === 'stream') {
        // A department cannot survive without its required stream FK.
        Department::query()->delete();
        Stream::query()->delete();
    } elseif ($missingPrerequisite === 'department') {
        Department::query()->delete();
    } else {
        AcademicYear::query()->delete();
    }
    $setupBeforeFailure = TenantSetting::where('key', 'setup')->firstOrFail()->getAttributes();

    $this->postJson("{$this->setupUrl}/complete")->assertStatus(422)
        ->assertJsonPath('type', ProblemDetails::type('setup-prerequisites-missing'))
        ->assertJsonPath('errors.missing', $expectedMissing);

    $this->tenantContext->setTenant($this->tenant);
    expect(TenantSetting::where('key', 'signup_policy')->exists())->toBeFalse()
        ->and(TenantSetting::where('key', 'setup')->firstOrFail()->getAttributes())->toBe($setupBeforeFailure)
        ->and(Activity::where('event', 'signup_policy.defaults_initialized')->count())->toBe(0);
})->with([
    'profile row' => ['institution_profile_row', ['Setup step [institution_profile] is not completed.']],
    'profile timestamp' => ['institution_profile_timestamp', ['Setup step [institution_profile] is not completed.']],
    'calendar row' => ['calendar_basics_row', ['Setup step [calendar_basics] is not completed.']],
    'calendar timestamp' => ['calendar_basics_timestamp', ['Setup step [calendar_basics] is not completed.']],
    'stream' => ['stream', ['At least one stream must exist.', 'At least one department must exist.']],
    'department' => ['department', ['At least one department must exist.']],
    'academic year' => ['academic_year', ['At least one academic year must exist.']],
]);

it('rolls back the new policy row if final setup state persistence fails after policy creation', function () {
    $validator = new class extends JsonSchemaValidator
    {
        public bool $policyWasCreated = false;

        public function validateOrFail(array|string $data, string $schemaPath): array
        {
            if ($schemaPath === 'setup-state.schema.json' && is_array($data) && ! empty($data['completed_at'])) {
                $this->policyWasCreated = TenantSetting::where('key', 'signup_policy')->exists();

                throw new InvalidArgumentException('Simulated setup state persistence failure.');
            }

            return parent::validateOrFail($data, $schemaPath);
        }
    };
    $this->app->instance(JsonSchemaValidator::class, $validator);
    $this->withoutExceptionHandling();

    expect(fn () => $this->postJson("{$this->setupUrl}/complete"))
        ->toThrow(InvalidArgumentException::class, 'Simulated setup state persistence failure.');

    $this->tenantContext->setTenant($this->tenant);
    expect($validator->policyWasCreated)->toBeTrue()
        ->and(TenantSetting::where('key', 'signup_policy')->exists())->toBeFalse()
        ->and(TenantSetting::where('key', 'setup')->firstOrFail()->value)->toBe($this->setupBefore)
        ->and(Activity::where('event', 'signup_policy.defaults_initialized')->count())->toBe(0);
});

it('rolls back policy, completion markers and audit on a late failure and writes exactly once on retry', function (string $failurePoint) {
    $setupBeforeFailure = TenantSetting::where('key', 'setup')->firstOrFail()->getAttributes();
    $completedAtBeforeFailure = now()->toIso8601String();
    $auditInserted = false;
    $failedOnce = false;
    $statusTables = [];
    $observed = [];
    $message = "Simulated failure {$failurePoint}.";
    $this->app['events']->listen(QueryExecuted::class, function (QueryExecuted $event) use (
        $failurePoint, $message, &$auditInserted, &$failedOnce, &$statusTables, &$observed
    ): void {
        if ($event->connectionName !== 'tenant' || $failedOnce) {
            return;
        }

        $isAuditInsert = str_starts_with($event->sql, 'insert into "activity_log"');
        if ($isAuditInsert) {
            $auditInserted = true;
        }
        if ($auditInserted && preg_match('/^select count\(\*\) as aggregate from "(streams|departments|academic_years)"$/', $event->sql, $matches) === 1) {
            $statusTables[] = $matches[1];
        }
        $isFinalStatusRead = $auditInserted && $statusTables === ['streams', 'departments', 'academic_years'];
        if (($failurePoint === 'after audit insert' && $isAuditInsert)
            || ($failurePoint === 'after final status read' && $isFinalStatusRead)) {
            $failedOnce = true;
            $observed = [
                'policy' => TenantSetting::where('key', 'signup_policy')->firstOrFail()->value,
                'completed_at' => TenantSetting::where('key', 'setup')->firstOrFail()->value['completed_at'],
                'audit_count' => Activity::where('event', 'signup_policy.defaults_initialized')->count(),
            ];

            throw new RuntimeException($message);
        }
    });
    $this->withoutExceptionHandling();

    expect(fn () => $this->postJson("{$this->setupUrl}/complete"))->toThrow(RuntimeException::class, $message);
    $this->tenantContext->setTenant($this->tenant);
    expect($failedOnce)->toBeTrue()
        ->and($observed)->toBe([
            'policy' => $this->defaults,
            'completed_at' => $completedAtBeforeFailure,
            'audit_count' => 1,
        ])
        ->and(TenantSetting::where('key', 'signup_policy')->exists())->toBeFalse()
        ->and(TenantSetting::where('key', 'setup')->firstOrFail()->getAttributes())->toBe($setupBeforeFailure)
        ->and(Activity::where('event', 'signup_policy.defaults_initialized')->count())->toBe(0);
    if ($failurePoint === 'after final status read') {
        expect($statusTables)->toBe(['streams', 'departments', 'academic_years']);
    }

    $this->withExceptionHandling();
    Carbon::setTestNow(now()->addHour());
    $completedAt = now()->toIso8601String();
    $this->app['auth']->forgetGuards();
    $this->postJson("{$this->setupUrl}/complete")->assertOk()
        ->assertJsonPath('data.completed_at', $completedAt)
        ->assertJsonPath('data.steps.signup_policy.values', $this->defaults)
        ->assertJsonPath('data.steps.signup_policy.completed_at', $completedAt);
    $this->tenantContext->setTenant($this->tenant);
    expect(TenantSetting::where('key', 'signup_policy')->count())->toBe(1)
        ->and(Activity::where('event', 'signup_policy.defaults_initialized')->count())->toBe(1)
        ->and(Activity::where('event', 'signup_policy.defaults_initialized')->firstOrFail()->causer_id)->toBe($this->admin->id);

    $this->app['auth']->forgetGuards();
    $this->postJson("{$this->setupUrl}/complete")->assertStatus(409);
    $this->tenantContext->setTenant($this->tenant);
    expect(TenantSetting::where('key', 'signup_policy')->count())->toBe(1)
        ->and(Activity::where('event', 'signup_policy.defaults_initialized')->count())->toBe(1)
        ->and(TenantSetting::where('key', 'setup')->firstOrFail()->value['completed_at'])->toBe($completedAt);
})->with(['after audit insert', 'after final status read']);

it('does not persist an initialized setup mutex or policy when completion has no setup timestamps', function () {
    TenantSetting::where('key', 'setup')->delete();

    $this->postJson("{$this->setupUrl}/complete")->assertStatus(422)
        ->assertJsonPath('errors.missing', [
            'Setup step [institution_profile] is not completed.',
            'Setup step [calendar_basics] is not completed.',
        ]);

    $this->tenantContext->setTenant($this->tenant);
    expect(TenantSetting::where('key', 'setup')->exists())->toBeFalse()
        ->and(TenantSetting::where('key', 'signup_policy')->exists())->toBeFalse()
        ->and(Activity::where('event', 'signup_policy.defaults_initialized')->count())->toBe(0);
});

it('reports each step complete only when both its timestamp and its setting row exist', function (string $step) {
    $value = match ($step) {
        'institution_profile' => $this->profile,
        'calendar_basics' => $this->calendar,
        default => $this->defaults,
    };
    $recordedAt = now()->toIso8601String();
    $setup = TenantSetting::where('key', 'setup')->firstOrFail();
    $setupData = $setup->value;
    $setupData['steps'][$step] = ['completed_at' => $recordedAt];
    $setup->value = $setupData;
    $setup->save();
    TenantSetting::where('key', $step)->delete();

    $this->getJson("{$this->setupUrl}/status")->assertOk()
        ->assertJsonPath("data.steps.{$step}.completed_at", $recordedAt)
        ->assertJsonPath("data.steps.{$step}.is_completed", false)
        ->assertJsonPath("data.steps.{$step}.settings_exist", false)
        ->assertJsonPath("data.steps.{$step}.values", null);

    $this->tenantContext->setTenant($this->tenant);
    TenantSetting::create(['key' => $step, 'value' => $value]);
    unset($setupData['steps'][$step]);
    $setup->value = $setupData;
    $setup->save();

    $this->app['auth']->forgetGuards();
    $this->getJson("{$this->setupUrl}/status")->assertOk()
        ->assertJsonPath("data.steps.{$step}.is_completed", false)
        ->assertJsonPath("data.steps.{$step}.settings_exist", true)
        ->assertJsonPath("data.steps.{$step}.values", $value);

    $this->tenantContext->setTenant($this->tenant);
    $setupData['steps'][$step] = ['completed_at' => $recordedAt];
    $setup->value = $setupData;
    $setup->save();

    $this->app['auth']->forgetGuards();
    $this->getJson("{$this->setupUrl}/status")->assertOk()
        ->assertJsonPath("data.steps.{$step}.is_completed", true)
        ->assertJsonPath("data.steps.{$step}.settings_exist", true);
})->with(['institution_profile', 'calendar_basics', 'signup_policy']);

it('initializes defaults only in the resolved tenant and rejects its token in another tenant', function () {
    $this->postJson("{$this->setupUrl}/complete")->assertOk();
    $this->tenantContext->setTenant($this->tenant);
    expect(TenantSetting::where('key', 'signup_policy')->count())->toBe(1);

    $otherTenant = app(TenantProvisioner::class)->provision(
        'tenant_setup_completion_other', 'Other Setup College', 'setupother.test', 'cloud'
    );
    $this->tenantContext->setTenant($otherTenant);
    $this->app['auth']->forgetGuards();
    $this->postJson('http://setupother.test/api/v1/setup/complete')->assertUnauthorized();

    $this->tenantContext->setTenant($otherTenant);
    expect(TenantSetting::where('key', 'signup_policy')->exists())->toBeFalse()
        ->and(TenantSetting::where('key', 'setup')->exists())->toBeFalse()
        ->and(Activity::where('event', 'signup_policy.defaults_initialized')->count())->toBe(0);
});

it('serializes two overlapping completion requests so one succeeds, one returns 409, and only one policy row is created', function () {
    $this->assertTestingEnvironmentSafety();
    $connection = config('database.connections.tenant');
    expect($connection['database'])->toStartWith($this::TEST_TENANT_DB_PREFIX);
    // Coordinate on the direct PostgreSQL endpoint while HTTP workers use tenancy.
    $host = config('database.connections.pgsql_admin.host');
    $port = config('database.connections.pgsql_admin.port');
    $blocker = new PDO(
        "pgsql:host={$host};port={$port};dbname={$connection['database']}",
        $connection['username'], $connection['password'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_EMULATE_PREPARES => false]
    );

    $environment = [
        'APP_ENV' => 'testing',
        'APP_KEY' => config('app.key'),
        'DEPLOY_PROFILE' => 'cloud',
        'DB_CONNECTION' => 'unconfigured',
        'TENANT_DB_PREFIX' => $this::TEST_TENANT_DB_PREFIX,
        'CACHE_STORE' => 'array',
        'SESSION_DRIVER' => 'array',
        'QUEUE_CONNECTION' => 'sync',
        'ACTIVITYLOG_ENABLED' => 'true',
        'ACTIVITYLOG_BUFFER_ENABLED' => 'false',
    ];
    foreach (['landlord' => 'LANDLORD_DB', 'pgsql_admin' => 'ADMIN_DB'] as $name => $prefix) {
        $config = config("database.connections.{$name}");
        foreach (['host', 'port', 'database', 'username', 'password'] as $attribute) {
            $environment[$prefix.'_'.strtoupper($attribute)] = (string) $config[$attribute];
        }
        $environment[$prefix.'_URL'] = false;
    }

    $workers = [];
    try {
        $blocker->beginTransaction();
        expect($blocker->query("SELECT key FROM tenant_settings WHERE key = 'setup' FOR UPDATE")->fetchColumn())->toBe('setup');
        $blockerPid = (int) $blocker->query('SELECT pg_backend_pid()')->fetchColumn();

        for ($i = 0; $i < 2; $i++) {
            $worker = new Process([PHP_BINARY, base_path('tests/Fixtures/CompleteSetupWorker.php')], base_path(), $environment);
            $worker->setTimeout(30);
            $worker->setInput(json_encode([
                'url' => "{$this->setupUrl}/complete",
                'token' => $this->token,
                'now' => now()->toIso8601String(),
            ], JSON_THROW_ON_ERROR));
            $workers[] = $worker;
            $worker->start();
        }

        $pids = [];
        foreach ($workers as $worker) {
            expect($worker->waitUntil(fn () => preg_match('/LOCKING:(\d+)/', $worker->getOutput()) === 1))
                ->toBeTrue($worker->getErrorOutput().$worker->getOutput());
            preg_match('/LOCKING:(\d+)/', $worker->getOutput(), $matches);
            $pids[] = (int) $matches[1];
        }
        expect($pids[0])->not->toBe($pids[1]);

        // Observe both real PostgreSQL sessions waiting on row locks before release.
        $deadline = microtime(true) + 10;
        do {
            $waiting = DB::connection('tenant')->selectOne(
                "SELECT count(*) AS total FROM pg_stat_activity WHERE pid IN (?, ?) AND wait_event_type = 'Lock'",
                $pids
            );
            $waitingCount = (int) $waiting->total;
            if ($waitingCount !== 2) {
                usleep(10000);
            }
        } while ($waitingCount !== 2 && microtime(true) < $deadline);
        $sessions = DB::connection('tenant')->select(
            'SELECT pid, usename, datname, state, wait_event_type FROM pg_stat_activity WHERE pid IN (?, ?, ?)',
            [...$pids, $blockerPid]
        );
        expect($waitingCount)->toBe(2, json_encode($sessions, JSON_THROW_ON_ERROR).implode(' | ', array_map(
            fn (Process $worker) => $worker->getOutput().$worker->getErrorOutput(), $workers
        )))
            ->and(TenantSetting::where('key', 'signup_policy')->exists())->toBeFalse();

        $blocker->commit();
        $responses = [];
        foreach ($workers as $worker) {
            $worker->wait();
            expect($worker->isSuccessful())->toBeTrue($worker->getErrorOutput());
            $lines = explode("\n", trim($worker->getOutput()));
            $responses[] = json_decode(array_pop($lines), true, 512, JSON_THROW_ON_ERROR);
        }
        expect(array_column($responses, 'status'))->toEqualCanonicalizing([200, 409]);
        foreach ($responses as $response) {
            if ($response['status'] === 200) {
                expect($response['body']['data']['steps']['signup_policy']['values'])->toBe($this->defaults)
                    ->and($response['body']['data']['steps']['signup_policy']['is_completed'])->toBeTrue()
                    ->and($response['body']['data']['steps']['signup_policy']['settings_exist'])->toBeTrue();
            } else {
                expect($response['body']['type'])->toBe(ProblemDetails::type('setup-already-completed'));
            }
        }

        expect(TenantSetting::where('key', 'signup_policy')->count())->toBe(1)
            ->and(TenantSetting::where('key', 'signup_policy')->firstOrFail()->value)->toBe($this->defaults)
            ->and(TenantSetting::where('key', 'setup')->firstOrFail()->value['steps']['signup_policy']['completed_at'])
            ->toBe(now()->toIso8601String())
            ->and(Activity::where('event', 'signup_policy.defaults_initialized')->count())->toBe(1);
    } finally {
        foreach ($workers as $worker) {
            if ($worker->isRunning()) {
                $worker->stop(1);
            }
        }
        if ($blocker->inTransaction()) {
            $blocker->rollBack();
        }
    }
});

it('serializes an overlapping policy PUT and completion POST without losing preferences or timestamps', function (bool $existingPolicy, string $pauseAt) {
    $this->assertTestingEnvironmentSafety();
    if ($existingPolicy) {
        app(SaveSetupStepAction::class)->execute('signup_policy', $this->defaults);
    }
    $recordedPolicyAt = $existingPolicy ? now()->toIso8601String() : now()->addHour()->toIso8601String();
    $savedAt = now()->addHour()->toIso8601String();
    $completedAt = now()->addHours(2)->toIso8601String();
    $customPolicy = [
        'student_self_registration_enabled' => true,
        'parent_self_registration_enabled' => true,
        'approval_mode' => 'auto',
    ];
    $connection = config('database.connections.tenant');
    expect($connection['database'])->toStartWith($this::TEST_TENANT_DB_PREFIX);
    $environment = setupCompletionWorkerEnvironment($this::TEST_TENANT_DB_PREFIX);

    $workers = [];
    $inputs = [];
    try {
        foreach ([
            ['url' => "{$this->setupUrl}/steps/signup_policy", 'method' => 'PUT', 'payload' => $customPolicy,
                'now' => $savedAt, 'pause_at' => $pauseAt],
            ['url' => "{$this->setupUrl}/complete", 'now' => $completedAt],
        ] as $request) {
            $input = new InputStream;
            $input->write(json_encode([...$request, 'token' => $this->token], JSON_THROW_ON_ERROR)."\n");
            $worker = new Process([PHP_BINARY, base_path('tests/Fixtures/CompleteSetupWorker.php')], base_path(), $environment);
            $worker->setTimeout(30);
            $worker->setInput($input);
            $workers[] = $worker;
            $inputs[] = $input;
            $worker->start();

            $marker = count($workers) === 1 ? 'PAUSED' : 'LOCKING';
            expect($worker->waitUntil(fn () => preg_match("/{$marker}:(\\d+)/", $worker->getOutput()) === 1))
                ->toBeTrue($worker->getErrorOutput().$worker->getOutput());
        }

        preg_match('/PAUSED:(\d+)/', $workers[0]->getOutput(), $matches);
        $savingPid = (int) $matches[1];
        preg_match('/LOCKING:(\d+)/', $workers[1]->getOutput(), $matches);
        $completingPid = (int) $matches[1];
        expect($savingPid)->not->toBe($completingPid);

        // Observe completion really waiting on the PUT's PostgreSQL session.
        // Let completion's first deadlock probe see an acyclic wait before
        // releasing the PUT. Check SQL failures too: completion may retry them.
        $deadline = microtime(true) + 15;
        do {
            $waiting = DB::connection('tenant')->selectOne(
                "SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE pid = ? AND wait_event_type = 'Lock'
                    AND ? = ANY(pg_blocking_pids(pid))) AS blocked,
                    EXISTS (SELECT 1 FROM pg_locks WHERE pid = ? AND NOT granted
                        AND waitstart < clock_timestamp() - 2 * current_setting('deadlock_timeout')::interval) AS probed",
                [$completingPid, $savingPid, $completingPid]
            );
            $ready = (bool) $waiting->blocked && (! $existingPolicy || (bool) $waiting->probed);
            if (! $ready) {
                usleep(10000);
            }
        } while (! $ready && microtime(true) < $deadline);
        expect($ready)->toBeTrue($workers[0]->getOutput().$workers[1]->getOutput());
        if (! $existingPolicy) {
            expect(TenantSetting::where('key', 'signup_policy')->exists())->toBeFalse();
        }

        $inputs[0]->write("RELEASE\n");
        foreach ($inputs as $input) {
            $input->close();
        }
        $responses = [];
        foreach ($workers as $worker) {
            $worker->wait();
            expect($worker->isSuccessful())->toBeTrue($worker->getErrorOutput());
            $lines = explode("\n", trim($worker->getOutput()));
            $responses[] = json_decode(array_pop($lines), true, 512, JSON_THROW_ON_ERROR);
        }
        $diagnostics = json_encode(array_map(fn (array $response) => [
            'status' => $response['status'],
            'message' => $response['body']['message'] ?? null,
        ], $responses), JSON_THROW_ON_ERROR);
        expect(array_column($responses, 'status'))->toBe([200, 200], $diagnostics)
            ->and($workers[0]->getOutput().$workers[1]->getOutput())->not->toContain('SQLSTATE:40P01')
            ->and($responses[1]['body']['data']['completed_at'])->toBe($completedAt)
            ->and($responses[1]['body']['data']['steps']['signup_policy']['values'])->toBe($customPolicy)
            ->and($responses[1]['body']['data']['steps']['signup_policy']['completed_at'])->toBe($recordedPolicyAt);

        $policy = TenantSetting::where('key', 'signup_policy')->firstOrFail();
        $setup = TenantSetting::where('key', 'setup')->firstOrFail();
        expect($policy->value)->toBe($customPolicy)
            ->and(TenantSetting::where('key', 'signup_policy')->count())->toBe(1)
            ->and($setup->value['completed_at'])->toBe($completedAt)
            ->and($setup->value['steps']['signup_policy']['completed_at'])->toBe($recordedPolicyAt)
            ->and($setup->value['steps']['institution_profile'])->toBe($this->setupBefore['steps']['institution_profile'])
            ->and($setup->value['steps']['calendar_basics'])->toBe($this->setupBefore['steps']['calendar_basics'])
            ->and(Activity::where('event', 'signup_policy.defaults_initialized')->count())->toBe(0);
    } finally {
        foreach ($inputs as $input) {
            $input->close();
        }
        foreach ($workers as $worker) {
            if ($worker->isRunning()) {
                $worker->stop(1);
            }
        }
    }
})->with([
    'existing policy lock ordering' => [true, 'after_policy_write'],
    'initial policy committed during completion lock wait' => [false, 'before_commit'],
]);

it('serializes the first profile and calendar saves when the setup mutex is absent', function () {
    $this->assertTestingEnvironmentSafety();
    expect(config('database.connections.tenant.database'))->toStartWith($this::TEST_TENANT_DB_PREFIX);
    TenantSetting::whereIn('key', ['setup', 'institution_profile', 'calendar_basics'])->delete();
    $profileAt = now()->toIso8601String();
    $calendarAt = now()->addHour()->toIso8601String();
    $environment = setupCompletionWorkerEnvironment($this::TEST_TENANT_DB_PREFIX);
    $workers = [];
    $inputs = [];

    try {
        foreach ([
            ['url' => "{$this->setupUrl}/steps/institution_profile", 'payload' => $this->profile,
                'now' => $profileAt, 'pause_at' => 'before_commit'],
            ['url' => "{$this->setupUrl}/steps/calendar_basics", 'payload' => $this->calendar, 'now' => $calendarAt],
        ] as $request) {
            $input = new InputStream;
            $input->write(json_encode([...$request, 'method' => 'PUT', 'token' => $this->token], JSON_THROW_ON_ERROR)."\n");
            $worker = new Process([PHP_BINARY, base_path('tests/Fixtures/CompleteSetupWorker.php')], base_path(), $environment);
            $worker->setTimeout(30);
            $worker->setInput($input);
            $workers[] = $worker;
            $inputs[] = $input;
            $worker->start();

            $marker = count($workers) === 1 ? 'PAUSED' : 'SETUP_QUERY';
            expect($worker->waitUntil(fn () => preg_match("/{$marker}:(\\d+)/", $worker->getOutput()) === 1))
                ->toBeTrue($worker->getErrorOutput().$worker->getOutput());
        }

        preg_match('/PAUSED:(\d+)/', $workers[0]->getOutput(), $matches);
        $profilePid = (int) $matches[1];
        preg_match('/SETUP_QUERY:(\d+)/', $workers[1]->getOutput(), $matches);
        $calendarPid = (int) $matches[1];
        expect($profilePid)->not->toBe($calendarPid);
        $deadline = microtime(true) + 10;
        do {
            $waiting = DB::connection('tenant')->selectOne(
                "SELECT count(*) AS total FROM pg_stat_activity WHERE pid = ? AND wait_event_type = 'Lock'
                    AND ? = ANY(pg_blocking_pids(pid))",
                [$calendarPid, $profilePid]
            );
            $blocked = (int) $waiting->total === 1;
            if (! $blocked) {
                usleep(10000);
            }
        } while (! $blocked && microtime(true) < $deadline);
        expect($blocked)->toBeTrue($workers[0]->getOutput().$workers[1]->getOutput())
            ->and(TenantSetting::where('key', 'setup')->exists())->toBeFalse();

        $inputs[0]->write("RELEASE\n");
        foreach ($inputs as $input) {
            $input->close();
        }
        $responses = [];
        foreach ($workers as $worker) {
            $worker->wait();
            expect($worker->isSuccessful())->toBeTrue($worker->getErrorOutput());
            $lines = explode("\n", trim($worker->getOutput()));
            $responses[] = json_decode(array_pop($lines), true, 512, JSON_THROW_ON_ERROR);
        }
        expect(array_column($responses, 'status'))->toBe([200, 200], json_encode($responses, JSON_THROW_ON_ERROR))
            ->and($responses[1]['body']['data']['is_completed'])->toBeFalse()
            ->and($responses[1]['body']['data']['steps']['institution_profile']['completed_at'])->toBe($profileAt)
            ->and($responses[1]['body']['data']['steps']['calendar_basics']['completed_at'])->toBe($calendarAt)
            ->and($responses[1]['body']['data']['steps']['signup_policy']['is_completed'])->toBeFalse()
            ->and(TenantSetting::where('key', 'setup')->count())->toBe(1)
            ->and(TenantSetting::where('key', 'signup_policy')->exists())->toBeFalse()
            ->and(Activity::where('event', 'signup_policy.defaults_initialized')->count())->toBe(0);
    } finally {
        foreach ($inputs as $input) {
            $input->close();
        }
        foreach ($workers as $worker) {
            if ($worker->isRunning()) {
                $worker->stop(1);
            }
        }
    }
});

/** @return array<string, string|false> */
function setupCompletionWorkerEnvironment(string $tenantPrefix): array
{
    $environment = [
        'APP_ENV' => 'testing',
        'APP_DEBUG' => 'true',
        'APP_KEY' => config('app.key'),
        'DEPLOY_PROFILE' => 'cloud',
        'DB_CONNECTION' => 'unconfigured',
        'TENANT_DB_PREFIX' => $tenantPrefix,
        'CACHE_STORE' => 'array',
        'SESSION_DRIVER' => 'array',
        'QUEUE_CONNECTION' => 'sync',
        'ACTIVITYLOG_ENABLED' => 'true',
        'ACTIVITYLOG_BUFFER_ENABLED' => 'false',
    ];
    foreach (['landlord' => 'LANDLORD_DB', 'pgsql_admin' => 'ADMIN_DB'] as $name => $prefix) {
        $config = config("database.connections.{$name}");
        foreach (['host', 'port', 'database', 'username', 'password'] as $attribute) {
            $environment[$prefix.'_'.strtoupper($attribute)] = (string) $config[$attribute];
        }
        $environment[$prefix.'_URL'] = false;
    }

    return $environment;
}

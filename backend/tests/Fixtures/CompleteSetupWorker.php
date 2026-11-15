<?php

declare(strict_types=1);

namespace Tests\Fixtures;

use Illuminate\Contracts\Console\Kernel as ConsoleKernel;
use Illuminate\Contracts\Database\ConcurrencyErrorDetector as ConcurrencyErrorDetectorContract;
use Illuminate\Contracts\Http\Kernel as HttpKernel;
use Illuminate\Database\ConcurrencyErrorDetector;
use Illuminate\Database\Connection;
use Illuminate\Database\Events\ConnectionEstablished;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Database\Events\TransactionCommitting;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use RuntimeException;
use Tests\Feature\Tenancy\TenancyTestHelper;
use Throwable;

require_once __DIR__.'/../../vendor/autoload.php';

final class CompleteSetupWorker
{
    use TenancyTestHelper;

    public function execute(): void
    {
        $app = require __DIR__.'/../../bootstrap/app.php';
        $app->make(ConsoleKernel::class)->bootstrap();
        $this->assertTestingEnvironmentSafety();

        // Observe real SQL failures without changing Laravel's retry decisions.
        $app->bind(ConcurrencyErrorDetectorContract::class, fn () => new class extends ConcurrencyErrorDetector
        {
            public function causedByConcurrencyError(Throwable $e): bool
            {
                fwrite(STDOUT, 'SQLSTATE:'.$e->getCode()."\n");
                fflush(STDOUT);

                return parent::causedByConcurrencyError($e);
            }
        });

        $input = json_decode((string) fgets(STDIN), true, 512, JSON_THROW_ON_ERROR);
        Carbon::setTestNow($input['now']);

        $pauseAt = $input['pause_at'] ?? null;
        $stepWritten = false;
        $setupWritten = false;
        $paused = false;
        $pause = function (Connection $connection) use (&$paused): void {
            if ($paused) {
                return;
            }

            $paused = true;
            $pid = $connection->getPdo()->query('SELECT pg_backend_pid()')->fetchColumn();
            fwrite(STDOUT, "PAUSED:{$pid}\n");
            fflush(STDOUT);

            if (trim((string) fgets(STDIN)) !== 'RELEASE') {
                throw new RuntimeException('Setup worker checkpoint was not released.');
            }
        };

        $app['events']->listen(QueryExecuted::class, function (QueryExecuted $event) use (
            $pauseAt, $pause, &$stepWritten, &$setupWritten
        ): void {
            if ($event->connectionName !== 'tenant'
                || preg_match('/^(insert into|update) "tenant_settings"/', $event->sql) !== 1) {
                return;
            }

            foreach (['institution_profile', 'calendar_basics', 'signup_policy'] as $step) {
                if (in_array($step, $event->bindings, true)) {
                    $stepWritten = true;
                }
            }
            if ($pauseAt === 'after_policy_write' && in_array('signup_policy', $event->bindings, true)) {
                $pause($event->connection);
            }
            if (in_array('setup', $event->bindings, true)) {
                $setupWritten = true;
            }
        });
        $app['events']->listen(TransactionCommitting::class, function (TransactionCommitting $event) use (
            $pauseAt, $pause, &$stepWritten, &$setupWritten
        ): void {
            if ($event->connectionName === 'tenant' && $event->connection->transactionLevel() === 1
                && $pauseAt === 'before_commit' && $stepWritten && $setupWritten) {
                $pause($event->connection);
            }
        });

        $app['events']->listen(ConnectionEstablished::class, function (ConnectionEstablished $event): void {
            if ($event->connectionName !== 'tenant') {
                return;
            }

            $connection = $event->connection;
            if (! str_starts_with((string) $connection->getConfig('database'), self::TEST_TENANT_DB_PREFIX)) {
                throw new RuntimeException('Completion worker may only access test-prefixed tenant databases.');
            }

            $connection->beforeExecuting(function (string $query, array $bindings) use ($connection): void {
                if (str_contains($query, 'tenant_settings') && in_array('setup', $bindings, true)) {
                    $pid = $connection->getPdo()->query('SELECT pg_backend_pid()')->fetchColumn();
                    fwrite(STDOUT, "SETUP_QUERY:{$pid}\n");
                    fflush(STDOUT);
                }
                if (str_contains($query, 'tenant_settings') && str_contains($query, 'for update')) {
                    $pid = $connection->getPdo()->query('SELECT pg_backend_pid()')->fetchColumn();
                    fwrite(STDOUT, "LOCKING:{$pid}\n");
                    fflush(STDOUT);
                }
            });
        });

        $request = Request::create($input['url'], $input['method'] ?? 'POST', [], [], [], [
            'HTTP_ACCEPT' => 'application/json',
            'CONTENT_TYPE' => 'application/json',
            'HTTP_AUTHORIZATION' => 'Bearer '.$input['token'],
        ], json_encode($input['payload'] ?? [], JSON_THROW_ON_ERROR));
        $kernel = $app->make(HttpKernel::class);
        $response = $kernel->handle($request);
        fwrite(STDOUT, json_encode([
            'status' => $response->getStatusCode(),
            'body' => json_decode((string) $response->getContent(), true, 512, JSON_THROW_ON_ERROR),
        ], JSON_THROW_ON_ERROR)."\n");
        $kernel->terminate($request, $response);
    }
}

if (realpath((string) ($_SERVER['SCRIPT_FILENAME'] ?? '')) === __FILE__) {
    (new CompleteSetupWorker)->execute();
}

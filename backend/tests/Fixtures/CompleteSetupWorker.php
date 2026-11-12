<?php

declare(strict_types=1);

namespace Tests\Fixtures;

use Illuminate\Contracts\Console\Kernel as ConsoleKernel;
use Illuminate\Contracts\Http\Kernel as HttpKernel;
use Illuminate\Database\Events\ConnectionEstablished;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use RuntimeException;
use Tests\Feature\Tenancy\TenancyTestHelper;

require_once __DIR__.'/../../vendor/autoload.php';

final class CompleteSetupWorker
{
    use TenancyTestHelper;

    public function execute(): void
    {
        $app = require __DIR__.'/../../bootstrap/app.php';
        $app->make(ConsoleKernel::class)->bootstrap();
        $this->assertTestingEnvironmentSafety();

        $input = json_decode((string) stream_get_contents(STDIN), true, 512, JSON_THROW_ON_ERROR);
        Carbon::setTestNow($input['now']);

        $app['events']->listen(ConnectionEstablished::class, function (ConnectionEstablished $event): void {
            if ($event->connectionName !== 'tenant') {
                return;
            }

            $connection = $event->connection;
            if (! str_starts_with((string) $connection->getConfig('database'), self::TEST_TENANT_DB_PREFIX)) {
                throw new RuntimeException('Completion worker may only access test-prefixed tenant databases.');
            }

            $connection->beforeExecuting(function (string $query) use ($connection): void {
                if (str_contains($query, 'tenant_settings') && str_contains($query, 'for update')) {
                    $pid = $connection->getPdo()->query('SELECT pg_backend_pid()')->fetchColumn();
                    fwrite(STDOUT, "LOCKING:{$pid}\n");
                    fflush(STDOUT);
                }
            });
        });

        $request = Request::create($input['url'], 'POST', [], [], [], [
            'HTTP_ACCEPT' => 'application/json',
            'CONTENT_TYPE' => 'application/json',
            'HTTP_AUTHORIZATION' => 'Bearer '.$input['token'],
        ]);
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

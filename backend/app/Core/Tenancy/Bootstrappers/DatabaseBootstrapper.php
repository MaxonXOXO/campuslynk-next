<?php

declare(strict_types=1);

namespace App\Core\Tenancy\Bootstrappers;

use App\Core\Tenancy\Exceptions\TenantFailedException;
use App\Core\Tenancy\Models\Tenant;
use Illuminate\Support\Facades\DB;

class DatabaseBootstrapper implements TenancyBootstrapperContract
{
    /**
     * @var array<string, mixed>|null
     */
    protected ?array $originalConfig = null;

    public function bootstrap(Tenant $tenant): void
    {
        $db = $tenant->database;

        if ($db === null) {
            throw new TenantFailedException(sprintf(
                'Tenant [%s] has no database configuration record.',
                $tenant->slug
            ));
        }

        if ($this->originalConfig === null) {
            /** @var array<string, mixed>|null $currentConfig */
            $currentConfig = config('database.connections.tenant');
            $this->originalConfig = $currentConfig;
        }

        /** @var string $sslmode */
        $sslmode = config('database.connections.landlord.sslmode', 'prefer');

        config([
            'database.connections.tenant' => [
                'driver' => 'pgsql',
                'host' => $db->host,
                'port' => $db->port,
                'database' => $db->database,
                'username' => $db->username,
                'password' => $db->getDecryptedPassword(),
                'charset' => 'utf8',
                'prefix' => '',
                'prefix_indexes' => true,
                'search_path' => 'public',
                'sslmode' => $sslmode,
                'options' => extension_loaded('pdo_pgsql') ? [
                    \PDO::ATTR_EMULATE_PREPARES => true,
                ] : [],
            ],
        ]);

        DB::purge('tenant');
    }

    public function revert(): void
    {
        DB::purge('tenant');

        if ($this->originalConfig !== null) {
            config(['database.connections.tenant' => $this->originalConfig]);
        } else {
            config([
                'database.connections.tenant' => [
                    'driver' => 'pgsql',
                    'host' => '127.0.0.1',
                    'port' => 6432,
                    'database' => 'unconfigured_tenant',
                    'username' => 'unconfigured_user',
                    'password' => '',
                    'charset' => 'utf8',
                    'prefix' => '',
                    'prefix_indexes' => true,
                    'search_path' => 'public',
                    'sslmode' => 'prefer',
                ],
            ]);
        }
    }
}

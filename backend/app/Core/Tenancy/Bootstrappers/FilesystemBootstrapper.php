<?php

declare(strict_types=1);

namespace App\Core\Tenancy\Bootstrappers;

use App\Core\Tenancy\Models\Tenant;

class FilesystemBootstrapper implements TenancyBootstrapperContract
{
    protected ?string $originalLocalRoot = null;

    public function bootstrap(Tenant $tenant): void
    {
        if ($this->originalLocalRoot === null) {
            $root = config('filesystems.disks.local.root');
            $this->originalLocalRoot = is_string($root) ? $root : storage_path('app');
        }

        config([
            'filesystems.disks.local.root' => storage_path('app/tenants/'.$tenant->id),
        ]);
    }

    public function revert(): void
    {
        if ($this->originalLocalRoot !== null) {
            config(['filesystems.disks.local.root' => $this->originalLocalRoot]);
        }
    }
}

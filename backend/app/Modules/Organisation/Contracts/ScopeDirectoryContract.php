<?php

declare(strict_types=1);

namespace App\Modules\Organisation\Contracts;

use Illuminate\Database\Query\Builder;

interface ScopeDirectoryContract
{
    /**
     * Tenant-local scope references and their current home/managing paths.
     * Columns: scope_type, scope_id, scope_label, home_path, managing_path.
     */
    public function query(): Builder;
}

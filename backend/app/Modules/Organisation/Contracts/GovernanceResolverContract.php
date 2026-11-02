<?php

declare(strict_types=1);

namespace App\Modules\Organisation\Contracts;

interface GovernanceResolverContract
{
    /**
     * Resolve the managing department ID for a given home department and semester.
     */
    public function resolveManagingDepartmentId(string $homeDepartmentId, int $semester): string;
}

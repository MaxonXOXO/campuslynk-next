<?php

declare(strict_types=1);

namespace App\Modules\Organisation\Services;

use App\Modules\Organisation\Contracts\GovernanceResolverContract;
use App\Modules\Organisation\Models\DepartmentSemesterGovernance;

class GovernanceResolver implements GovernanceResolverContract
{
    /**
     * Resolve the active managing department ID for a given home department and semester.
     * Defaults to the home department when no specific governance rule matches.
     */
    public function resolve(string $homeDepartmentId, int $semester): string
    {
        return $this->resolveManagingDepartmentId($homeDepartmentId, $semester);
    }

    /**
     * Resolve the managing department ID for a given home department and semester.
     */
    public function resolveManagingDepartmentId(string $homeDepartmentId, int $semester): string
    {
        /** @var DepartmentSemesterGovernance|null $rule */
        $rule = DepartmentSemesterGovernance::where('home_department_id', $homeDepartmentId)
            ->where('semester_from', '<=', $semester)
            ->where('semester_to', '>=', $semester)
            ->first();

        if ($rule !== null) {
            return $rule->managing_department_id;
        }

        return $homeDepartmentId;
    }
}

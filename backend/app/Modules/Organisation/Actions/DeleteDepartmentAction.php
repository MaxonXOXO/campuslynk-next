<?php

declare(strict_types=1);

namespace App\Modules\Organisation\Actions;

use App\Modules\Organisation\Exceptions\DepartmentInUseException;
use App\Modules\Organisation\Models\Batch;
use App\Modules\Organisation\Models\Department;
use App\Modules\Organisation\Models\DepartmentSemesterGovernance;

final class DeleteDepartmentAction
{
    public function execute(Department $department): void
    {
        if ($department->programs()->exists()) {
            throw new DepartmentInUseException('Cannot delete department because one or more programs reference it.');
        }

        if (Batch::where('home_department_id', $department->id)->orWhere('managing_department_id', $department->id)->exists()) {
            throw new DepartmentInUseException('Cannot delete department because one or more batches reference it.');
        }

        if (DepartmentSemesterGovernance::where('managing_department_id', $department->id)->exists()) {
            throw new DepartmentInUseException('Cannot delete department because one or more governance rules reference it as managing department.');
        }

        $department->delete();
    }
}

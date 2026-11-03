<?php

declare(strict_types=1);

namespace App\Modules\Organisation\Actions;

use App\Modules\Organisation\Models\Department;

final class UpdateDepartmentAction
{
    /**
     * @param array{
     *     name?: string,
     *     kind?: string,
     *     is_active?: bool
     * } $attributes
     */
    public function execute(Department $department, array $attributes): Department
    {
        $department->fill($attributes);
        $department->save();

        return $department;
    }
}

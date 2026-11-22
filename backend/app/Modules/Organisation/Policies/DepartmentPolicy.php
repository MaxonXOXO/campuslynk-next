<?php

declare(strict_types=1);

namespace App\Modules\Organisation\Policies;

use App\Core\Contracts\ScopeAuthorizerContract;
use App\Modules\Organisation\Models\Department;
use App\Modules\Organisation\Models\Stream;
use Illuminate\Contracts\Auth\Authenticatable;

final class DepartmentPolicy
{
    public function __construct(private readonly ScopeAuthorizerContract $authorizer) {}

    public function view(Authenticatable $caller, Department $department): bool
    {
        return $this->authorizer->can($caller, 'organisation.batch.view', $department);
    }

    public function create(Authenticatable $caller, Stream $stream): bool
    {
        return $this->authorizer->can($caller, 'organisation.department.manage', $stream);
    }

    public function update(Authenticatable $caller, Department $department): bool
    {
        return $this->authorizer->can($caller, 'organisation.department.manage', $department);
    }

    public function delete(Authenticatable $caller, Department $department): bool
    {
        return $this->update($caller, $department);
    }
}

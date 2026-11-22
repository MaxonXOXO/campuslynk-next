<?php

declare(strict_types=1);

namespace App\Modules\Identity\Policies;

use App\Modules\Identity\Models\User;
use App\Modules\Identity\Services\ScopeAuthorizer;
use Illuminate\Contracts\Auth\Authenticatable;

final class UserPolicy
{
    public function __construct(private readonly ScopeAuthorizer $authorizer) {}

    public function view(Authenticatable $caller, User $target): bool
    {
        return $this->authorizer->canAccessUser($caller, 'identity.user.view', $target);
    }

    public function update(Authenticatable $caller, User $target): bool
    {
        return $this->authorizer->canAccessUser($caller, 'identity.user.update', $target);
    }

    public function unlock(Authenticatable $caller, User $target): bool
    {
        return $this->authorizer->canAccessUser($caller, 'identity.user.unlock', $target);
    }

    public function suspend(Authenticatable $caller, User $target): bool
    {
        return $this->authorizer->canAccessUser($caller, 'identity.user.suspend', $target);
    }

    public function reactivate(Authenticatable $caller, User $target): bool
    {
        return $this->suspend($caller, $target);
    }
}

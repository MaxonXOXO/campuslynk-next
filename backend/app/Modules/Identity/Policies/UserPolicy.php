<?php

declare(strict_types=1);

namespace App\Modules\Identity\Policies;

use App\Modules\Identity\Models\User;
use App\Modules\Identity\Services\RoleAuthorityRank;
use App\Modules\Identity\Services\ScopeAuthorizer;
use Illuminate\Contracts\Auth\Authenticatable;

final class UserPolicy
{
    public function __construct(
        private readonly ScopeAuthorizer $authorizer,
        private readonly RoleAuthorityRank $authorityRank,
    ) {}

    public function view(Authenticatable $caller, User $target): bool
    {
        return $this->authorizer->canAccessUser($caller, 'identity.user.view', $target);
    }

    public function update(Authenticatable $caller, User $target): bool
    {
        return $this->canManageTarget($caller, 'identity.user.update', $target);
    }

    public function unlock(Authenticatable $caller, User $target): bool
    {
        return $this->canManageTarget($caller, 'identity.user.unlock', $target);
    }

    public function suspend(Authenticatable $caller, User $target): bool
    {
        return $this->canManageTarget($caller, 'identity.user.suspend', $target);
    }

    public function reactivate(Authenticatable $caller, User $target): bool
    {
        return $this->suspend($caller, $target);
    }

    public function resetPassword(Authenticatable $caller, User $target): bool
    {
        return $this->canManageTarget($caller, 'identity.user.reset_password', $target);
    }

    public function approve(Authenticatable $caller, User $target): bool
    {
        return $this->canManageTarget($caller, 'identity.user.approve', $target);
    }

    public function reject(Authenticatable $caller, User $target): bool
    {
        return $this->approve($caller, $target);
    }

    public function deactivate(Authenticatable $caller, User $target): bool
    {
        return $this->canManageTarget($caller, 'identity.user.deactivate', $target);
    }

    /**
     * Enforce self-exclusion, scope containment, and strict RoleAuthorityRank superiority
     * across all user lifecycle mutations.
     */
    private function canManageTarget(Authenticatable $caller, string $permission, User $target): bool
    {
        if (! $caller instanceof User) {
            return false;
        }

        if ($caller->id === $target->id) {
            return false;
        }

        if (! $this->authorizer->canAccessUser($caller, $permission, $target)) {
            return false;
        }

        return $this->authorityRank->highestActiveRank($caller) > $this->authorityRank->highestActiveRank($target);
    }
}

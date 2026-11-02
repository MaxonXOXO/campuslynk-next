<?php

declare(strict_types=1);

namespace App\Modules\Identity\Concerns;

use App\Modules\Identity\Services\ScopeAuthorizer;
use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Database\Eloquent\Builder;

trait HasScopedVisibility
{
    /**
     * Scope query to only records visible to the given user for the specified permission.
     *
     * @param  Builder<static>  $query
     * @return Builder<static>
     */
    public function scopeVisibleTo(Builder $query, Authenticatable $user, string $permission): Builder
    {
        /** @var ScopeAuthorizer $authorizer */
        $authorizer = app(ScopeAuthorizer::class);

        return $authorizer->scopeQuery($query, $user, $permission);
    }
}

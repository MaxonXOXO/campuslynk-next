<?php

declare(strict_types=1);

namespace App\Core\Contracts;

use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Database\Eloquent\Builder;

interface ScopeAuthorizerContract
{
    /**
     * Determine whether the given user has the specified permission for the given resource.
     */
    public function can(Authenticatable $user, string $permission, ?ScopedResource $resource = null): bool;

    /**
     * Scope query to only records visible to the given user for the specified permission.
     *
     * @template TModel of \Illuminate\Database\Eloquent\Model
     *
     * @param  Builder<TModel>  $query
     * @return Builder<TModel>
     */
    public function scopeQuery(Builder $query, Authenticatable $user, string $permission): Builder;
}

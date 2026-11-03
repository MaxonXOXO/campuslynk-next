<?php

declare(strict_types=1);

namespace App\Core\Concerns;

use App\Core\Contracts\ScopeAuthorizerContract;
use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Database\Eloquent\Builder;

trait HasScopedVisibility
{
    /**
     * Scope query to only records visible to the given user for the specified permission.
     *
     * @template TModel of \Illuminate\Database\Eloquent\Model
     *
     * @param  Builder<TModel>  $query
     * @return Builder<TModel>
     */
    public function scopeVisibleTo(Builder $query, Authenticatable $user, string $permission): Builder
    {
        /** @var ScopeAuthorizerContract $authorizer */
        $authorizer = app(ScopeAuthorizerContract::class);

        /** @var Builder<TModel> $result */
        $result = $authorizer->scopeQuery($query, $user, $permission);

        return $result;
    }
}

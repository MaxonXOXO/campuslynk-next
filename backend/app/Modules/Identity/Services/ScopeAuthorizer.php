<?php

declare(strict_types=1);

namespace App\Modules\Identity\Services;

use App\Modules\Identity\Contracts\ScopedResource;
use App\Modules\Identity\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class ScopeAuthorizer
{
    /**
     * Determine whether the given user has the specified permission for the given resource.
     */
    public function can(User $user, string $permission, ?ScopedResource $resource = null): bool
    {
        $scopeLabels = $this->getActiveScopeLabelsForPermission($user, $permission);

        if (empty($scopeLabels)) {
            return false;
        }

        // If user holds institution-level permission, they have access across the entire tenant
        if (in_array('*', $scopeLabels, true)) {
            return true;
        }

        if ($resource === null) {
            // General permission check without resource context: user possesses permission at some scope
            return true;
        }

        $managingPath = $resource->getManagingScopePath();
        $managingLabels = explode('.', $managingPath);

        // Governance / Write permissions match ONLY the managing path
        if (! $this->isReadPermission($permission)) {
            return ! empty(array_intersect($scopeLabels, $managingLabels));
        }

        // Read permissions match EITHER managing_path OR home_path
        $homePath = $resource->getHomeScopePath();
        $homeLabels = explode('.', $homePath);

        $allowedResourceLabels = array_unique(array_merge($managingLabels, $homeLabels));

        return ! empty(array_intersect($scopeLabels, $allowedResourceLabels));
    }

    /**
     * Determine whether the user has the permission directly at or above the given scope label.
     */
    public function canAtScope(User $user, string $permission, string $scopeLabel): bool
    {
        $scopeLabels = $this->getActiveScopeLabelsForPermission($user, $permission);

        if (empty($scopeLabels)) {
            return false;
        }

        if (in_array('*', $scopeLabels, true)) {
            return true;
        }

        return in_array($scopeLabel, $scopeLabels, true);
    }

    /**
     * Filter an Eloquent query to only include records visible to the user for the given permission.
     * Prevents N+1 queries by pushing the ltree ancestry matching down to PostgreSQL.
     *
     * @template TModel of \Illuminate\Database\Eloquent\Model
     *
     * @param  Builder<TModel>  $query
     * @return Builder<TModel>
     */
    public function scopeQuery(
        Builder $query,
        User $user,
        string $permission,
        string $managingPathCol = 'managing_path',
        string $homePathCol = 'home_path'
    ): Builder {
        $scopeLabels = $this->getActiveScopeLabelsForPermission($user, $permission);

        if (empty($scopeLabels)) {
            return $query->whereRaw('1 = 0');
        }

        if (in_array('*', $scopeLabels, true)) {
            return $query;
        }

        // Build lquery pattern: *.(label1|label2|...).*
        $sanitizedLabels = array_map(function (string $label) {
            return preg_replace('/[^a-zA-Z0-9_]/', '', $label);
        }, $scopeLabels);

        $lquery = '*.'.implode('|', $sanitizedLabels).'.*';

        if ($this->isReadPermission($permission)) {
            return $query->where(function (Builder $sub) use ($managingPathCol, $homePathCol, $lquery) {
                $sub->whereRaw("{$managingPathCol} ~ ?::lquery", [$lquery])
                    ->orWhereRaw("{$homePathCol} ~ ?::lquery", [$lquery]);
            });
        }

        return $query->whereRaw("{$managingPathCol} ~ ?::lquery", [$lquery]);
    }

    /**
     * Get all active scope labels for a user granting the specified permission.
     * Returns ['*'] if the user holds an institution-wide assignment.
     *
     * @return list<string>
     */
    public function getActiveScopeLabelsForPermission(User $user, string $permission): array
    {
        $now = Carbon::now();

        /** @var Collection<int, object{scope_type: string, scope_label: string}> $assignments */
        $assignments = DB::connection('tenant')
            ->table('role_assignments')
            ->join('role_permission', 'role_permission.role_id', '=', 'role_assignments.role_id')
            ->join('permissions', 'permissions.id', '=', 'role_permission.permission_id')
            ->where('role_assignments.user_id', $user->id)
            ->whereRaw('role_assignments.is_active is true')
            ->where('role_assignments.valid_from', '<=', $now)
            ->where(function ($query) use ($now) {
                $query->whereNull('role_assignments.valid_to')
                    ->orWhere('role_assignments.valid_to', '>', $now);
            })
            ->where('permissions.key', $permission)
            ->select('role_assignments.scope_type', 'role_assignments.scope_label')
            ->get();

        if ($assignments->isEmpty()) {
            return [];
        }

        $labels = [];
        foreach ($assignments as $assignment) {
            if ($assignment->scope_type === 'institution') {
                return ['*'];
            }
            $labels[] = $assignment->scope_label;
        }

        return array_values(array_unique($labels));
    }

    /**
     * Determine if a permission is read/analytics or write/governance.
     */
    public function isReadPermission(string $permission): bool
    {
        return str_ends_with($permission, '.view')
            || str_ends_with($permission, '.view_own')
            || str_ends_with($permission, '.audit_report')
            || str_ends_with($permission, '.download')
            || str_ends_with($permission, '.export');
    }
}

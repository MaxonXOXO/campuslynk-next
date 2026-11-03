<?php

declare(strict_types=1);

namespace App\Modules\Identity\Services;

use App\Core\Authorization\ScopeLabelValidator;
use App\Core\Contracts\ScopeAuthorizerContract;
use App\Core\Contracts\ScopedResource;
use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class ScopeAuthorizer implements ScopeAuthorizerContract
{
    /**
     * Determine whether the given user has the specified permission for the given resource.
     */
    public function can(Authenticatable $user, string $permission, ?ScopedResource $resource = null): bool
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
    public function canAtScope(
        Authenticatable $user,
        string $permission,
        string $scopeLabel,
        ?string $scopeType = null,
        ?string $scopeId = null
    ): bool {
        self::validateScopeLabel($scopeLabel);

        $scopeLabels = $this->getActiveScopeLabelsForPermission($user, $permission);

        if (empty($scopeLabels)) {
            return false;
        }

        if (in_array('*', $scopeLabels, true)) {
            return true;
        }

        if (in_array($scopeLabel, $scopeLabels, true)) {
            return true;
        }

        foreach ($scopeLabels as $label) {
            self::validateScopeLabel($label);
        }

        $lquery = '*.'.implode('|', $scopeLabels).'.*';

        if ($scopeType === 'batch' || str_starts_with($scopeLabel, 'b_')) {
            $query = DB::connection('tenant')
                ->table('batches')
                ->whereRaw('managing_path ~ ?::lquery', [$lquery]);

            if ($scopeId !== null) {
                $query->where('id', $scopeId);
            } else {
                $query->where('scope_label', $scopeLabel);
            }

            return $query->exists();
        }

        if ($scopeType === 'sub_batch' || str_starts_with($scopeLabel, 'sb_')) {
            $query = DB::connection('tenant')
                ->table('sub_batches')
                ->whereRaw('managing_path ~ ?::lquery', [$lquery]);

            if ($scopeId !== null) {
                $query->where('id', $scopeId);
            } else {
                $query->where('scope_label', $scopeLabel);
            }

            return $query->exists();
        }

        return false;
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
        Authenticatable $user,
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

        // Validate all scope labels against strict identifier pattern
        foreach ($scopeLabels as $label) {
            self::validateScopeLabel($label);
        }

        // Build lquery pattern: *.(label1|label2|...).* bound strictly via parameter
        $lquery = '*.'.implode('|', $scopeLabels).'.*';

        if ($this->isReadPermission($permission)) {
            return $query->where(function (Builder $sub) use ($managingPathCol, $homePathCol, $lquery) {
                $sub->whereRaw("{$managingPathCol} ~ ?::lquery", [$lquery])
                    ->orWhereRaw("{$homePathCol} ~ ?::lquery", [$lquery]);
            });
        }

        return $query->whereRaw("{$managingPathCol} ~ ?::lquery", [$lquery]);
    }

    /**
     * Strict validation of PostgreSQL ltree scope labels (ADR-0013).
     * Must be a 1-63 character ASCII alphanumeric identifier with underscores only.
     *
     * @throws \InvalidArgumentException
     */
    public static function validateScopeLabel(string $label): void
    {
        ScopeLabelValidator::validate($label);
    }

    /**
     * Get all active scope labels for a user granting the specified permission.
     * Returns ['*'] if the user holds an institution-wide assignment.
     *
     * @return list<string>
     */
    public function getActiveScopeLabelsForPermission(Authenticatable $user, string $permission): array
    {
        $now = Carbon::now();

        /** @var Collection<int, object{scope_type: string, scope_label: string}> $assignments */
        $assignments = DB::connection('tenant')
            ->table('role_assignments')
            ->join('role_permission', 'role_permission.role_id', '=', 'role_assignments.role_id')
            ->join('permissions', 'permissions.id', '=', 'role_permission.permission_id')
            ->where('role_assignments.user_id', (string) $user->getAuthIdentifier())
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

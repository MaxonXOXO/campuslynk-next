<?php

declare(strict_types=1);

namespace App\Modules\Identity\Services;

use App\Core\Authorization\ScopeLabelValidator;
use App\Core\Contracts\ScopeAuthorizerContract;
use App\Core\Contracts\ScopedResource;
use App\Modules\Identity\Models\Permission;
use App\Modules\Identity\Models\RoleAssignment;
use App\Modules\Identity\Models\User;
use App\Modules\Organisation\Contracts\ScopeDirectoryContract;
use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection as EloquentCollection;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Query\Builder as QueryBuilder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class ScopeAuthorizer implements ScopeAuthorizerContract
{
    public function __construct(private readonly ScopeDirectoryContract $scopeDirectory) {}

    public function can(Authenticatable $user, string $permission, ?ScopedResource $resource = null): bool
    {
        $labels = $this->getActiveScopeLabelsForPermission($user, $permission);

        if ($labels === []) {
            return false;
        }

        if ($resource === null || in_array('*', $labels, true)) {
            return true;
        }

        $paths = [$resource->getManagingScopePath()];
        if ($this->isReadPermission($permission)) {
            $paths[] = $resource->getHomeScopePath();
        }

        foreach ($paths as $path) {
            if (array_intersect($labels, explode('.', $path)) !== []) {
                return true;
            }
        }

        return false;
    }

    public function canAtScope(
        Authenticatable $user,
        string $permission,
        string $scopeLabel,
        ?string $scopeType = null,
        ?string $scopeId = null
    ): bool {
        return $this->labelsCanAtScope(
            $this->getActiveScopeLabelsForPermission($user, $permission),
            $permission,
            $scopeLabel,
            $scopeType,
            $scopeId
        );
    }

    public function canAtScopeForAssignment(
        Authenticatable $user,
        string $permission,
        RoleAssignment $assignment,
        string $scopeLabel,
        ?string $scopeType = null,
        ?string $scopeId = null
    ): bool {
        return $this->labelsCanAtScope(
            $this->getActiveScopeLabelsForPermission($user, $permission, $assignment->id),
            $permission,
            $scopeLabel,
            $scopeType,
            $scopeId
        );
    }

    /**
     * @return EloquentCollection<int, RoleAssignment>
     */
    public function activeAssignmentsForPermission(Authenticatable $user, string $permission): EloquentCollection
    {
        return RoleAssignment::query()->active()
            ->where('user_id', (string) $user->getAuthIdentifier())
            ->whereHas('user', fn (Builder $query) => $query->where('status', 'active'))
            ->whereHas('role', function (Builder $query) use ($permission): void {
                $query->whereRaw('is_active is true')
                    ->whereHas('permissions', fn (Builder $permissions) => $permissions->where('key', $permission));
            })
            ->with('role')
            ->get();
    }

    public function canAccessUser(Authenticatable $user, string $permission, User $target): bool
    {
        $labels = $this->getActiveScopeLabelsForPermission($user, $permission);
        if ($labels === []) {
            return false;
        }
        if (in_array('*', $labels, true)) {
            return true;
        }

        return $this->scopeQuery(User::query(), $user, $permission)->whereKey($target->id)->exists();
    }

    public function canAccessAssignment(Authenticatable $user, string $permission, RoleAssignment $target): bool
    {
        return $this->scopeQuery(RoleAssignment::query(), $user, $permission)->whereKey($target->id)->exists();
    }

    /**
     * @template TModel of Model
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
        $labels = $this->getActiveScopeLabelsForPermission($user, $permission);

        if ($labels === []) {
            return $query->whereRaw('1 = 0');
        }

        if (in_array('*', $labels, true)) {
            return $query;
        }

        $read = $this->isReadPermission($permission);
        $table = $query->getModel()->getTable();

        if ($table === 'users') {
            $now = Carbon::now();
            $memberships = DB::connection('tenant')->table('role_assignments as membership')
                ->selectRaw('1')
                ->whereColumn('membership.user_id', 'users.id')
                ->whereRaw('membership.is_active is true')
                ->where('membership.valid_from', '<=', $now)
                ->where(function (QueryBuilder $membership) use ($now): void {
                    $membership->whereNull('membership.valid_to')->orWhere('membership.valid_to', '>', $now);
                });

            $this->constrainAssignments($memberships, $labels, $read, 'membership');

            $matchingDepartments = $this->scopeDirectory->query()
                ->select('scope_id')
                ->where('scope_type', 'department');
            $this->constrainPaths($matchingDepartments, $labels, $read, 'managing_path', 'home_path');

            $unassignedProfile = DB::connection('tenant')->table('staff_profiles as sp')
                ->selectRaw('1')
                ->whereColumn('sp.user_id', 'users.id')
                ->whereIn('sp.requested_department_id', $matchingDepartments)
                ->whereNotExists(function (QueryBuilder $anyActive) use ($now): void {
                    $anyActive->from('role_assignments as ra_any')
                        ->selectRaw('1')
                        ->whereColumn('ra_any.user_id', 'users.id')
                        ->whereRaw('ra_any.is_active is true')
                        ->where('ra_any.valid_from', '<=', $now)
                        ->where(function (QueryBuilder $sub) use ($now): void {
                            $sub->whereNull('ra_any.valid_to')->orWhere('ra_any.valid_to', '>', $now);
                        });
                });

            $canSeePending = $permission === 'identity.user.approve'
                || $this->getActiveScopeLabelsForPermission($user, 'identity.user.approve') !== [];
            $allowedStatuses = $canSeePending ? ['pending', 'active'] : ['active'];

            return $query->where(function (Builder $q) use ($memberships, $unassignedProfile, $allowedStatuses): void {
                $q->whereExists($memberships)
                    ->orWhere(function (Builder $unassigned) use ($unassignedProfile, $allowedStatuses): void {
                        $unassigned->whereIn('users.status', $allowedStatuses)
                            ->whereExists($unassignedProfile);
                    });
            });
        }

        if ($table === 'role_assignments') {
            $this->constrainAssignments($query->getQuery(), $labels, $read, 'role_assignments');

            return $query;
        }

        if ($table === 'departments' || $table === 'streams') {
            $scopes = $this->scopeDirectory->query()->selectRaw('1')
                ->where('scope_type', $table === 'departments' ? 'department' : 'stream')
                ->whereColumn('scope_id', $table.'.id')
                ->whereColumn('scope_label', $table.'.scope_label');

            $this->constrainPaths($scopes, $labels, $read, 'scopes.managing_path', 'scopes.home_path');

            return $query->whereExists($scopes);
        }

        $this->constrainPaths($query->getQuery(), $labels, $read, $managingPathCol, $homePathCol);

        return $query;
    }

    public static function validateScopeLabel(string $label): void
    {
        ScopeLabelValidator::validate($label);
    }

    /**
     * @return list<string>
     */
    public function getActiveScopeLabelsForPermission(
        Authenticatable $user,
        string $permission,
        ?string $assignmentId = null
    ): array {
        $now = Carbon::now();

        if (
            $assignmentId === null
            && $user instanceof User
            && $user->relationLoaded('roleAssignments')
            && ! $user->roleAssignments->contains(
                fn (RoleAssignment $a): bool => ! $a->relationLoaded('role') || ! $a->role->relationLoaded('permissions')
            )
        ) {
            if (! $user->isActive()) {
                return [];
            }

            /** @var list<string> $inMemoryLabels */
            $inMemoryLabels = [];
            foreach ($user->roleAssignments as $assignment) {
                $validFromOk = $assignment->valid_from === null || $assignment->valid_from->lte($now);
                $validToOk = $assignment->valid_to === null || $assignment->valid_to->gt($now);
                if (! $assignment->is_active || ! $validFromOk || ! $validToOk || ! $assignment->role->is_active) {
                    continue;
                }
                if (! $assignment->role->permissions->contains(fn (Permission $p): bool => $p->key === $permission)) {
                    continue;
                }
                if ($assignment->scope_type === 'institution') {
                    return ['*'];
                }
                self::validateScopeLabel($assignment->scope_label);
                $inMemoryLabels[] = $assignment->scope_label;
            }

            return array_values(array_unique($inMemoryLabels));
        }

        $query = DB::connection('tenant')->table('role_assignments')
            ->join('users', 'users.id', '=', 'role_assignments.user_id')
            ->join('roles', 'roles.id', '=', 'role_assignments.role_id')
            ->join('role_permission', 'role_permission.role_id', '=', 'role_assignments.role_id')
            ->join('permissions', 'permissions.id', '=', 'role_permission.permission_id')
            ->where('role_assignments.user_id', (string) $user->getAuthIdentifier())
            ->where('users.status', 'active')
            ->whereRaw('roles.is_active is true')
            ->whereRaw('role_assignments.is_active is true')
            ->where('role_assignments.valid_from', '<=', $now)
            ->where(function (QueryBuilder $query) use ($now): void {
                $query->whereNull('role_assignments.valid_to')->orWhere('role_assignments.valid_to', '>', $now);
            })
            ->where('permissions.key', $permission)
            ->select('role_assignments.scope_type', 'role_assignments.scope_label');

        if ($assignmentId !== null) {
            $query->where('role_assignments.id', $assignmentId);
        }

        /** @var list<string> $labels */
        $labels = [];
        foreach ($query->get() as $assignment) {
            if ($assignment->scope_type === 'institution') {
                // Includes the existing null-scope-id bootstrap assignment.
                return ['*'];
            }

            self::validateScopeLabel($assignment->scope_label);
            $labels[] = $assignment->scope_label;
        }

        return array_values(array_unique($labels));
    }

    public function isReadPermission(string $permission): bool
    {
        return str_ends_with($permission, '.view')
            || str_ends_with($permission, '.view_own')
            || str_ends_with($permission, '.audit_report')
            || str_ends_with($permission, '.download')
            || str_ends_with($permission, '.export');
    }

    /**
     * @param  list<string>  $labels
     */
    private function labelsCanAtScope(
        array $labels,
        string $permission,
        string $scopeLabel,
        ?string $scopeType,
        ?string $scopeId
    ): bool {
        self::validateScopeLabel($scopeLabel);

        if ($labels === []) {
            return false;
        }

        // Offering tables are deferred; retain exact-label/institution semantics
        // for existing opaque offering assignments without inventing a hierarchy.
        if ($scopeType === 'course_offering') {
            return in_array('*', $labels, true) || in_array($scopeLabel, $labels, true);
        }

        $scopes = $this->scopeReferences()->where('scope_label', $scopeLabel);
        if ($scopeType !== null) {
            $scopes->where('scope_type', $scopeType);
        }
        if ($scopeId !== null) {
            $scopes->where('scope_id', $scopeId);
        }

        $this->constrainPaths($scopes, $labels, $this->isReadPermission($permission), 'scopes.managing_path', 'scopes.home_path');

        return $scopes->exists();
    }

    private function scopeReferences(): QueryBuilder
    {
        $own = DB::connection('tenant')->table('users')->selectRaw(
            "'own' AS scope_type, id AS scope_id, 'u_' || id AS scope_label, ('u_' || id)::ltree AS home_path, ('u_' || id)::ltree AS managing_path"
        );

        return DB::connection('tenant')->query()->fromSub(
            $this->scopeDirectory->query()->unionAll($own),
            'scopes'
        );
    }

    /**
     * @param  list<string>  $labels
     */
    private function constrainAssignments(QueryBuilder $query, array $labels, bool $read, string $alias): void
    {
        $scopes = $this->scopeReferences()->selectRaw('1')
            ->whereColumn('scopes.scope_type', $alias.'.scope_type')
            ->whereColumn('scopes.scope_label', $alias.'.scope_label')
            ->where(function (QueryBuilder $scope) use ($alias): void {
                $scope->whereNull($alias.'.scope_id')->orWhereColumn('scopes.scope_id', $alias.'.scope_id');
            });

        $this->constrainPaths($scopes, $labels, $read, 'scopes.managing_path', 'scopes.home_path');

        $query->where(function (QueryBuilder $assignments) use ($scopes, $labels, $alias): void {
            $assignments->whereExists($scopes)
                ->orWhere(function (QueryBuilder $offering) use ($labels, $alias): void {
                    $offering->where($alias.'.scope_type', 'course_offering')->whereIn($alias.'.scope_label', $labels);
                });
        });
    }

    /**
     * @param  list<string>  $labels
     */
    private function constrainPaths(
        QueryBuilder $query,
        array $labels,
        bool $read,
        string $managingColumn,
        string $homeColumn
    ): void {
        if (in_array('*', $labels, true)) {
            return;
        }

        foreach ($labels as $label) {
            self::validateScopeLabel($label);
        }

        $pattern = '*.'.implode('|', $labels).'.*';
        $grammar = DB::connection('tenant')->getQueryGrammar();
        $managing = $grammar->wrap($managingColumn);
        $home = $grammar->wrap($homeColumn);

        $query->where(function (QueryBuilder $paths) use ($read, $pattern, $managing, $home): void {
            $paths->whereRaw("{$managing} ~ ?::lquery", [$pattern]);
            if ($read) {
                $paths->orWhereRaw("{$home} ~ ?::lquery", [$pattern]);
            }
        });
    }
}

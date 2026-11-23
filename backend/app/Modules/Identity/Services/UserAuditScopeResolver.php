<?php

declare(strict_types=1);

namespace App\Modules\Identity\Services;

use App\Modules\Identity\Models\RoleAssignment;
use App\Modules\Identity\Models\User;
use App\Modules\Organisation\Contracts\ScopeDirectoryContract;

final class UserAuditScopeResolver
{
    public function __construct(private readonly ScopeDirectoryContract $scopeDirectory) {}

    /**
     * Resolve scope_path and department_id for audit event properties (never throws).
     *
     * @return array{scope_path: string|null, department_id: string|null}
     */
    public function resolveForUser(User $user): array
    {
        /** @var RoleAssignment|null $assignment */
        $assignment = RoleAssignment::query()
            ->where('user_id', $user->id)
            ->active()
            ->orderByDesc('valid_from')
            ->first();

        if ($assignment === null) {
            return ['scope_path' => null, 'department_id' => null];
        }

        $scopeRow = $this->scopeDirectory->query()
            ->where('scope_type', $assignment->scope_type)
            ->where('scope_label', $assignment->scope_label)
            ->first();

        $scopePath = $scopeRow !== null && is_string($scopeRow->managing_path ?? null)
            ? $scopeRow->managing_path
            : $assignment->scope_label;

        $departmentId = $assignment->scope_type === 'department'
            ? $assignment->scope_id
            : null;

        if ($departmentId === null && $scopePath !== '') {
            $deptRow = $this->scopeDirectory->query()
                ->where('scope_type', 'department')
                ->whereRaw('?::ltree <@ managing_path', [$scopePath])
                ->first();
            if ($deptRow !== null && is_string($deptRow->scope_id ?? null)) {
                $departmentId = $deptRow->scope_id;
            }
        }

        return [
            'scope_path' => $scopePath,
            'department_id' => $departmentId,
        ];
    }
}

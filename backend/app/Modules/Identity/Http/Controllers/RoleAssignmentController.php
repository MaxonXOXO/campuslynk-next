<?php

declare(strict_types=1);

namespace App\Modules\Identity\Http\Controllers;

use App\Modules\Identity\Actions\AssignRoleAction;
use App\Modules\Identity\Actions\RevokeRoleAction;
use App\Modules\Identity\Http\Requests\AssignRoleRequest;
use App\Modules\Identity\Http\Requests\RevokeRoleRequest;
use App\Modules\Identity\Models\Role;
use App\Modules\Identity\Models\RoleAssignment;
use App\Modules\Identity\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Carbon;
use Symfony\Component\HttpFoundation\Response;

class RoleAssignmentController
{
    public function index(): JsonResponse
    {
        $roles = Role::whereRaw('is_active is true')->with('permissions')->get();

        return response()->json([
            'data' => $roles->map(fn (Role $r) => [
                'id' => $r->id,
                'key' => $r->key,
                'name' => $r->name,
                'scope_type' => $r->scope_type,
                'stream' => $r->stream,
                'is_singleton' => $r->is_singleton,
                'permissions' => $r->permissions->pluck('key')->all(),
            ]),
            'meta' => [
                'total' => $roles->count(),
            ],
        ]);
    }

    public function assign(AssignRoleRequest $request, AssignRoleAction $action): JsonResponse
    {
        /** @var User $assigner */
        $assigner = $request->user();

        /** @var User $targetUser */
        $targetUser = User::findOrFail((string) $request->validated('user_id'));

        /** @var Role $role */
        $role = Role::where('key', (string) $request->validated('role_key'))->firstOrFail();

        $validFrom = $request->validated('valid_from')
            ? Carbon::parse((string) $request->validated('valid_from'))
            : null;

        $validTo = $request->validated('valid_to')
            ? Carbon::parse((string) $request->validated('valid_to'))
            : null;

        $assignment = $action->execute(
            assigner: $assigner,
            targetUser: $targetUser,
            targetRole: $role,
            scopeType: (string) $request->validated('scope_type'),
            scopeLabel: (string) $request->validated('scope_label'),
            scopeId: $request->validated('scope_id') ? (string) $request->validated('scope_id') : null,
            validFrom: $validFrom,
            validTo: $validTo,
            orderRecord: $request->validated('order_record') ? (string) $request->validated('order_record') : null
        );

        return response()->json([
            'data' => [
                'id' => $assignment->id,
                'user_id' => $assignment->user_id,
                'role_key' => $role->key,
                'scope_type' => $assignment->scope_type,
                'scope_label' => $assignment->scope_label,
                'is_singleton' => $assignment->is_singleton,
                'valid_from' => $assignment->valid_from->toIso8601String(),
                'valid_to' => $assignment->valid_to?->toIso8601String(),
                'is_active' => $assignment->is_active,
            ],
            'meta' => [
                'timestamp' => now()->toIso8601String(),
            ],
        ], Response::HTTP_CREATED);
    }

    public function revoke(RevokeRoleRequest $request, RevokeRoleAction $action): JsonResponse
    {
        /** @var User $revoker */
        $revoker = $request->user();

        /** @var RoleAssignment $assignment */
        $assignment = RoleAssignment::findOrFail((string) $request->validated('assignment_id'));

        $action->execute(
            revoker: $revoker,
            assignment: $assignment
        );

        return response()->json([
            'data' => [
                'message' => 'Role assignment revoked successfully.',
            ],
            'meta' => [
                'timestamp' => now()->toIso8601String(),
            ],
        ]);
    }
}

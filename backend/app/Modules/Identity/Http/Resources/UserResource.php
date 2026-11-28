<?php

declare(strict_types=1);

namespace App\Modules\Identity\Http\Resources;

use App\Modules\Identity\Models\RoleAssignment;
use App\Modules\Identity\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Gate;

/**
 * @property-read User $resource
 */
class UserResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $isLocked = $this->resource->isLocked();
        $caller = $request->user();

        $abilities = [
            'update' => $caller !== null && Gate::forUser($caller)->allows('update', $this->resource),
            'suspend' => $caller !== null && Gate::forUser($caller)->allows('suspend', $this->resource),
            'reactivate' => $caller !== null && Gate::forUser($caller)->allows('reactivate', $this->resource),
            'deactivate' => $caller !== null && Gate::forUser($caller)->allows('deactivate', $this->resource),
            'reset_password' => $caller !== null && Gate::forUser($caller)->allows('resetPassword', $this->resource),
            'unlock' => $caller !== null && Gate::forUser($caller)->allows('unlock', $this->resource),
            'approve' => $caller !== null && Gate::forUser($caller)->allows('approve', $this->resource),
            'reject' => $caller !== null && Gate::forUser($caller)->allows('reject', $this->resource),
        ];

        $assignments = [];
        if ($this->resource->relationLoaded('roleAssignments')) {
            $assignments = $this->resource->roleAssignments
                ->filter(fn (RoleAssignment $assignment): bool => (bool) $assignment->is_active)
                ->map(fn (RoleAssignment $assignment): array => [
                    'id' => $assignment->id,
                    'role_key' => $assignment->role->key,
                    'role_name' => $assignment->role->name,
                    'scope_type' => $assignment->scope_type,
                    'scope_label' => $assignment->scope_label,
                ])
                ->values()
                ->all();
        }

        return [
            'id' => $this->resource->id,
            'type' => $this->resource->type,
            'name' => $this->resource->name,
            'first_name' => $this->resource->first_name,
            'last_name' => $this->resource->last_name,
            'avatar_url' => $this->resource->avatarUrl(),
            'email' => $this->resource->email,
            'mobile' => $this->resource->mobile,
            'registration_number' => $this->resource->registration_number,
            'status' => $this->resource->status,
            'status_reason' => $this->resource->status_reason,
            'deactivated_at' => $this->resource->deactivated_at?->toIso8601String(),
            'must_change_password' => $this->resource->must_change_password,
            'temporary_password_expires_at' => $this->resource->temporary_password_expires_at?->toIso8601String(),
            'is_locked' => $isLocked,
            'locked_until' => $isLocked ? $this->resource->locked_until?->toIso8601String() : null,
            'last_login_at' => $this->resource->last_login_at?->toIso8601String(),
            'first_activated_at' => $this->resource->first_activated_at?->toIso8601String(),
            'rejected_at' => $this->resource->rejected_at?->toIso8601String(),
            'staff_profile' => $this->whenLoaded('staffProfile', function () {
                $profile = $this->resource->staffProfile;
                if ($profile === null) {
                    return null;
                }

                return [
                    'requested_department_id' => $profile->requested_department_id,
                    'designation' => $profile->designation,
                    'employee_id' => $profile->employee_id,
                    'import_batch_id' => $profile->import_batch_id,
                ];
            }),
            'assignments' => $assignments,
            'abilities' => $abilities,
            'created_at' => $this->resource->created_at?->toIso8601String(),
            'updated_at' => $this->resource->updated_at?->toIso8601String(),
        ];
    }
}

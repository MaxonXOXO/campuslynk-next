<?php

declare(strict_types=1);

namespace App\Modules\Identity\Http\Resources;

use App\Modules\Identity\Models\RoleAssignment;
use App\Modules\Identity\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

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
            'email' => $this->resource->email,
            'mobile' => $this->resource->mobile,
            'registration_number' => $this->resource->registration_number,
            'status' => $this->resource->status,
            'must_change_password' => $this->resource->must_change_password,
            'temporary_password_expires_at' => $this->resource->temporary_password_expires_at?->toIso8601String(),
            'is_locked' => $isLocked,
            'locked_until' => $isLocked ? $this->resource->locked_until?->toIso8601String() : null,
            'last_login_at' => $this->resource->last_login_at?->toIso8601String(),
            'assignments' => $assignments,
            'created_at' => $this->resource->created_at?->toIso8601String(),
            'updated_at' => $this->resource->updated_at?->toIso8601String(),
        ];
    }
}

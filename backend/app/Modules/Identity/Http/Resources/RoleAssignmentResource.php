<?php

declare(strict_types=1);

namespace App\Modules\Identity\Http\Resources;

use App\Modules\Identity\Models\RoleAssignment;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @property-read RoleAssignment $resource
 */
class RoleAssignmentResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $user = $this->resource->relationLoaded('user') ? $this->resource->user : null;
        $assignedBy = $this->resource->relationLoaded('assignedByUser') ? $this->resource->assignedByUser : null;
        $role = $this->resource->relationLoaded('role') ? $this->resource->role : null;

        return [
            'id' => $this->resource->id,
            'user_id' => $this->resource->user_id,
            'role_id' => $this->resource->role_id,
            'role_key' => $role?->key,
            'role_name' => $role?->name,
            'scope_type' => $this->resource->scope_type,
            'scope_label' => $this->resource->scope_label,
            'is_singleton' => (bool) $this->resource->is_singleton,
            'valid_from' => $this->resource->valid_from?->toIso8601String(),
            'valid_to' => $this->resource->valid_to?->toIso8601String(),
            'is_active' => (bool) $this->resource->is_active,
            'order_record' => $this->resource->order_record,
            'reason' => $this->resource->reason,
            'user' => $user !== null ? [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'mobile' => $user->mobile,
            ] : null,
            'assigned_by' => $assignedBy !== null ? [
                'id' => $assignedBy->id,
                'name' => $assignedBy->name,
            ] : null,
        ];
    }
}

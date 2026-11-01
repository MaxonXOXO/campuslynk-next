<?php

declare(strict_types=1);

namespace App\Core\Auth\Http\Resources;

use App\Core\Auth\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @property-read User $resource
 */
class UserResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->resource->id,
            'type' => $this->resource->type,
            'name' => $this->resource->name,
            'email' => $this->resource->email,
            'mobile' => $this->resource->mobile,
            'registration_number' => $this->resource->registration_number,
            'status' => $this->resource->status,
            'must_change_password' => $this->resource->must_change_password,
            'last_login_at' => $this->resource->last_login_at?->toIso8601String(),
            'created_at' => $this->resource->created_at?->toIso8601String(),
            'updated_at' => $this->resource->updated_at?->toIso8601String(),
        ];
    }
}

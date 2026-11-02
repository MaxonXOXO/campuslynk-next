<?php

declare(strict_types=1);

namespace App\Modules\Organisation\Http\Resources;

use App\Modules\Organisation\Models\Department;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @property-read Department $resource
 */
class DepartmentResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->resource->id,
            'code' => $this->resource->code,
            'name' => $this->resource->name,
            'stream_id' => $this->resource->stream_id,
            'funding_stream' => $this->resource->funding_stream,
            'kind' => $this->resource->kind,
            'scope_label' => $this->resource->scope_label,
            'is_active' => $this->resource->is_active,
            'created_at' => $this->resource->created_at?->toIso8601String(),
            'updated_at' => $this->resource->updated_at?->toIso8601String(),
        ];
    }
}

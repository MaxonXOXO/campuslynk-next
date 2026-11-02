<?php

declare(strict_types=1);

namespace App\Modules\Organisation\Http\Resources;

use App\Modules\Organisation\Models\Batch;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @property-read Batch $resource
 */
class BatchResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->resource->id,
            'name' => $this->resource->name,
            'program_id' => $this->resource->program_id,
            'home_department_id' => $this->resource->home_department_id,
            'managing_department_id' => $this->resource->managing_department_id,
            'academic_year_id' => $this->resource->academic_year_id,
            'regulation_id' => $this->resource->regulation_id,
            'entry_type' => $this->resource->entry_type,
            'current_semester' => $this->resource->current_semester,
            'status' => $this->resource->status,
            'scope_label' => $this->resource->scope_label,
            'home_path' => $this->resource->home_path,
            'managing_path' => $this->resource->managing_path,
            'created_at' => $this->resource->created_at?->toIso8601String(),
            'updated_at' => $this->resource->updated_at?->toIso8601String(),
        ];
    }
}

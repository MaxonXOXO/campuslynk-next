<?php

declare(strict_types=1);

namespace App\Modules\Organisation\Http\Resources;

use App\Modules\Organisation\Models\Stream;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @property Stream $resource
 */
class StreamResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        /** @var int $departmentsCount */
        $departmentsCount = $this->resource->departments_count ?? $this->resource->departments()->count();

        return [
            'id' => $this->resource->id,
            'code' => $this->resource->code,
            'name' => $this->resource->name,
            'scope_label' => $this->resource->scope_label,
            'departments_count' => (int) $departmentsCount,
            'created_at' => $this->resource->created_at?->toIso8601String(),
            'updated_at' => $this->resource->updated_at?->toIso8601String(),
        ];
    }
}

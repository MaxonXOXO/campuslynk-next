<?php

declare(strict_types=1);

namespace App\Modules\Organisation\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class SetupStatusResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'completed_at' => $this->resource['completed_at'] ?? null,
            'is_completed' => (bool) ($this->resource['is_completed'] ?? false),
            'steps' => $this->resource['steps'] ?? [],
            'prerequisites' => $this->resource['prerequisites'] ?? [],
        ];
    }
}

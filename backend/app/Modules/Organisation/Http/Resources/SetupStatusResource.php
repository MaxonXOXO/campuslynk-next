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
        /** @var array<string, mixed> $resource */
        $resource = is_array($this->resource) ? $this->resource : [];
        /** @var array<string, mixed> $steps */
        $steps = isset($resource['steps']) && is_array($resource['steps']) ? $resource['steps'] : [];

        $formatStep = function (mixed $stepData): array {
            /** @var array<string, mixed> $data */
            $data = is_array($stepData) ? $stepData : [];

            return [
                'completed_at' => isset($data['completed_at']) && is_string($data['completed_at']) ? $data['completed_at'] : null,
                'is_completed' => (bool) ($data['is_completed'] ?? false),
                'settings_exist' => (bool) ($data['settings_exist'] ?? false),
                'values' => isset($data['values']) && is_array($data['values']) ? $data['values'] : null,
            ];
        };

        /** @var array<string, mixed> $prerequisites */
        $prerequisites = isset($resource['prerequisites']) && is_array($resource['prerequisites'])
            ? $resource['prerequisites']
            : [];

        return [
            'completed_at' => isset($resource['completed_at']) && is_string($resource['completed_at'])
                ? $resource['completed_at']
                : null,
            'is_completed' => (bool) ($resource['is_completed'] ?? false),
            'steps' => [
                'institution_profile' => $formatStep($steps['institution_profile'] ?? null),
                'calendar_basics' => $formatStep($steps['calendar_basics'] ?? null),
                'signup_policy' => $formatStep($steps['signup_policy'] ?? null),
            ],
            'prerequisites' => $prerequisites,
        ];
    }
}

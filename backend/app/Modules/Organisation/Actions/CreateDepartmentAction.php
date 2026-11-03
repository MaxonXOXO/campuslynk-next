<?php

declare(strict_types=1);

namespace App\Modules\Organisation\Actions;

use App\Core\Authorization\ScopeLabelValidator;
use App\Modules\Organisation\Models\Department;
use App\Modules\Organisation\Models\Stream;

final class CreateDepartmentAction
{
    public function execute(
        string $code,
        string $name,
        string $streamId,
        string $fundingStream,
        string $kind = 'academic'
    ): Department {
        $cleanCode = strtoupper(trim($code));
        $scopeLabel = 'd_'.strtolower((string) preg_replace('/[^a-zA-Z0-9_]/', '_', $cleanCode));
        ScopeLabelValidator::validate($scopeLabel);

        // Ensure stream exists
        Stream::findOrFail($streamId);

        /** @var Department $department */
        $department = Department::create([
            'code' => $cleanCode,
            'name' => $name,
            'stream_id' => $streamId,
            'funding_stream' => strtoupper($fundingStream),
            'kind' => $kind,
            'is_active' => true,
            'scope_label' => $scopeLabel,
        ]);

        return $department;
    }
}

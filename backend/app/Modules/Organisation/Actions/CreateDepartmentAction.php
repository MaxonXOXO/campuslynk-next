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
        ?string $fundingStream = null,
        string $kind = 'academic',
        ?string $scopeLabel = null
    ): Department {
        $cleanCode = strtoupper(trim($code));
        $stream = Stream::findOrFail($streamId);

        if ($scopeLabel === null) {
            $baseLabel = 'd_'.strtolower((string) preg_replace('/[^a-zA-Z0-9_]/', '_', $cleanCode));
            $scopeLabel = Department::where('scope_label', $baseLabel)->exists()
                ? $baseLabel.'_'.strtolower((string) preg_replace('/[^a-zA-Z0-9_]/', '_', $stream->code))
                : $baseLabel;
        }

        ScopeLabelValidator::validate($scopeLabel);

        /** @var Department $department */
        $department = Department::create([
            'code' => $cleanCode,
            'name' => $name,
            'stream_id' => $streamId,
            'kind' => $kind,
            'is_active' => true,
            'scope_label' => $scopeLabel,
        ]);

        return $department;
    }
}

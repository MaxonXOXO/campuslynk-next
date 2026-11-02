<?php

declare(strict_types=1);

namespace App\Modules\Organisation\Actions;

use App\Modules\Identity\Services\ScopeAuthorizer;
use App\Modules\Organisation\Models\Department;
use App\Modules\Organisation\Models\Program;

class CreateProgramAction
{
    public function execute(
        string $departmentId,
        string $code,
        string $name,
        int $durationSemesters = 6
    ): Program {
        Department::findOrFail($departmentId);

        $cleanCode = strtoupper(trim($code));
        $scopeLabel = 'p_'.strtolower((string) preg_replace('/[^a-zA-Z0-9_]/', '_', $cleanCode));
        ScopeAuthorizer::validateScopeLabel($scopeLabel);

        /** @var Program $program */
        $program = Program::create([
            'department_id' => $departmentId,
            'code' => $cleanCode,
            'name' => $name,
            'duration_semesters' => $durationSemesters,
            'scope_label' => $scopeLabel,
        ]);

        return $program;
    }
}

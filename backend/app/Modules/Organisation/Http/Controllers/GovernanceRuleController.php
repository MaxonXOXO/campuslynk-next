<?php

declare(strict_types=1);

namespace App\Modules\Organisation\Http\Controllers;

use App\Modules\Organisation\Models\DepartmentSemesterGovernance;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class GovernanceRuleController
{
    public function index(Request $request): JsonResponse
    {
        $rules = DepartmentSemesterGovernance::with(['homeDepartment', 'managingDepartment'])
            ->orderBy('semester_from')
            ->get();

        return response()->json([
            'data' => $rules->map(fn (DepartmentSemesterGovernance $r) => [
                'id' => $r->id,
                'home_department_id' => $r->home_department_id,
                'home_department_code' => $r->homeDepartment->code,
                'semester_from' => $r->semester_from,
                'semester_to' => $r->semester_to,
                'managing_department_id' => $r->managing_department_id,
                'managing_department_code' => $r->managingDepartment->code,
            ]),
            'meta' => [
                'total' => $rules->count(),
            ],
            'links' => [
                'self' => $request->fullUrl(),
            ],
        ]);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        /** @var DepartmentSemesterGovernance $rule */
        $rule = DepartmentSemesterGovernance::findOrFail($id);

        $validated = $request->validate([
            'managing_department_id' => ['sometimes', 'string', 'exists:tenant.departments,id'],
            'semester_from' => ['sometimes', 'integer', 'min:1', 'max:8'],
            'semester_to' => ['sometimes', 'integer', 'min:1', 'max:8'],
        ]);

        $rule->fill($validated);
        $rule->save();

        activity('organisation')
            ->performedOn($rule)
            ->causedBy($request->user())
            ->log("Updated department semester governance rule [{$rule->id}].");

        return response()->json([
            'data' => [
                'id' => $rule->id,
                'home_department_id' => $rule->home_department_id,
                'semester_from' => $rule->semester_from,
                'semester_to' => $rule->semester_to,
                'managing_department_id' => $rule->managing_department_id,
            ],
            'meta' => [
                'timestamp' => now()->toIso8601String(),
                'message' => 'Governance rule updated successfully.',
            ],
            'links' => [
                'self' => url("/api/v1/governance-rules/{$rule->id}"),
            ],
        ]);
    }
}

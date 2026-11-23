<?php

declare(strict_types=1);

namespace App\Modules\Identity\Services;

use App\Modules\Identity\Models\RoleAssignment;
use App\Modules\Identity\Models\User;
use Illuminate\Support\Carbon;

final class RoleAuthorityRank
{
    /**
     * Authority rank per canonical role key (ADR-0017 hierarchy).
     *
     * @var array<string, int>
     */
    private const RANKS = [
        'super_admin' => 100,
        'principal' => 90,
        'chairman' => 85,
        'admin' => 80,
        'hod' => 70,
        'academic_coordinator' => 60,
        'gen_dept_coordinator' => 60,
        'workshop_superintendent' => 60,
        'sf_office' => 60,
        'tutor' => 50,
        'mentor' => 45,
        'lecturer' => 40,
        'demonstrator' => 40,
        'workshop_instructor' => 40,
        'trade_instructor' => 40,
        'tradesman' => 40,
        'laboratory_assistant' => 40,
        'physical_instructor' => 40,
        'course_teacher' => 40,
        'student' => 10,
        'parent' => 10,
    ];

    public function rankForRoleKey(string $roleKey): int
    {
        return self::RANKS[$roleKey] ?? 0;
    }

    /**
     * Return the highest authority rank across all currently active assignments for a user.
     */
    public function highestActiveRank(User $user): int
    {
        if ($user->relationLoaded('roleAssignments')) {
            $now = Carbon::now();
            $assignments = $user->roleAssignments;
            if ($assignments->contains(fn (RoleAssignment $a): bool => ! $a->relationLoaded('role'))) {
                $assignments->load('role');
            }

            $max = 0;
            foreach ($assignments as $assignment) {
                $validFromOk = $assignment->valid_from === null || $assignment->valid_from->lte($now);
                $validToOk = $assignment->valid_to === null || $assignment->valid_to->gt($now);
                if (! $assignment->is_active || ! $validFromOk || ! $validToOk) {
                    continue;
                }
                $rank = $this->rankForRoleKey($assignment->role->key);
                if ($rank > $max) {
                    $max = $rank;
                }
            }

            return $max;
        }

        /** @var list<string> $roleKeys */
        $roleKeys = RoleAssignment::query()
            ->where('user_id', $user->id)
            ->active()
            ->with('role')
            ->get()
            ->map(fn (RoleAssignment $assignment): string => $assignment->role->key)
            ->all();

        $max = 0;
        foreach ($roleKeys as $key) {
            $rank = $this->rankForRoleKey($key);
            if ($rank > $max) {
                $max = $rank;
            }
        }

        return $max;
    }
}

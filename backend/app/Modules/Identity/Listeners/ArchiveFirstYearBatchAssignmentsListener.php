<?php

declare(strict_types=1);

namespace App\Modules\Identity\Listeners;

use App\Modules\Identity\Models\Role;
use App\Modules\Identity\Models\RoleAssignment;
use App\Modules\Organisation\Events\BatchSemesterPromoted;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Carbon;

class ArchiveFirstYearBatchAssignmentsListener
{
    /**
     * Handle the batch semester promotion event.
     * When a batch crosses from S2 to S3, temporary General Department Tutor and Mentor
     * assignments are automatically concluded to allow the parent branch HOD to assign new tutors.
     */
    public function handle(BatchSemesterPromoted $event): void
    {
        if ($event->previousSemester <= 2 && $event->newSemester >= 3) {
            $batchScopeLabel = $event->batch->scope_label;

            $roleIds = Role::whereIn('key', ['tutor', 'mentor'])->pluck('id');

            /** @var Collection<int, RoleAssignment> $assignments */
            $assignments = RoleAssignment::whereIn('role_id', $roleIds)
                ->where('scope_label', $batchScopeLabel)
                ->whereRaw('is_active is true')
                ->get();

            $now = Carbon::now();

            foreach ($assignments as $assignment) {
                $assignment->is_active = false;
                $assignment->valid_to = $now;
                $assignment->save();

                activity('rbac')
                    ->performedOn($assignment)
                    ->withProperties([
                        'batch_id' => $event->batch->id,
                        'transition' => 'S2 -> S3',
                    ])
                    ->log("Automatically archived first-year batch assignment [{$assignment->id}] upon promotion to Semester {$event->newSemester}.");
            }
        }
    }
}

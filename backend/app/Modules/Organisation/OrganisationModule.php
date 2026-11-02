<?php

declare(strict_types=1);

namespace App\Modules\Organisation;

use App\Modules\Organisation\Contracts\GovernanceResolverContract;
use App\Modules\Organisation\Contracts\ScopeTreeContract;
use App\Modules\Organisation\Services\GovernanceResolver;
use App\Modules\Organisation\Services\ScopePathBuilder;
use Illuminate\Support\ServiceProvider;

class OrganisationModule extends ServiceProvider
{
    /**
     * All permissions declared by the Organisation module.
     * Pattern: organisation.<resource>.<action>
     *
     * @return list<string>
     */
    public static function permissions(): array
    {
        return [
            'organisation.department.manage',
            'organisation.batch.view',
            'organisation.batch.create',
            'organisation.batch.promote_semester',
            'organisation.batch.graduate',
            'organisation.batch.delete',
            'organisation.batch.assign_tutor',
            'organisation.batch.assign_mentor',
            'organisation.batch.manage_roll_numbers',
            'organisation.batch.bulk_import_students',
            'organisation.course_offering.manage',
            'organisation.course_offering.assign_staff',
            'organisation.timetable.manage',
            'organisation.day_order.set',
            'organisation.academic_calendar.manage',
        ];
    }

    /**
     * Role-to-permission mappings for the Organisation module.
     *
     * @return array<string, list<string>>
     */
    public static function rolePermissions(): array
    {
        return [
            'super_admin' => [
                'organisation.batch.view',
                'organisation.academic_calendar.manage',
            ],
            'principal' => [
                'organisation.department.manage',
                'organisation.batch.view',
                'organisation.timetable.manage',
                'organisation.day_order.set',
                'organisation.academic_calendar.manage',
            ],
            'academic_coordinator' => [
                'organisation.batch.view',
                'organisation.timetable.manage',
                'organisation.academic_calendar.manage',
            ],
            'gen_dept_coordinator' => [
                'organisation.batch.view',
                'organisation.batch.assign_tutor',
                'organisation.batch.assign_mentor',
                'organisation.course_offering.manage',
                'organisation.course_offering.assign_staff',
                'organisation.timetable.manage',
            ],
            'hod' => [
                'organisation.department.manage',
                'organisation.batch.view',
                'organisation.batch.create',
                'organisation.batch.promote_semester',
                'organisation.batch.graduate',
                'organisation.batch.delete',
                'organisation.batch.assign_tutor',
                'organisation.batch.assign_mentor',
                'organisation.course_offering.manage',
                'organisation.course_offering.assign_staff',
                'organisation.timetable.manage',
                'organisation.academic_calendar.manage',
            ],
            'workshop_superintendent' => [
                'organisation.batch.view',
                'organisation.batch.bulk_import_students',
            ],
            'tutor' => [
                'organisation.batch.view',
                'organisation.batch.assign_mentor',
                'organisation.batch.manage_roll_numbers',
                'organisation.batch.bulk_import_students',
            ],
            'mentor' => [
                'organisation.batch.view',
            ],
            'course_teacher' => [
                'organisation.batch.view',
            ],
            'lecturer' => [
                'organisation.batch.view',
            ],
            'demonstrator' => [
                'organisation.batch.view',
            ],
            'workshop_instructor' => [
                'organisation.batch.view',
            ],
            'trade_instructor' => [
                'organisation.batch.view',
            ],
            'tradesman' => [
                'organisation.batch.view',
            ],
            'laboratory_assistant' => [
                'organisation.batch.view',
            ],
            'physical_instructor' => [
                'organisation.batch.view',
            ],
            'admin' => [
                'organisation.batch.view',
                'organisation.batch.manage_roll_numbers',
                'organisation.batch.bulk_import_students',
            ],
            'student' => [
                'organisation.batch.view',
            ],
            'parent' => [
                'organisation.batch.view',
            ],
        ];
    }

    public function register(): void
    {
        $this->app->singleton(
            GovernanceResolverContract::class,
            GovernanceResolver::class
        );

        $this->app->singleton(
            ScopeTreeContract::class,
            ScopePathBuilder::class
        );
    }

    public function boot(): void
    {
        // Module event listeners or route registrations
    }
}

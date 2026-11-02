<?php

declare(strict_types=1);

namespace App\Modules\Identity\Database\Seeders;

use App\Modules\Identity\Models\DelegationRule;
use App\Modules\Identity\Models\Role;
use Illuminate\Database\Seeder;

class RbacBaselineSeeder extends Seeder
{
    public function run(): void
    {
        // 1. Seed 21 Tenant Roles (docs/role_and_permission_spec.md §3)
        $roles = [
            [
                'key' => 'super_admin',
                'name' => 'Super Admin (College IT Head)',
                'scope_type' => 'institution',
                'stream' => 'both',
                'is_singleton' => false,
            ],
            [
                'key' => 'principal',
                'name' => 'Principal',
                'scope_type' => 'institution',
                'stream' => 'both',
                'is_singleton' => true,
            ],
            [
                'key' => 'chairman',
                'name' => 'Chairman',
                'scope_type' => 'institution',
                'stream' => 'configurable',
                'is_singleton' => false,
            ],
            [
                'key' => 'admin',
                'name' => 'Office Admin',
                'scope_type' => 'institution',
                'stream' => 'configurable',
                'is_singleton' => false,
            ],
            [
                'key' => 'academic_coordinator',
                'name' => 'Academic Coordinator (SF)',
                'scope_type' => 'stream',
                'stream' => 'sf',
                'is_singleton' => true,
            ],
            [
                'key' => 'gen_dept_coordinator',
                'name' => 'General Dept Coordinator',
                'scope_type' => 'department',
                'stream' => 'both',
                'is_singleton' => true,
            ],
            [
                'key' => 'sf_office',
                'name' => 'SF Office Superintendent',
                'scope_type' => 'stream',
                'stream' => 'sf',
                'is_singleton' => false,
            ],
            [
                'key' => 'hod',
                'name' => 'Head of Department',
                'scope_type' => 'department',
                'stream' => 'both',
                'is_singleton' => true,
            ],
            [
                'key' => 'workshop_superintendent',
                'name' => 'Workshop Superintendent',
                'scope_type' => 'workshop_section',
                'stream' => 'both',
                'is_singleton' => true,
            ],
            [
                'key' => 'tutor',
                'name' => 'Class Tutor (Mentor-1)',
                'scope_type' => 'batch',
                'stream' => 'both',
                'is_singleton' => true,
            ],
            [
                'key' => 'mentor',
                'name' => 'Batch Mentor (Mentor-2)',
                'scope_type' => 'batch',
                'stream' => 'both',
                'is_singleton' => false,
            ],
            [
                'key' => 'course_teacher',
                'name' => 'Subject / Course Staff',
                'scope_type' => 'course_offering',
                'stream' => 'both',
                'is_singleton' => false,
            ],
            [
                'key' => 'lecturer',
                'name' => 'Lecturer',
                'scope_type' => 'department',
                'stream' => 'both',
                'is_singleton' => false,
            ],
            [
                'key' => 'demonstrator',
                'name' => 'Demonstrator',
                'scope_type' => 'department',
                'stream' => 'both',
                'is_singleton' => false,
            ],
            [
                'key' => 'workshop_instructor',
                'name' => 'Workshop Instructor',
                'scope_type' => 'department',
                'stream' => 'both',
                'is_singleton' => false,
            ],
            [
                'key' => 'trade_instructor',
                'name' => 'Trade Instructor',
                'scope_type' => 'department',
                'stream' => 'both',
                'is_singleton' => false,
            ],
            [
                'key' => 'tradesman',
                'name' => 'Tradesman',
                'scope_type' => 'department',
                'stream' => 'both',
                'is_singleton' => false,
            ],
            [
                'key' => 'laboratory_assistant',
                'name' => 'Laboratory Assistant',
                'scope_type' => 'department',
                'stream' => 'both',
                'is_singleton' => false,
            ],
            [
                'key' => 'physical_instructor',
                'name' => 'Physical Instructor',
                'scope_type' => 'stream',
                'stream' => 'both',
                'is_singleton' => false,
            ],
            [
                'key' => 'student',
                'name' => 'Student',
                'scope_type' => 'own',
                'stream' => 'both',
                'is_singleton' => false,
            ],
            [
                'key' => 'parent',
                'name' => 'Parent / Guardian',
                'scope_type' => 'own',
                'stream' => 'both',
                'is_singleton' => false,
            ],
        ];

        foreach ($roles as $roleData) {
            Role::updateOrCreate(
                ['key' => $roleData['key']],
                [
                    'name' => $roleData['name'],
                    'scope_type' => $roleData['scope_type'],
                    'stream' => $roleData['stream'],
                    'is_singleton' => $roleData['is_singleton'],
                    'is_active' => true,
                ]
            );
        }

        // 2. Seed Delegation Rules (docs/role_and_permission_spec.md §4)
        $rules = [
            // Super Admin
            ['super_admin', 'principal', 'institution', false],
            ['super_admin', 'admin', 'institution', false],
            ['super_admin', 'sf_office', 'institution', false],
            ['super_admin', 'lecturer', 'institution', false],
            ['super_admin', 'demonstrator', 'institution', false],
            ['super_admin', 'workshop_instructor', 'institution', false],
            ['super_admin', 'trade_instructor', 'institution', false],
            ['super_admin', 'tradesman', 'institution', false],
            ['super_admin', 'laboratory_assistant', 'institution', false],
            ['super_admin', 'physical_instructor', 'institution', false],
            ['super_admin', 'student', 'institution', false],
            ['super_admin', 'parent', 'institution', false],
            ['super_admin', 'hod', 'institution', true],
            ['super_admin', 'gen_dept_coordinator', 'institution', true],
            ['super_admin', 'academic_coordinator', 'institution', true],
            ['super_admin', 'workshop_superintendent', 'institution', true],

            // Principal
            ['principal', 'hod', 'institution', false],
            ['principal', 'gen_dept_coordinator', 'institution', false],
            ['principal', 'academic_coordinator', 'institution', false],
            ['principal', 'workshop_superintendent', 'institution', false],
            ['principal', 'sf_office', 'institution', false],
            ['principal', 'admin', 'institution', false],
            ['principal', 'lecturer', 'institution', false],
            ['principal', 'demonstrator', 'institution', false],
            ['principal', 'workshop_instructor', 'institution', false],
            ['principal', 'trade_instructor', 'institution', false],
            ['principal', 'tradesman', 'institution', false],
            ['principal', 'laboratory_assistant', 'institution', false],
            ['principal', 'physical_instructor', 'institution', false],
            ['principal', 'student', 'institution', false],
            ['principal', 'parent', 'institution', false],

            // Office Admin
            ['admin', 'lecturer', 'institution', false],
            ['admin', 'demonstrator', 'institution', false],
            ['admin', 'workshop_instructor', 'institution', false],
            ['admin', 'trade_instructor', 'institution', false],
            ['admin', 'tradesman', 'institution', false],
            ['admin', 'laboratory_assistant', 'institution', false],
            ['admin', 'physical_instructor', 'institution', false],
            ['admin', 'student', 'institution', false],
            ['admin', 'parent', 'institution', false],

            // Academic Coordinator (SF)
            ['academic_coordinator', 'lecturer', 'stream', false],
            ['academic_coordinator', 'demonstrator', 'stream', false],
            ['academic_coordinator', 'student', 'stream', false],

            // HOD
            ['hod', 'lecturer', 'department', false],
            ['hod', 'demonstrator', 'department', false],
            ['hod', 'workshop_instructor', 'department', false],
            ['hod', 'trade_instructor', 'department', false],
            ['hod', 'tradesman', 'department', false],
            ['hod', 'laboratory_assistant', 'department', false],
            ['hod', 'physical_instructor', 'department', false],
            ['hod', 'student', 'department', false],
            ['hod', 'tutor', 'managing_department', false],
            ['hod', 'mentor', 'managing_department', false],
            ['hod', 'course_teacher', 'managing_department', false],

            // General Dept Coordinator
            ['gen_dept_coordinator', 'tutor', 'managing_department', false],
            ['gen_dept_coordinator', 'mentor', 'managing_department', false],
            ['gen_dept_coordinator', 'course_teacher', 'managing_department', false],

            // Workshop Superintendent
            ['workshop_superintendent', 'workshop_instructor', 'workshop_section', false],
            ['workshop_superintendent', 'trade_instructor', 'workshop_section', false],
            ['workshop_superintendent', 'tradesman', 'workshop_section', false],
            ['workshop_superintendent', 'demonstrator', 'workshop_section', false],
            ['workshop_superintendent', 'laboratory_assistant', 'workshop_section', false],

            // Tutor
            ['tutor', 'mentor', 'batch', false],
        ];

        foreach ($rules as [$assigner, $assignee, $scopeConstraint, $requiresOrder]) {
            DelegationRule::updateOrCreate(
                [
                    'assigner_role_key' => $assigner,
                    'assignee_role_key' => $assignee,
                ],
                [
                    'scope_constraint' => $scopeConstraint,
                    'requires_order_record' => $requiresOrder,
                ]
            );
        }
    }
}


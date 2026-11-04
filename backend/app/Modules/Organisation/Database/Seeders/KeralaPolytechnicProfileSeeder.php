<?php

declare(strict_types=1);

namespace App\Modules\Organisation\Database\Seeders;

use App\Modules\Organisation\Models\AcademicYear;
use App\Modules\Organisation\Models\Department;
use App\Modules\Organisation\Models\DepartmentSemesterGovernance;
use App\Modules\Organisation\Models\Institution;
use App\Modules\Organisation\Models\Program;
use App\Modules\Organisation\Models\Regulation;
use App\Modules\Organisation\Models\Stream;
use Carbon\Carbon;
use Illuminate\Database\Seeder;

class KeralaPolytechnicProfileSeeder extends Seeder
{
    public function run(): void
    {
        // 1. Ensure baseline RBAC & workshop seeds are present
        $this->call(TenantBaselineSeeder::class);

        // 2. Streams (Kerala Polytechnic Model: Aided vs Self-Financing vs Shared)
        $streams = [
            [
                'code' => 'AIDED',
                'name' => 'Govt-Aided Management',
                'scope_label' => 's_aided',
            ],
            [
                'code' => 'SF',
                'name' => 'Self-Financing Management',
                'scope_label' => 's_sf',
            ],
            [
                'code' => 'SHARED',
                'name' => 'Shared / Administration',
                'scope_label' => 's_shared',
            ],
        ];

        foreach ($streams as $stream) {
            Stream::updateOrCreate(
                ['code' => $stream['code']],
                [
                    'name' => $stream['name'],
                    'scope_label' => $stream['scope_label'],
                ]
            );
        }

        // 3. Kerala SBTE Curriculum Regulations (ADR-0006)
        $regulations = [
            [
                'code' => 'REV2021',
                'name' => 'Revision 2021',
                'effective_from_year' => 2021,
                'config_json' => [
                    'active' => true,
                    'max_theory_ese' => 75,
                    'min_theory_cia' => 20,
                ],
            ],
            [
                'code' => 'REV2026',
                'name' => 'Revision 2026',
                'effective_from_year' => 2026,
                'config_json' => [
                    'active' => true,
                    'max_theory_ese' => 60,
                    'min_theory_cia' => 16,
                ],
            ],
        ];

        foreach ($regulations as $reg) {
            Regulation::updateOrCreate(
                ['code' => $reg['code']],
                [
                    'name' => $reg['name'],
                    'effective_from_year' => $reg['effective_from_year'],
                    'config_json' => $reg['config_json'],
                ]
            );
        }

        /** @var Stream $aidedStream */
        $aidedStream = Stream::where('code', 'AIDED')->firstOrFail();
        /** @var Stream $sfStream */
        $sfStream = Stream::where('code', 'SF')->firstOrFail();
        /** @var Stream $sharedStream */
        $sharedStream = Stream::where('code', 'SHARED')->firstOrFail();

        // 4. Institution (Carmel Polytechnic College)
        Institution::updateOrCreate(
            ['code' => 'CARMEL'],
            [
                'name' => 'Carmel Polytechnic College',
                'scope_label' => 'i_carmel',
            ]
        );

        // 5. Departments
        $departments = [
            // Aided Academic Branches
            [
                'code' => 'CE',
                'name' => 'Civil Engineering',
                'stream_id' => $aidedStream->id,
                'kind' => 'academic',
                'scope_label' => 'd_ce',
            ],
            [
                'code' => 'ME',
                'name' => 'Mechanical Engineering',
                'stream_id' => $aidedStream->id,
                'kind' => 'academic',
                'scope_label' => 'd_me',
            ],
            [
                'code' => 'EEE',
                'name' => 'Electrical & Electronics Engineering',
                'stream_id' => $aidedStream->id,
                'kind' => 'academic',
                'scope_label' => 'd_eee',
            ],
            // Aided General Department (Governs S1 & S2 of CE, ME, EEE)
            [
                'code' => 'GEN_AIDED',
                'name' => 'General Department (Aided)',
                'stream_id' => $aidedStream->id,
                'kind' => 'general',
                'scope_label' => 'd_gen_aided',
            ],
            // Self-Financing Academic Branches
            [
                'code' => 'EL',
                'name' => 'Electronics Engineering',
                'stream_id' => $sfStream->id,
                'kind' => 'academic',
                'scope_label' => 'd_el',
            ],
            [
                'code' => 'CT',
                'name' => 'Computer Engineering',
                'stream_id' => $sfStream->id,
                'kind' => 'academic',
                'scope_label' => 'd_ct',
            ],
            [
                'code' => 'AU',
                'name' => 'Automobile Engineering',
                'stream_id' => $sfStream->id,
                'kind' => 'academic',
                'scope_label' => 'd_au',
            ],
            // Self-Financing General Department (Governs S1 & S2 of EL, CT, AU)
            [
                'code' => 'GEN_SF',
                'name' => 'General Department (Self-Financing)',
                'stream_id' => $sfStream->id,
                'kind' => 'general',
                'scope_label' => 'd_gen_sf',
            ],
            // College Administration
            [
                'code' => 'ADM',
                'name' => 'College Administration',
                'stream_id' => $sharedStream->id,
                'kind' => 'administrative',
                'scope_label' => 'd_adm',
            ],
        ];

        $deptMap = [];
        foreach ($departments as $dept) {
            $record = Department::updateOrCreate(
                ['code' => $dept['code'], 'stream_id' => $dept['stream_id']],
                [
                    'name' => $dept['name'],
                    'kind' => $dept['kind'],
                    'is_active' => true,
                    'scope_label' => $dept['scope_label'],
                ]
            );
            $deptMap[$dept['code']] = $record;
        }

        // 6. Department Semester Governance (ADR-0005)
        // Aided engineering S1/S2 governed by GEN_AIDED
        foreach (['CE', 'ME', 'EEE'] as $code) {
            DepartmentSemesterGovernance::updateOrCreate(
                [
                    'home_department_id' => $deptMap[$code]->id,
                    'semester_from' => 1,
                    'semester_to' => 2,
                ],
                [
                    'managing_department_id' => $deptMap['GEN_AIDED']->id,
                ]
            );
        }

        // SF engineering S1/S2 governed by GEN_SF
        foreach (['EL', 'CT', 'AU'] as $code) {
            DepartmentSemesterGovernance::updateOrCreate(
                [
                    'home_department_id' => $deptMap[$code]->id,
                    'semester_from' => 1,
                    'semester_to' => 2,
                ],
                [
                    'managing_department_id' => $deptMap['GEN_SF']->id,
                ]
            );
        }

        // 7. Programs
        $programs = [
            ['code' => 'DCE', 'name' => 'Diploma in Civil Engineering', 'dept' => 'CE', 'scope_label' => 'p_dce'],
            ['code' => 'DME', 'name' => 'Diploma in Mechanical Engineering', 'dept' => 'ME', 'scope_label' => 'p_dme'],
            ['code' => 'DEEE', 'name' => 'Diploma in Electrical & Electronics Engineering', 'dept' => 'EEE', 'scope_label' => 'p_deee'],
            ['code' => 'DEL', 'name' => 'Diploma in Electronics Engineering', 'dept' => 'EL', 'scope_label' => 'p_del'],
            ['code' => 'DCT', 'name' => 'Diploma in Computer Engineering', 'dept' => 'CT', 'scope_label' => 'p_dct'],
            ['code' => 'DAU', 'name' => 'Diploma in Automobile Engineering', 'dept' => 'AU', 'scope_label' => 'p_dau'],
        ];

        foreach ($programs as $prog) {
            Program::updateOrCreate(
                ['code' => $prog['code']],
                [
                    'department_id' => $deptMap[$prog['dept']]->id,
                    'name' => $prog['name'],
                    'duration_semesters' => 6,
                    'scope_label' => $prog['scope_label'],
                ]
            );
        }

        // 8. Academic Year
        AcademicYear::updateOrCreate(
            ['label' => '2026-27'],
            [
                'start_date' => Carbon::parse('2026-06-01'),
                'end_date' => Carbon::parse('2027-05-31'),
                'is_current' => true,
            ]
        );
    }
}

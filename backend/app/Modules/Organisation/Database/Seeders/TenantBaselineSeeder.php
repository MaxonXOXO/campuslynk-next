<?php

declare(strict_types=1);

namespace App\Modules\Organisation\Database\Seeders;

use App\Modules\Organisation\Models\Regulation;
use App\Modules\Organisation\Models\Stream;
use App\Modules\Organisation\Models\WorkshopSection;
use Illuminate\Database\Seeder;

class TenantBaselineSeeder extends Seeder
{
    public function run(): void
    {
        // 1. Streams
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

        // 2. Regulations
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

        // 3. Central Workshop Trade Sections
        $sections = [
            ['code' => 'fitting', 'name' => 'Fitting Section', 'scope_label' => 'ws_fitting'],
            ['code' => 'smithy', 'name' => 'Smithy Section', 'scope_label' => 'ws_smithy'],
            ['code' => 'welding', 'name' => 'Welding Section', 'scope_label' => 'ws_welding'],
            ['code' => 'machine_shop', 'name' => 'Machine Shop Section', 'scope_label' => 'ws_machine_shop'],
            ['code' => 'sheet_metal', 'name' => 'Sheet Metal Section', 'scope_label' => 'ws_sheet_metal'],
            ['code' => 'foundry', 'name' => 'Foundry Section', 'scope_label' => 'ws_foundry'],
        ];

        foreach ($sections as $section) {
            WorkshopSection::updateOrCreate(
                ['code' => $section['code']],
                [
                    'name' => $section['name'],
                    'scope_label' => $section['scope_label'],
                ]
            );
        }
    }
}


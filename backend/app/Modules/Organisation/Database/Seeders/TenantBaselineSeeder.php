<?php

declare(strict_types=1);

namespace App\Modules\Organisation\Database\Seeders;

use App\Modules\Identity\Commands\PermissionsSyncCommand;
use App\Modules\Identity\Database\Seeders\RbacBaselineSeeder;
use App\Modules\Organisation\Models\WorkshopSection;
use Illuminate\Database\Seeder;

class TenantBaselineSeeder extends Seeder
{
    public function run(): void
    {
        // 0. RBAC Roles, Permissions, and Delegation Rules
        $this->call(RbacBaselineSeeder::class);
        app(PermissionsSyncCommand::class)->syncCurrentTenant();

        // 1. Central Workshop Trade Sections
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

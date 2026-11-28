<?php

declare(strict_types=1);

namespace Tests\Feature\Organisation;

use App\Core\Tenancy\Services\TenantProvisioner;
use App\Core\Tenancy\TenantContext;
use App\Modules\Identity\Models\Role;
use App\Modules\Identity\Models\RoleAssignment;
use App\Modules\Identity\Models\User;
use App\Modules\Organisation\Actions\CreateBatchAction;
use App\Modules\Organisation\Database\Seeders\KeralaPolytechnicProfileSeeder;
use App\Modules\Organisation\Events\GovernanceRuleUpdated;
use App\Modules\Organisation\Models\AcademicYear;
use App\Modules\Organisation\Models\Batch;
use App\Modules\Organisation\Models\Department;
use App\Modules\Organisation\Models\DepartmentSemesterGovernance;
use App\Modules\Organisation\Models\Program;
use App\Modules\Organisation\Models\Regulation;
use App\Modules\Organisation\Models\SubBatch;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Hash;
use Tests\Feature\Tenancy\TenancyTestHelper;

uses(TenancyTestHelper::class);

beforeEach(function () {
    $this->purgeAllTenantDatabases();
    $this->provisioner = app(TenantProvisioner::class);
    $this->tenantContext = app(TenantContext::class);
});

afterEach(function () {
    $this->purgeAllTenantDatabases();
});

it('recomputes managing_department_id and managing_path on active batch and sub-batch and dispatches GovernanceRuleUpdated when updating an S1/S2 governance rule', function () {
    config(['app_profile.deploy_profile' => 'cloud']);

    $tenant = $this->provisioner->provision('tenant_gov_rule', 'Gov Rule Poly', 'govrule.test', 'cloud');
    $this->tenantContext->setTenant($tenant);

    try {
        app(KeralaPolytechnicProfileSeeder::class)->run();

        $principal = User::create([
            'type' => 'staff',
            'name' => 'Principal User',
            'email' => 'principal@govrule.test',
            'password' => Hash::make('Password123!'),
            'status' => 'active',
            'must_change_password' => false,
        ]);

        $principalRole = Role::where('key', 'principal')->firstOrFail();
        RoleAssignment::create([
            'user_id' => $principal->id,
            'role_id' => $principalRole->id,
            'scope_type' => 'institution',
            'scope_label' => 'institution',
            'is_active' => true,
            'valid_from' => now()->subDay(),
        ]);

        $token = $principal->createToken('web')->plainTextToken;

        $ceDept = Department::where('code', 'CE')->firstOrFail();
        $genDept = Department::where('code', 'GEN')->firstOrFail();
        $ceProgram = Program::where('department_id', $ceDept->id)->firstOrFail();
        $academicYear = AcademicYear::firstOrFail();
        $regulation = Regulation::firstOrFail();

        /** @var Batch $batch */
        $batch = app(CreateBatchAction::class)->execute([
            'program_id' => $ceProgram->id,
            'academic_year_id' => $academicYear->id,
            'regulation_id' => $regulation->id,
            'name' => '2026 CE Batch',
            'intake_year' => 2026,
            'current_semester' => 1,
        ]);

        /** @var SubBatch $subBatch */
        $subBatch = SubBatch::create([
            'batch_id' => $batch->id,
            'kind' => 'lab_group',
            'name' => 'Group A',
            'scope_label' => 'group_a',
            'home_path' => $batch->home_path.'.group_a',
            'managing_path' => $batch->managing_path.'.group_a',
        ]);

        expect($batch->managing_department_id)->toBe($genDept->id);
        expect($batch->managing_path)->toContain('.dept_gen.');
        expect($subBatch->managing_path)->toContain('.dept_gen.');

        /** @var DepartmentSemesterGovernance $rule */
        $rule = DepartmentSemesterGovernance::where('home_department_id', $ceDept->id)
            ->where('semester_from', 1)
            ->where('semester_to', 2)
            ->firstOrFail();

        Event::fake([GovernanceRuleUpdated::class]);

        $response = $this->withHeaders([
            'Authorization' => "Bearer {$token}",
            'X-Tenant' => 'tenant_gov_rule',
        ])->putJson("http://govrule.test/api/v1/governance-rules/{$rule->id}", [
            'managing_department_id' => $ceDept->id,
        ]);

        $response->assertOk()
            ->assertJsonPath('data.managing_department_id', $ceDept->id);

        $this->tenantContext->setTenant($tenant);
        $batch->refresh();
        $subBatch->refresh();

        expect($batch->managing_department_id)->toBe($ceDept->id);
        expect($batch->managing_path)->toContain('.dept_ce.');
        expect($subBatch->managing_path)->toContain('.dept_ce.');

        Event::assertDispatched(GovernanceRuleUpdated::class, function (GovernanceRuleUpdated $event) use ($rule, $ceDept): bool {
            return $event->rule->id === $rule->id
                && $event->rule->managing_department_id === $ceDept->id;
        });
    } finally {
        $this->tenantContext->forget();
    }
});

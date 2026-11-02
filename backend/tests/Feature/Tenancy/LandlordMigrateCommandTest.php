<?php

declare(strict_types=1);

namespace Tests\Feature\Tenancy;

use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schema;

uses(TenancyTestHelper::class);

it('executes landlord:migrate successfully', function () {
    $exitCode = Artisan::call('landlord:migrate');

    expect($exitCode)->toBe(0);
    expect(Schema::connection('landlord')->hasTable('tenants'))->toBeTrue();
    expect(Schema::connection('landlord')->hasTable('domains'))->toBeTrue();
    expect(Schema::connection('landlord')->hasTable('tenant_databases'))->toBeTrue();
    expect(Schema::connection('landlord')->hasTable('licenses'))->toBeTrue();
    expect(Schema::connection('landlord')->hasTable('schema_versions'))->toBeTrue();
});

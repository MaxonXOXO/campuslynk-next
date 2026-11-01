<?php

declare(strict_types=1);

use App\Core\Tenancy\Concerns\UsesTenantConnection;
use App\Core\Tenancy\Models\LandlordModel;
use App\Core\Tenancy\Models\TenantSetting;

arch('landlord connection is only queried within Core/Tenancy and Modules/Platform')
    ->expect(['landlord', 'pgsql_admin'])
    ->toOnlyBeUsedIn([
        'App\Core\Tenancy',
        'App\Modules\Platform',
        'Database\Migrations\landlord',
        'Tests',
    ]);

arch('all models explicitly specify connection via LandlordModel or UsesTenantConnection')
    ->expect('App\Core\Tenancy\Models')
    ->classes()
    ->toExtend(LandlordModel::class)
    ->ignoring([
        LandlordModel::class,
        TenantSetting::class,
    ]);

arch('TenantSetting model uses UsesTenantConnection trait')
    ->expect(TenantSetting::class)
    ->toUse(UsesTenantConnection::class);

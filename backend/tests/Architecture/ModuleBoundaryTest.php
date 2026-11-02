<?php

declare(strict_types=1);

arch('other modules do not directly access Identity models')
    ->expect('App\Modules\Identity\Models')
    ->toOnlyBeUsedIn([
        'App\Modules\Identity',
        'App\Core\Tenancy',
        'App\Providers',
        'Database\Migrations',
        'Database\Seeders',
    ]);

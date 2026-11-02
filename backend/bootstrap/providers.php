<?php

use App\Core\Tenancy\TenancyServiceProvider;
use App\Modules\Identity\IdentityModule;
use App\Providers\AppServiceProvider;

return [
    AppServiceProvider::class,
    TenancyServiceProvider::class,
    IdentityModule::class,
];

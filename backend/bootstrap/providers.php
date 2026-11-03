<?php

use App\Core\Modules\ModulesServiceProvider;
use App\Core\Tenancy\TenancyServiceProvider;
use App\Modules\Identity\IdentityModule;
use App\Modules\Organisation\OrganisationModule;
use App\Providers\AppServiceProvider;

return [
    AppServiceProvider::class,
    TenancyServiceProvider::class,
    ModulesServiceProvider::class,
    IdentityModule::class,
    OrganisationModule::class,
];

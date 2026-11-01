<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Deployment Profile
    |--------------------------------------------------------------------------
    |
    | Academic Suite supports two deployment profiles:
    | - 'onprem': Single-college on-premises appliance (e.g. Carmel Polytechnic)
    | - 'cloud': Multi-tenant cloud SaaS deployment
    |
    */
    'deploy_profile' => env('DEPLOY_PROFILE'),
];

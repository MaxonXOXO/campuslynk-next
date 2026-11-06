<?php

declare(strict_types=1);

return [
    'default_domain' => env('INSTITUTION_DOMAIN', null),
    'db_prefix' => env('TENANT_DB_PREFIX', 'tenant_'),
    'license_default_days' => (int) env('LICENSE_DEFAULT_DAYS', 365),
    'license_grace_days' => (int) env('LICENSE_GRACE_DAYS', 30),
    'defaults' => [
        'license' => [
            'plan' => env('DEFAULT_LICENSE_PLAN', 'standard'),
            'valid_for_days' => (int) env('LICENSE_DEFAULT_DAYS', env('DEFAULT_LICENSE_DAYS', 365)),
            'modules' => [
                'identity',
                'attendance',
                'assessment',
                'office',
            ],
        ],
    ],
    'cache' => [
        'resolver_ttl_seconds' => (int) env('TENANT_RESOLVER_TTL', 300),
    ],
];

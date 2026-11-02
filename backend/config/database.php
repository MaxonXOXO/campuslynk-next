<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Default Database Connection Name
    |--------------------------------------------------------------------------
    |
    | Here you may specify which of the database connections below you wish
    | to use as your default connection for database operations.
    |
    */

    'default' => env('DB_CONNECTION', 'unconfigured'),

    /*
    |--------------------------------------------------------------------------
    | Database Connections
    |--------------------------------------------------------------------------
    |
    | Academic Suite uses PostgreSQL exclusively (ADR-0001, ADR-0010).
    | Explicit connections:
    | - 'unconfigured': Default placeholder that throws if queried without context.
    | - 'landlord': Central landlord database containing institutions and domains.
    | - 'tenant': Dynamic runtime connection configured per-request from tenant_databases.
    | - 'pgsql_admin': Privileged direct connection for provisioning DDL in app/Core/Tenancy.
    |
    */

    'connections' => [

        'unconfigured' => [
            'driver' => 'pgsql',
            'host' => 'unconfigured_host',
            'port' => 5432,
            'database' => 'unconfigured_db',
            'username' => 'unconfigured_user',
            'password' => '',
            'charset' => 'utf8',
            'prefix' => '',
            'prefix_indexes' => true,
            'search_path' => 'public',
            'sslmode' => 'prefer',
        ],

        'landlord' => [
            'driver' => 'pgsql',
            'url' => env('LANDLORD_DB_URL'),
            'host' => env('LANDLORD_DB_HOST', env('DB_HOST', '127.0.0.1')),
            'port' => (int) env('LANDLORD_DB_PORT', env('DB_PORT', '6432')),
            'database' => env('LANDLORD_DB_DATABASE', 'landlord'),
            'username' => env('LANDLORD_DB_USERNAME', 'landlord_app'),
            'password' => env('LANDLORD_DB_PASSWORD', env('DB_PASSWORD', 'secret')),
            'charset' => env('DB_CHARSET', 'utf8'),
            'prefix' => '',
            'prefix_indexes' => true,
            'search_path' => 'public',
            'sslmode' => env('DB_SSLMODE', 'prefer'),
            'options' => extension_loaded('pdo_pgsql') ? [
                PDO::ATTR_EMULATE_PREPARES => true,
            ] : [],
        ],

        'tenant' => [
            'driver' => 'pgsql',
            'host' => env('TENANT_DB_HOST', env('LANDLORD_DB_HOST', '127.0.0.1')),
            'port' => (int) env('TENANT_DB_PORT', env('LANDLORD_DB_PORT', 6432)),
            'database' => env('TENANT_DB_DATABASE', 'unconfigured_tenant'),
            'username' => env('TENANT_DB_USERNAME', 'unconfigured_user'),
            'password' => env('TENANT_DB_PASSWORD', ''),
            'charset' => env('DB_CHARSET', 'utf8'),
            'prefix' => '',
            'prefix_indexes' => true,
            'search_path' => 'public',
            'sslmode' => env('DB_SSLMODE', 'prefer'),
            'options' => extension_loaded('pdo_pgsql') ? [
                PDO::ATTR_EMULATE_PREPARES => true,
            ] : [],
        ],

        'pgsql_admin' => [
            'driver' => 'pgsql',
            'url' => env('ADMIN_DB_URL'),
            'host' => env('ADMIN_DB_HOST', env('DB_HOST', '127.0.0.1')),
            'port' => (int) env('ADMIN_DB_PORT', 5432),
            'database' => env('ADMIN_DB_DATABASE', 'landlord'),
            'username' => env('ADMIN_DB_USERNAME', 'provisioner'),
            'password' => env('ADMIN_DB_PASSWORD', env('DB_PASSWORD', 'secret')),
            'charset' => env('DB_CHARSET', 'utf8'),
            'prefix' => '',
            'prefix_indexes' => true,
            'search_path' => 'public',
            'sslmode' => env('DB_SSLMODE', 'prefer'),
        ],

    ],

    /*
    |--------------------------------------------------------------------------
    | Migration Repository Table
    |--------------------------------------------------------------------------
    |
    | This table keeps track of all the migrations that have already run for
    | your application. Using this information, we can determine which of
    | the migrations on disk haven't actually been run on the database.
    |
    */

    'migrations' => [
        'table' => 'migrations',
        'update_date_on_publish' => true,
    ],

    /*
    |--------------------------------------------------------------------------
    | Redis Databases
    |--------------------------------------------------------------------------
    |
    | Redis is an open source, fast, and advanced key-value store that also
    | provides a richer body of commands than a typical key-value system.
    |
    */

    'redis' => [

        'client' => env('REDIS_CLIENT', 'phpredis'),

        'options' => [
            'cluster' => env('REDIS_CLUSTER', 'redis'),
            'prefix' => env('REDIS_PREFIX', 'academic_suite_database_'),
        ],

        'default' => [
            'url' => env('REDIS_URL'),
            'host' => env('REDIS_HOST', '127.0.0.1'),
            'username' => env('REDIS_USERNAME'),
            'password' => env('REDIS_PASSWORD'),
            'port' => env('REDIS_PORT', '6379'),
            'database' => env('REDIS_DB', '0'),
        ],

        'cache' => [
            'url' => env('REDIS_URL'),
            'host' => env('REDIS_HOST', '127.0.0.1'),
            'username' => env('REDIS_USERNAME'),
            'password' => env('REDIS_PASSWORD'),
            'port' => env('REDIS_PORT', '6379'),
            'database' => env('REDIS_CACHE_DB', '1'),
        ],

    ],

];

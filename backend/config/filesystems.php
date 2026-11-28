<?php

$filesDriver = env('FILES_DRIVER', 'local');

$makeDisk = static function (string $scope, string $localRoot, string $visibility) use ($filesDriver): array {
    if ($filesDriver === 's3') {
        return [
            'driver' => 's3',
            'key' => env('FILES_S3_KEY', env('AWS_ACCESS_KEY_ID')),
            'secret' => env('FILES_S3_SECRET', env('AWS_SECRET_ACCESS_KEY')),
            'region' => env('FILES_S3_REGION', env('AWS_DEFAULT_REGION', 'us-east-1')),
            'bucket' => env('FILES_S3_BUCKET', env('AWS_BUCKET')),
            'url' => env('FILES_S3_URL', env('AWS_URL')),
            'endpoint' => env('FILES_S3_ENDPOINT', env('AWS_ENDPOINT')),
            'use_path_style_endpoint' => (bool) env('FILES_S3_USE_PATH_STYLE_ENDPOINT', env('AWS_USE_PATH_STYLE_ENDPOINT', false)),
            'root' => $scope,
            'visibility' => $visibility,
            'throw' => true,
            'report' => false,
        ];
    }

    return [
        'driver' => 'local',
        'root' => $localRoot,
        'visibility' => $visibility,
        'serve' => false,
        'throw' => true,
        'report' => false,
    ];
};

return [

    /*
    |--------------------------------------------------------------------------
    | Default Filesystem Disk
    |--------------------------------------------------------------------------
    |
    | Here you may specify the default filesystem disk that should be used
    | by the framework. The "local" disk, as well as a variety of cloud
    | based disks are available to your application for file storage.
    |
    */

    'default' => env('FILESYSTEM_DISK', 'local'),

    /*
    |--------------------------------------------------------------------------
    | Filesystem Disks
    |--------------------------------------------------------------------------
    |
    | Below you may configure as many filesystem disks as necessary, and you
    | may even configure multiple disks for the same driver. Examples for
    | most supported storage drivers are configured here for reference.
    |
    | Supported drivers: "local", "ftp", "sftp", "s3"
    |
    */

    'disks' => [

        'local' => [
            'driver' => 'local',
            'root' => storage_path('app/private'),
            'serve' => false,
            'throw' => false,
            'report' => false,
        ],

        'public' => [
            'driver' => 'local',
            'root' => storage_path('app/public'),
            'url' => rtrim((string) env('APP_URL'), '/').'/storage',
            'visibility' => 'public',
            'throw' => false,
            'report' => false,
        ],

        's3' => [
            'driver' => 's3',
            'key' => env('AWS_ACCESS_KEY_ID'),
            'secret' => env('AWS_SECRET_ACCESS_KEY'),
            'region' => env('AWS_DEFAULT_REGION'),
            'bucket' => env('AWS_BUCKET'),
            'url' => env('AWS_URL'),
            'endpoint' => env('AWS_ENDPOINT'),
            'use_path_style_endpoint' => env('AWS_USE_PATH_STYLE_ENDPOINT', false),
            'throw' => false,
            'report' => false,
        ],

        'files_private' => $makeDisk(
            'private',
            (string) env('FILES_PRIVATE_ROOT', storage_path('app/files/private')),
            'private',
        ),

        'files_public' => $makeDisk(
            'public',
            (string) env('FILES_PUBLIC_ROOT', storage_path('app/files/public')),
            'public',
        ),

        'files_hot' => $makeDisk(
            'hot',
            (string) env('FILES_HOT_ROOT', storage_path('app/files/hot')),
            'private',
        ),

    ],

    /*
    |--------------------------------------------------------------------------
    | File Storage Policy & Serving (ADR-0018)
    |--------------------------------------------------------------------------
    */

    'storage' => [
        'driver' => $filesDriver,
        'serve_mode' => env('FILES_SERVE_MODE', 'stream'),
        'presigned_ttl_seconds' => (int) env('FILES_PRESIGNED_TTL_SECONDS', 60),
        'tenant_quota_bytes' => env('FILES_TENANT_QUOTA_BYTES') !== null && env('FILES_TENANT_QUOTA_BYTES') !== ''
            ? (int) env('FILES_TENANT_QUOTA_BYTES')
            : null,
        'category_max_bytes' => [
            'avatar' => 5 * 1024 * 1024,
            'logo' => 2 * 1024 * 1024,
            'import' => 25 * 1024 * 1024,
            'document' => 50 * 1024 * 1024,
        ],
        'sensitive_categories' => [
            'document',
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | Symbolic Links
    |--------------------------------------------------------------------------
    |
    | Here you may configure the symbolic links that will be created when the
    | `storage:link` Artisan command is executed. The array keys should be
    | the locations of the links and the values should be their targets.
    |
    */

    'links' => [
        public_path('storage') => storage_path('app/public'),
    ],

];

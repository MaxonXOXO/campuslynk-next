<?php

declare(strict_types=1);

return [

    /*
    |--------------------------------------------------------------------------
    | Default Hash Driver
    |--------------------------------------------------------------------------
    |
    | Academic Suite mandates Argon2id for all user password hashing (ADR-0003, ADR-0011).
    |
    */

    'driver' => 'argon2id',

    'argon' => [
        'memory' => 65536,
        'threads' => 1,
        'time' => 4,
        'verify' => true,
    ],

];

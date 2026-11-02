<?php

declare(strict_types=1);

namespace App\Modules\Identity\Contracts;

interface AuthenticatesUserContract
{
    /**
     * Authenticate user credentials and return Sanctum token string and abilities.
     *
     * @return array{
     *     token: string,
     *     token_type: string,
     *     expires_at: string,
     *     must_change_password: bool,
     *     user: object
     * }
     */
    public function execute(
        string $identifier,
        string $password,
        string $deviceName,
        string $client,
        string $ip
    ): array;
}

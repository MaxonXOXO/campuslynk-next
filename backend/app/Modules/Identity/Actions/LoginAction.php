<?php

declare(strict_types=1);

namespace App\Modules\Identity\Actions;

use App\Core\Tenancy\TenantContext;
use App\Modules\Identity\Contracts\AuthenticatesUserContract;
use App\Modules\Identity\Events\LoginFailed;
use App\Modules\Identity\Events\LoginSucceeded;
use App\Modules\Identity\Exceptions\AuthenticationException;
use App\Modules\Identity\Exceptions\LockoutException;
use App\Modules\Identity\Models\User;
use App\Modules\Identity\Models\UserIdentifier;
use App\Modules\Identity\Services\LoginRateLimiter;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Hash;

final class LoginAction implements AuthenticatesUserContract
{
    /**
     * Dummy Argon2id hash for constant-time verification when identifier does not exist.
     */
    protected const DUMMY_HASH = '$argon2id$v=19$m=65536,t=4,p=1$bW9ja3NhbHQxMjM0NTY3OA$s5H8wQkP2aJ7vB4eN9rL1tX3zC6uI8mO5yV0pT2rE4w';

    public function __construct(
        protected TenantContext $tenantContext,
        protected LoginRateLimiter $rateLimiter
    ) {}

    /**
     * Authenticate a user by identifier and password.
     *
     * @return array{
     *     token: string,
     *     token_type: string,
     *     expires_at: string,
     *     must_change_password: bool,
     *     user: User
     * }
     *
     * @throws AuthenticationException
     * @throws LockoutException
     */
    public function execute(
        string $identifier,
        string $password,
        string $deviceName,
        string $client,
        string $ip
    ): array {
        $tenant = $this->tenantContext->tenant();
        $trimmedIdentifier = trim($identifier);

        // 1. Check rate limiting per tenant + identifier + IP
        if ($this->rateLimiter->tooManyAttempts($tenant->id, $trimmedIdentifier, $ip)) {
            $seconds = $this->rateLimiter->availableIn($tenant->id, $trimmedIdentifier, $ip);

            throw new LockoutException($seconds);
        }

        // 2. Query user following strict precedence (ADR-0011, Prompt 04b):
        //    (1) contains '@' -> email
        //    (2) normalizes to valid E.164 mobile -> mobile
        //    (3) otherwise -> registration number
        /** @var User|null $user */
        $user = $this->resolveUser($trimmedIdentifier);

        // 3. Constant-time Argon2id password verification
        $passwordValid = false;
        if ($user !== null) {
            $passwordValid = Hash::check($password, $user->password);
        } else {
            Hash::check($password, self::DUMMY_HASH);
        }

        // 4. Validate credentials and account status (inactive accounts get the identical generic error)
        if ($user === null || ! $passwordValid || ! $user->isActive()) {
            $this->rateLimiter->hit($tenant->id, $trimmedIdentifier, $ip);

            LoginFailed::dispatch(
                LoginFailed::maskIdentifier($trimmedIdentifier),
                $ip,
                $user === null ? 'unknown_user' : (! $passwordValid ? 'wrong_password' : 'inactive_status'),
                $tenant->slug
            );

            throw new AuthenticationException('Invalid credentials provided.');
        }

        // 5. Successful login: clear throttle attempts
        $this->rateLimiter->clear($tenant->id, $trimmedIdentifier, $ip);

        // 6. Token lifetime per client type (ADR-0011)
        $expiresAt = $client === 'mobile'
            ? Carbon::now()->addDays(30)
            : Carbon::now()->addHours(12);

        // 7. Token abilities: if must_change_password is true, restrict to password:change and auth:logout
        $abilities = $user->must_change_password
            ? ['password:change', 'auth:logout']
            : ['*'];

        $newAccessToken = $user->createToken($deviceName, $abilities, $expiresAt);

        // 8. Update last login timestamp
        $user->forceFill(['last_login_at' => Carbon::now()])->save();

        LoginSucceeded::dispatch($user, $client, $ip, $tenant->slug);

        return [
            'token' => $newAccessToken->plainTextToken,
            'token_type' => 'Bearer',
            'expires_at' => $expiresAt->toIso8601String(),
            'must_change_password' => $user->must_change_password,
            'user' => $user,
        ];
    }

    /**
     * Resolve user from the unified user_identifiers table without guessing.
     */
    protected function resolveUser(string $identifier): ?User
    {
        $normalised = UserIdentifier::normalise($identifier);

        /** @var UserIdentifier|null $record */
        $record = UserIdentifier::with('user')
            ->where('value_normalised', $normalised)
            ->first();

        return $record?->user;
    }
}

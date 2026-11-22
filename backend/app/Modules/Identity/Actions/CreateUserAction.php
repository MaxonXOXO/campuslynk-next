<?php

declare(strict_types=1);

namespace App\Modules\Identity\Actions;

use App\Modules\Identity\Contracts\IssuesTemporaryPasswordContract;
use App\Modules\Identity\Models\User;
use App\Modules\Identity\Services\CreatedUserResult;
use Illuminate\Support\Facades\Hash;

final class CreateUserAction
{
    public function __construct(
        protected IssuesTemporaryPasswordContract $temporaryPasswordIssuer
    ) {}

    /**
     * @param array{
     *     type: string,
     *     name: string,
     *     email?: string|null,
     *     mobile?: string|null,
     *     registration_number?: string|null,
     *     password?: string|null
     * } $attributes
     */
    public function execute(User $creator, array $attributes): CreatedUserResult
    {
        $explicitPassword = isset($attributes['password']) && trim((string) $attributes['password']) !== ''
            ? (string) $attributes['password']
            : null;

        $wasGenerated = $explicitPassword === null;
        $plainPassword = $wasGenerated
            ? $this->temporaryPasswordIssuer->generatePassword()
            : $explicitPassword;
        $expiresAt = $this->temporaryPasswordIssuer->resolveExpiresAt();

        /** @var User $user */
        $user = User::create([
            'type' => (string) $attributes['type'],
            'name' => (string) $attributes['name'],
            'email' => ! empty($attributes['email']) ? strtolower((string) $attributes['email']) : null,
            'mobile' => ! empty($attributes['mobile']) ? (string) $attributes['mobile'] : null,
            'registration_number' => ! empty($attributes['registration_number']) ? (string) $attributes['registration_number'] : null,
            'password' => Hash::make($plainPassword),
            'must_change_password' => true,
            'temporary_password_expires_at' => $expiresAt,
            'status' => 'active',
        ]);

        activity('identity')
            ->event('user.created')
            ->performedOn($user)
            ->causedBy($creator)
            ->withProperties([
                'target_user_id' => $user->id,
                'type' => $user->type,
                'temporary_password_generated' => $wasGenerated,
                'temporary_password_expires_at' => $expiresAt->toIso8601String(),
            ])
            ->log("Created user [{$user->name}] ({$user->type}).");

        return new CreatedUserResult(
            user: $user,
            temporaryPassword: $wasGenerated ? $plainPassword : null,
            temporaryPasswordExpiresAt: $expiresAt,
        );
    }
}

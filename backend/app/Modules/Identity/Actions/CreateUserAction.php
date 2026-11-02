<?php

declare(strict_types=1);

namespace App\Modules\Identity\Actions;

use App\Modules\Identity\Models\User;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class CreateUserAction
{
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
    public function execute(User $creator, array $attributes): User
    {
        $password = (string) ($attributes['password'] ?? Str::password(16));

        /** @var User $user */
        $user = User::create([
            'type' => (string) $attributes['type'],
            'name' => (string) $attributes['name'],
            'email' => ! empty($attributes['email']) ? strtolower((string) $attributes['email']) : null,
            'mobile' => ! empty($attributes['mobile']) ? (string) $attributes['mobile'] : null,
            'registration_number' => ! empty($attributes['registration_number']) ? (string) $attributes['registration_number'] : null,
            'password' => Hash::make($password),
            'must_change_password' => true,
            'status' => 'active',
        ]);

        activity('identity')
            ->performedOn($user)
            ->causedBy($creator)
            ->log("Created user [{$user->name}] ({$user->type}).");

        return $user;
    }
}


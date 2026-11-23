<?php

declare(strict_types=1);

namespace App\Modules\Identity\Actions;

use App\Core\Tenancy\TenantContext;
use App\Modules\Identity\Contracts\ChangesPasswordContract;
use App\Modules\Identity\Events\PasswordChanged;
use App\Modules\Identity\Exceptions\AuthenticationException;
use App\Modules\Identity\Models\PersonalAccessToken;
use App\Modules\Identity\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Hash;

final class ChangePasswordAction implements ChangesPasswordContract
{
    public function __construct(
        protected TenantContext $tenantContext
    ) {}

    /**
     * Change user password and revoke all other access tokens.
     *
     * @throws AuthenticationException
     */
    public function execute(
        User $user,
        string $currentPassword,
        string $newPassword,
        string $ip,
        ?PersonalAccessToken $currentToken = null
    ): void {
        // 1. Verify current password
        if (! Hash::check($currentPassword, $user->password)) {
            throw new AuthenticationException('Current password is incorrect.');
        }

        $wasFirstActivation = $user->must_change_password && $user->first_activated_at === null;

        // 2. Update password and clear must_change_password + temporary_password_expires_at
        $updates = [
            'password' => Hash::make($newPassword),
            'must_change_password' => false,
            'temporary_password_expires_at' => null,
        ];
        if ($wasFirstActivation) {
            $updates['first_activated_at'] = Carbon::now();
        }
        $user->forceFill($updates)->save();

        if ($wasFirstActivation) {
            activity('security')
                ->event('user.first_login_activated')
                ->performedOn($user)
                ->causedBy($user)
                ->withProperties([
                    'user_id' => $user->id,
                    'ip' => $ip,
                    'activated_at' => $user->first_activated_at?->toIso8601String(),
                ])
                ->log("User [{$user->name}] completed first-login password activation.");
        }

        // 3. Grant full abilities to current token and revoke all other tokens of this user (ADR-0011, B3, B4)
        if ($currentToken !== null) {
            $currentToken->forceFill(['abilities' => ['*']])->save();
            $user->tokens()->where('id', '!=', $currentToken->id)->delete();
        } else {
            $user->tokens()->delete();
        }

        PasswordChanged::dispatch($user, $ip, $this->tenantContext->tenant()->slug);
    }
}

<?php

declare(strict_types=1);

namespace App\Modules\Identity\Actions;

use App\Modules\Identity\Models\PersonalAccessToken;
use App\Modules\Identity\Models\User;
use App\Modules\Identity\Services\DeviceLabelResolver;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use InvalidArgumentException;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;

final class RevokeMySessionAction
{
    public function execute(User $user, string $sessionId, ?PersonalAccessToken $currentToken = null): void
    {
        /** @var PersonalAccessToken|null $token */
        $token = PersonalAccessToken::query()
            ->where('tokenable_type', $user->getMorphClass())
            ->where('tokenable_id', $user->id)
            ->where('id', $sessionId)
            ->first();

        if ($token === null) {
            throw (new ModelNotFoundException)->setModel(PersonalAccessToken::class, [$sessionId]);
        }

        if ($currentToken !== null && $token->id === $currentToken->id) {
            throw new InvalidArgumentException('Cannot revoke current session.');
        }

        if (DeviceLabelResolver::isSupportSession($token)) {
            throw new AccessDeniedHttpException('Support sessions cannot be revoked.');
        }

        $token->delete();

        activity('security')
            ->event('session.revoked')
            ->performedOn($user)
            ->causedBy($user)
            ->withProperties([
                'target_user_id' => $user->id,
                'revoked_token_id' => $sessionId,
            ])
            ->log("User [{$user->name}] revoked an active session.");
    }
}


<?php

declare(strict_types=1);

namespace App\Modules\Identity\Actions;

use App\Modules\Identity\Models\PersonalAccessToken;
use App\Modules\Identity\Models\User;
use App\Modules\Identity\Services\DeviceLabelResolver;

final class RevokeOtherSessionsAction
{
    public function execute(User $user, ?PersonalAccessToken $currentToken = null): int
    {
        $query = PersonalAccessToken::query()
            ->where('tokenable_type', $user->getMorphClass())
            ->where('tokenable_id', $user->id);

        if ($currentToken !== null) {
            $query->where('id', '!=', $currentToken->id);
        }

        $tokens = $query->get();

        $revokedCount = 0;

        foreach ($tokens as $token) {
            if (DeviceLabelResolver::isSupportSession($token)) {
                continue;
            }

            $token->delete();
            $revokedCount++;
        }

        activity('security')
            ->event('session.revoked_others')
            ->performedOn($user)
            ->causedBy($user)
            ->withProperties([
                'target_user_id' => $user->id,
                'revoked_count' => $revokedCount,
            ])
            ->log("User [{$user->name}] revoked {$revokedCount} other session(s).");

        return $revokedCount;
    }
}

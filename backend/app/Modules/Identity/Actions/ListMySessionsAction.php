<?php

declare(strict_types=1);

namespace App\Modules\Identity\Actions;

use App\Modules\Identity\Models\PersonalAccessToken;
use App\Modules\Identity\Models\User;
use App\Modules\Identity\Services\DeviceLabelResolver;
use Illuminate\Support\Carbon;

final class ListMySessionsAction
{
    /**
     * @return list<array{
     *     id: string,
     *     device_label: string,
     *     is_current: bool,
     *     is_support_session: bool,
     *     created_at: string|null,
     *     last_used_at: string|null,
     *     expires_at: string|null
     * }>
     */
    public function execute(User $user, ?PersonalAccessToken $currentToken = null): array
    {
        $now = Carbon::now();

        $tokens = PersonalAccessToken::query()
            ->where('tokenable_type', $user->getMorphClass())
            ->where('tokenable_id', $user->id)
            ->where(function ($query) use ($now): void {
                $query->whereNull('expires_at')->orWhere('expires_at', '>', $now);
            })
            ->orderByDesc('last_used_at')
            ->orderByDesc('created_at')
            ->get();

        return array_values($tokens->map(fn (PersonalAccessToken $token): array => [
            'id' => $token->id,
            'device_label' => DeviceLabelResolver::resolve($token),
            'is_current' => $currentToken !== null && $token->id === $currentToken->id,
            'is_support_session' => DeviceLabelResolver::isSupportSession($token),
            'created_at' => $token->created_at?->toIso8601String(),
            'last_used_at' => $token->last_used_at?->toIso8601String(),
            'expires_at' => $token->expires_at?->toIso8601String(),
        ])->all());
    }
}

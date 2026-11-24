<?php

declare(strict_types=1);

namespace App\Modules\Identity\Actions;

use App\Modules\Identity\Exceptions\UserLifecycleConflictException;
use App\Modules\Identity\Models\User;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;

final class BulkApproveUsersAction
{
    public function __construct(private readonly ApproveUserAction $approveUserAction) {}

    /**
     * @param  list<string>  $userIds
     * @return array{
     *     results: list<array{user_id: string, status: string, message: string|null}>,
     *     summary: array{approved: int, failed: int}
     * }
     */
    public function execute(User $actor, array $userIds): array
    {
        $results = [];
        $approved = 0;
        $failed = 0;

        foreach ($userIds as $userId) {
            /** @var User|null $target */
            $target = User::find($userId);
            if ($target === null) {
                $failed++;
                $results[] = [
                    'user_id' => $userId,
                    'status' => 'not_found',
                    'message' => 'User not found.',
                ];

                continue;
            }

            try {
                Gate::forUser($actor)->authorize('approve', $target);
            } catch (AuthorizationException $e) {
                $failed++;
                $results[] = [
                    'user_id' => $userId,
                    'status' => 'forbidden',
                    'message' => $e->getMessage() ?: 'Not authorized to approve this user.',
                ];

                continue;
            }

            try {
                DB::connection('tenant')->transaction(function () use ($actor, $target): void {
                    $this->approveUserAction->execute($actor, $target);
                });
                $approved++;
                $results[] = [
                    'user_id' => $userId,
                    'status' => 'approved',
                    'message' => null,
                ];
            } catch (UserLifecycleConflictException $e) {
                $failed++;
                $results[] = [
                    'user_id' => $userId,
                    'status' => 'skipped',
                    'message' => $e->getMessage(),
                ];
            }
        }

        return [
            'results' => $results,
            'summary' => [
                'approved' => $approved,
                'failed' => $failed,
            ],
        ];
    }
}

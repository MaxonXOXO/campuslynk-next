<?php

declare(strict_types=1);

namespace App\Modules\Identity\Actions;

use App\Core\Storage\Models\FileRecord;
use App\Core\Storage\Services\FileStorageService;
use App\Core\Tenancy\TenantContext;
use App\Modules\Identity\Models\User;
use App\Modules\Identity\Services\UserAuditScopeResolver;
use Illuminate\Support\Facades\Storage;

final class DeleteMyAvatarAction
{
    public function __construct(
        private readonly FileStorageService $storageService,
        private readonly TenantContext $tenantContext,
        private readonly UserAuditScopeResolver $auditScopeResolver,
    ) {}

    public function execute(User $user): User
    {
        $previousFileId = $user->avatar_file_id;
        if ($previousFileId === null) {
            return $user;
        }

        $user->avatar_file_id = null;
        $user->save();

        $previous = FileRecord::query()->find($previousFileId);
        if ($previous !== null) {
            $this->storageService->softDelete($previous);
        }

        $tenantId = $this->tenantContext->tenant()->id;
        $thumbPath = sprintf('tenants/%s/avatar_thumb/%s', $tenantId, $previousFileId);
        Storage::disk(FileStorageService::DISK_HOT)->delete($thumbPath);

        activity('identity')
            ->causedBy($user)
            ->performedOn($user)
            ->event('user.avatar_removed')
            ->withProperties(array_merge(
                $this->auditScopeResolver->resolveForUser($user),
                [
                    'file_id' => $previousFileId,
                ],
            ))
            ->log('Removed profile avatar');

        return $user->fresh() ?? $user;
    }
}

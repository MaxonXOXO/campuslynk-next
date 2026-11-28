<?php

declare(strict_types=1);

namespace App\Modules\Identity\Actions;

use App\Core\Storage\Models\FileRecord;
use App\Core\Storage\Services\FileStorageService;
use App\Core\Tenancy\TenantContext;
use App\Modules\Identity\Models\User;
use App\Modules\Identity\Services\AvatarImageProcessor;
use App\Modules\Identity\Services\UserAuditScopeResolver;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

final class UploadMyAvatarAction
{
    public function __construct(
        private readonly FileStorageService $storageService,
        private readonly AvatarImageProcessor $imageProcessor,
        private readonly TenantContext $tenantContext,
        private readonly UserAuditScopeResolver $auditScopeResolver,
    ) {}

    public function execute(User $user, UploadedFile $file): User
    {
        $processed = $this->imageProcessor->process($file);
        $previousFileId = $user->avatar_file_id;

        $record = $this->storageService->storeBytes(
            bytes: $processed['originalBytes'],
            originalName: $file->getClientOriginalName(),
            mimeType: $processed['originalMime'],
            category: 'avatar',
            ownerType: 'user',
            ownerId: $user->id,
            createdBy: $user->id,
            disk: FileStorageService::DISK_PRIVATE,
            visibility: 'private',
        );

        $tenantId = $this->tenantContext->tenant()->id;
        $thumbPath = sprintf('tenants/%s/avatar_thumb/%s', $tenantId, $record->id);
        Storage::disk(FileStorageService::DISK_HOT)->put($thumbPath, $processed['thumbnailBytes'], [
            'visibility' => 'private',
        ]);

        $user->avatar_file_id = $record->id;
        $user->save();

        if ($previousFileId !== null && $previousFileId !== $record->id) {
            $previous = FileRecord::query()->find($previousFileId);
            if ($previous !== null) {
                $this->storageService->softDelete($previous);
            }

            $oldThumbPath = sprintf('tenants/%s/avatar_thumb/%s', $tenantId, $previousFileId);
            Storage::disk(FileStorageService::DISK_HOT)->delete($oldThumbPath);
        }

        activity('identity')
            ->causedBy($user)
            ->performedOn($user)
            ->event('user.avatar_updated')
            ->withProperties(array_merge(
                $this->auditScopeResolver->resolveForUser($user),
                [
                    'file_id' => $record->id,
                    'mime_type' => $record->mime_type,
                    'size_bytes' => $record->size_bytes,
                ],
            ))
            ->log('Updated profile avatar');

        return $user->fresh() ?? $user;
    }
}

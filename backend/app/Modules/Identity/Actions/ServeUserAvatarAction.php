<?php

declare(strict_types=1);

namespace App\Modules\Identity\Actions;

use App\Core\Storage\Models\FileRecord;
use App\Core\Storage\Services\FileStorageService;
use App\Core\Tenancy\TenantContext;
use App\Modules\Identity\Models\User;
use App\Modules\Identity\Services\AvatarImageProcessor;
use finfo;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

final class ServeUserAvatarAction
{
    public function __construct(
        private readonly TenantContext $tenantContext,
        private readonly AvatarImageProcessor $imageProcessor,
    ) {}

    public function execute(User $target, Request $request): Response
    {
        if ($target->avatar_file_id === null) {
            abort(404);
        }

        $record = FileRecord::query()->find($target->avatar_file_id);
        if ($record === null || $record->trashed()) {
            abort(404);
        }

        $etag = '"'.$record->checksum_sha256.'-thumb"';
        $cacheControl = 'private, max-age=300';

        if (trim((string) $request->header('If-None-Match', '')) === $etag) {
            return response('', 304, [
                'ETag' => $etag,
                'X-Content-Type-Options' => 'nosniff',
                'Cache-Control' => $cacheControl,
            ]);
        }

        $tenantId = $this->tenantContext->tenant()->id;
        $hotDisk = Storage::disk(FileStorageService::DISK_HOT);
        $thumbPath = sprintf('tenants/%s/avatar_thumb/%s', $tenantId, $record->id);

        if (! $hotDisk->exists($thumbPath)) {
            $privateDisk = Storage::disk($record->disk);
            if (! $privateDisk->exists($record->path)) {
                abort(404);
            }

            $originalBytes = $privateDisk->get($record->path);
            if (! is_string($originalBytes) || $originalBytes === '') {
                abort(404);
            }

            $regenerated = $this->imageProcessor->generateThumbnailFromBytes($originalBytes, $record->mime_type);
            $hotDisk->put($thumbPath, $regenerated['bytes'], [
                'visibility' => 'private',
            ]);
        }

        $thumbBytes = $hotDisk->get($thumbPath);
        if (! is_string($thumbBytes) || $thumbBytes === '') {
            abort(404);
        }

        $finfo = new finfo(FILEINFO_MIME_TYPE);
        $detectedMime = $finfo->buffer($thumbBytes);
        $mimeType = is_string($detectedMime) && $detectedMime !== '' ? $detectedMime : 'image/webp';

        return new StreamedResponse(static function () use ($thumbBytes): void {
            echo $thumbBytes;
        }, 200, [
            'Content-Type' => $mimeType,
            'Content-Length' => (string) strlen($thumbBytes),
            'Content-Disposition' => 'inline; filename="avatar"',
            'X-Content-Type-Options' => 'nosniff',
            'Cache-Control' => $cacheControl,
            'ETag' => $etag,
        ]);
    }
}

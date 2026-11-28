<?php

declare(strict_types=1);

namespace App\Core\Storage\Services;

use App\Core\Storage\Exceptions\FileValidationException;
use App\Core\Storage\Exceptions\StorageUnavailableException;
use App\Core\Storage\Models\FileRecord;
use App\Core\Tenancy\TenantContext;
use finfo;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Throwable;

final class FileStorageService
{
    public const DISK_PRIVATE = 'files_private';

    public const DISK_PUBLIC = 'files_public';

    public const DISK_HOT = 'files_hot';

    /**
     * Executable extensions rejected regardless of MIME detection (ADR-0018).
     *
     * @var list<string>
     */
    private const BLOCKED_EXTENSIONS = [
        'php', 'phtml', 'phar', 'php3', 'php4', 'php5', 'php7', 'php8',
        'sh', 'bash', 'zsh', 'exe', 'bat', 'cmd', 'com', 'msi',
        'js', 'mjs', 'cjs', 'ps1', 'vbs', 'py', 'pl', 'rb',
        'dll', 'so', 'dylib', 'svg', 'svgz',
    ];

    /**
     * Executable and SVG MIME types rejected in v1 (ADR-0018).
     *
     * @var list<string>
     */
    private const BLOCKED_MIME_TYPES = [
        'image/svg+xml',
        'text/x-php',
        'application/x-httpd-php',
        'application/x-php',
        'text/x-shellscript',
        'application/x-sh',
        'application/x-executable',
        'application/x-dosexec',
        'application/x-msdownload',
        'application/javascript',
        'text/javascript',
        'application/x-python-code',
        'text/x-python',
    ];

    public function __construct(
        private readonly TenantContext $tenantContext,
    ) {}

    /**
     * Validate and store an uploaded file under the active tenant's key prefix.
     *
     * @param  list<string>|null  $allowedMimeTypes
     */
    public function store(
        UploadedFile $file,
        string $category,
        string $ownerType,
        string $ownerId,
        ?string $createdBy = null,
        ?array $allowedMimeTypes = null,
        string $visibility = 'private',
    ): FileRecord {
        $realPath = $file->getRealPath();
        if ($realPath === false || ! is_file($realPath)) {
            throw new FileValidationException('Uploaded file could not be read.', [
                'file' => ['Uploaded file could not be read.'],
            ]);
        }

        $sizeBytes = filesize($realPath);
        if ($sizeBytes === false || $sizeBytes <= 0) {
            throw new FileValidationException('Uploaded file is empty.', [
                'file' => ['Uploaded file must not be empty.'],
            ]);
        }

        $this->assertWithinCategoryCap($category, $sizeBytes);

        $originalName = $this->sanitizeOriginalName($file->getClientOriginalName());
        $extension = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
        if ($extension !== '' && in_array($extension, self::BLOCKED_EXTENSIONS, true)) {
            throw new FileValidationException('This file type is not permitted.', [
                'file' => ['Executable and SVG files are not permitted.'],
            ]);
        }

        $mimeType = $this->detectMimeTypeFromFile($realPath);
        $this->assertAllowedMimeType($mimeType, $allowedMimeTypes);

        $checksum = hash_file('sha256', $realPath);
        if ($checksum === false) {
            throw new StorageUnavailableException('Failed to compute file checksum.');
        }

        $disk = $visibility === 'public' ? self::DISK_PUBLIC : self::DISK_PRIVATE;
        $path = $this->buildTenantPath($category);

        try {
            $stream = fopen($realPath, 'rb');
            if ($stream === false) {
                throw new StorageUnavailableException('Failed to open staged upload stream.');
            }

            try {
                $written = Storage::disk($disk)->put($path, $stream, [
                    'visibility' => $visibility,
                ]);
            } finally {
                fclose($stream);
            }

            if ($written === false) {
                throw new StorageUnavailableException('Failed to write file to storage.');
            }
        } catch (StorageUnavailableException $e) {
            throw $e;
        } catch (Throwable $e) {
            throw new StorageUnavailableException('File storage write failed.', $e);
        }

        return FileRecord::query()->create([
            'owner_type' => $ownerType,
            'owner_id' => $ownerId,
            'category' => $category,
            'disk' => $disk,
            'path' => $path,
            'original_name' => $originalName,
            'mime_type' => $mimeType,
            'size_bytes' => $sizeBytes,
            'checksum_sha256' => $checksum,
            'visibility' => $visibility,
            'created_by' => $createdBy,
        ]);
    }

    /**
     * Store already-validated raw bytes (e.g. re-encoded image or derived thumbnail).
     */
    public function storeBytes(
        string $bytes,
        string $originalName,
        string $mimeType,
        string $category,
        string $ownerType,
        string $ownerId,
        ?string $createdBy = null,
        string $disk = self::DISK_PRIVATE,
        string $visibility = 'private',
    ): FileRecord {
        $sizeBytes = strlen($bytes);
        if ($sizeBytes <= 0) {
            throw new FileValidationException('File contents must not be empty.', [
                'file' => ['File contents must not be empty.'],
            ]);
        }

        $this->assertWithinCategoryCap($category, $sizeBytes);

        $detectedMime = $this->detectMimeTypeFromBytes($bytes);
        if ($detectedMime !== $mimeType) {
            $mimeType = $detectedMime;
        }
        $this->assertAllowedMimeType($mimeType, null);

        $checksum = hash('sha256', $bytes);
        $path = $this->buildTenantPath($category);

        try {
            $written = Storage::disk($disk)->put($path, $bytes, [
                'visibility' => $visibility,
            ]);

            if ($written === false) {
                throw new StorageUnavailableException('Failed to write file to storage.');
            }
        } catch (StorageUnavailableException $e) {
            throw $e;
        } catch (Throwable $e) {
            throw new StorageUnavailableException('File storage write failed.', $e);
        }

        return FileRecord::query()->create([
            'owner_type' => $ownerType,
            'owner_id' => $ownerId,
            'category' => $category,
            'disk' => $disk,
            'path' => $path,
            'original_name' => $this->sanitizeOriginalName($originalName),
            'mime_type' => $mimeType,
            'size_bytes' => $sizeBytes,
            'checksum_sha256' => $checksum,
            'visibility' => $visibility,
            'created_by' => $createdBy,
        ]);
    }

    /**
     * Soft-delete a file record immediately (revoking access); physical purge runs asynchronously.
     */
    public function softDelete(FileRecord $file): void
    {
        $file->delete();
    }

    /**
     * Serve an authorized file record using the configured serving strategy (ADR-0018).
     */
    public function serve(FileRecord $file, Request $request, bool $inline = false): Response
    {
        if ($file->trashed()) {
            abort(404);
        }

        $disk = Storage::disk($file->disk);
        if (! $disk->exists($file->path)) {
            abort(404);
        }

        $dispositionType = $inline ? 'inline' : 'attachment';
        $safeFilename = str_replace(['"', '\\', "\r", "\n"], '', $file->original_name);
        $disposition = sprintf('%s; filename="%s"', $dispositionType, $safeFilename !== '' ? $safeFilename : $file->id);

        $driver = (string) config('filesystems.storage.driver', 'local');
        $serveMode = (string) config('filesystems.storage.serve_mode', 'stream');
        /** @var list<string> $sensitiveCategories */
        $sensitiveCategories = config('filesystems.storage.sensitive_categories', ['document']);

        if (
            $driver === 's3'
            && $serveMode === 'presigned'
            && ! in_array($file->category, $sensitiveCategories, true)
        ) {
            $ttl = max(1, (int) config('filesystems.storage.presigned_ttl_seconds', 60));
            $url = $disk->temporaryUrl($file->path, now()->addSeconds($ttl), [
                'ResponseContentType' => $file->mime_type,
                'ResponseContentDisposition' => $disposition,
            ]);

            return redirect()->away($url);
        }

        $cacheControl = $file->visibility === 'public'
            ? 'public, max-age=86400'
            : 'private, max-age=300';
        $etag = '"'.$file->checksum_sha256.'"';

        if (trim((string) $request->header('If-None-Match', '')) === $etag) {
            return response('', 304, [
                'ETag' => $etag,
                'X-Content-Type-Options' => 'nosniff',
                'Cache-Control' => $cacheControl,
            ]);
        }

        $baseHeaders = [
            'Content-Type' => $file->mime_type,
            'Content-Disposition' => $disposition,
            'X-Content-Type-Options' => 'nosniff',
            'Cache-Control' => $cacheControl,
            'ETag' => $etag,
        ];

        if ($driver === 'local' && $serveMode === 'x-accel') {
            return response('', 200, $baseHeaders + [
                'X-Accel-Redirect' => '/_internal_files/'.$file->disk.'/'.$file->path,
            ]);
        }

        if ($driver === 'local' && $serveMode === 'x-sendfile') {
            return response('', 200, $baseHeaders + [
                'X-Sendfile' => $disk->path($file->path),
            ]);
        }

        return new StreamedResponse(static function () use ($disk, $file): void {
            $stream = $disk->readStream($file->path);
            if ($stream === null) {
                return;
            }

            try {
                fpassthru($stream);
            } finally {
                if (is_resource($stream)) {
                    fclose($stream);
                }
            }
        }, 200, $baseHeaders + [
            'Content-Length' => (string) $file->size_bytes,
        ]);
    }

    public function buildTenantPath(string $category): string
    {
        $tenantId = $this->tenantContext->tenant()->id;
        $safeCategory = preg_replace('/[^a-z0-9_-]/', '', strtolower($category)) ?: 'misc';

        return sprintf('tenants/%s/%s/%s', $tenantId, $safeCategory, (string) Str::ulid());
    }

    private function assertWithinCategoryCap(string $category, int $sizeBytes): void
    {
        $maxBytes = config("filesystems.storage.category_max_bytes.{$category}");
        if (is_int($maxBytes) && $sizeBytes > $maxBytes) {
            throw new FileValidationException(
                sprintf('File exceeds the maximum allowed size (%d bytes) for %s.', $maxBytes, $category),
                ['file' => [sprintf('File must not exceed %d bytes.', $maxBytes)]],
            );
        }
    }

    private function detectMimeTypeFromFile(string $realPath): string
    {
        $finfo = new finfo(FILEINFO_MIME_TYPE);
        $detected = $finfo->file($realPath);

        return is_string($detected) && $detected !== '' ? strtolower($detected) : 'application/octet-stream';
    }

    private function detectMimeTypeFromBytes(string $bytes): string
    {
        $finfo = new finfo(FILEINFO_MIME_TYPE);
        $detected = $finfo->buffer($bytes);

        return is_string($detected) && $detected !== '' ? strtolower($detected) : 'application/octet-stream';
    }

    /**
     * @param  list<string>|null  $allowedMimeTypes
     */
    private function assertAllowedMimeType(string $mimeType, ?array $allowedMimeTypes): void
    {
        if (in_array($mimeType, self::BLOCKED_MIME_TYPES, true)) {
            throw new FileValidationException('This file type is not permitted.', [
                'file' => ['Executable and SVG files are not permitted.'],
            ]);
        }

        if ($allowedMimeTypes !== null && ! in_array($mimeType, $allowedMimeTypes, true)) {
            throw new FileValidationException('Unsupported file type.', [
                'file' => [sprintf('Detected MIME type "%s" is not allowed.', $mimeType)],
            ]);
        }
    }

    private function sanitizeOriginalName(string $name): string
    {
        $base = basename(str_replace('\\', '/', $name));
        $clean = preg_replace('/[\x00-\x1F\x7F]/u', '', $base);
        $trimmed = trim(is_string($clean) ? $clean : '');

        return $trimmed !== '' ? Str::limit($trimmed, 255, '') : 'upload';
    }
}

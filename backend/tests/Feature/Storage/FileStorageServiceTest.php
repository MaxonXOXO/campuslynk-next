<?php

declare(strict_types=1);

use App\Core\Storage\Exceptions\FileValidationException;
use App\Core\Storage\Models\FileRecord;
use App\Core\Storage\Services\FileStorageService;
use App\Core\Tenancy\Services\TenantProvisioner;
use App\Core\Tenancy\TenantContext;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Tests\Feature\Tenancy\TenancyTestHelper;

uses(TenancyTestHelper::class);

beforeEach(function (): void {
    $this->purgeAllTenantDatabases();
    Storage::fake(FileStorageService::DISK_PRIVATE);
    Storage::fake(FileStorageService::DISK_PUBLIC);
    Storage::fake(FileStorageService::DISK_HOT);

    $provisioner = app(TenantProvisioner::class);
    $this->tenant = $provisioner->provision('tenant_file_test', 'File College', 'files.test', 'onprem');
    app(TenantContext::class)->setTenant($this->tenant);
});

afterEach(function (): void {
    app(TenantContext::class)->forget();
    $this->purgeAllTenantDatabases();
});

it('stores an uploaded file under tenants/{id}/{category}/{ulid} with sha256 and never uses client filename in path', function (): void {
    $service = app(FileStorageService::class);
    $pngBytes = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', true);
    expect($pngBytes)->not->toBeFalse();

    $tmp = tempnam(sys_get_temp_dir(), 'avatar_');
    expect($tmp)->not->toBeFalse();
    file_put_contents((string) $tmp, (string) $pngBytes);

    $uploaded = new UploadedFile((string) $tmp, '../../evil-name.png', 'image/png', null, true);
    $ownerId = (string) Str::ulid();

    $record = $service->store(
        file: $uploaded,
        category: 'avatar',
        ownerType: 'user',
        ownerId: $ownerId,
        createdBy: $ownerId,
        allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
    );

    expect($record->disk)->toBe(FileStorageService::DISK_PRIVATE);
    expect($record->path)->toStartWith("tenants/{$this->tenant->id}/avatar/");
    expect($record->path)->not->toContain('evil-name');
    expect($record->original_name)->toBe('evil-name.png');
    expect($record->mime_type)->toBe('image/png');
    expect($record->size_bytes)->toBe(strlen((string) $pngBytes));
    expect($record->checksum_sha256)->toBe(hash('sha256', (string) $pngBytes));
    Storage::disk(FileStorageService::DISK_PRIVATE)->assertExists($record->path);

    @unlink((string) $tmp);
});

it('rejects spoofed php scripts, executables, and svg uploads by content inspection', function (): void {
    $service = app(FileStorageService::class);
    $ownerId = (string) Str::ulid();

    // PHP script disguised as .jpg
    $tmpPhp = tempnam(sys_get_temp_dir(), 'spoof_');
    file_put_contents((string) $tmpPhp, "<?php echo 'pwned'; ?>\n");
    $spoofed = new UploadedFile((string) $tmpPhp, 'avatar.jpg', 'image/jpeg', null, true);

    expect(fn () => $service->store(
        file: $spoofed,
        category: 'avatar',
        ownerType: 'user',
        ownerId: $ownerId,
        allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
    ))->toThrow(FileValidationException::class);
    @unlink((string) $tmpPhp);

    // SVG upload (blocked in v1)
    $tmpSvg = tempnam(sys_get_temp_dir(), 'svg_');
    file_put_contents((string) $tmpSvg, '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    $svg = new UploadedFile((string) $tmpSvg, 'icon.svg', 'image/svg+xml', null, true);

    expect(fn () => $service->store(
        file: $svg,
        category: 'avatar',
        ownerType: 'user',
        ownerId: $ownerId,
    ))->toThrow(FileValidationException::class);
    @unlink((string) $tmpSvg);
});

it('enforces the 5 MB category cap for avatars', function (): void {
    $service = app(FileStorageService::class);
    $ownerId = (string) Str::ulid();
    $oversized = str_repeat('A', (5 * 1024 * 1024) + 1);

    expect(fn () => $service->storeBytes(
        bytes: $oversized,
        originalName: 'huge.bin',
        mimeType: 'application/octet-stream',
        category: 'avatar',
        ownerType: 'user',
        ownerId: $ownerId,
    ))->toThrow(FileValidationException::class);
});

it('serves files with nosniff, ETag 304 support, and returns 404 after soft delete', function (): void {
    $service = app(FileStorageService::class);
    $ownerId = (string) Str::ulid();
    $pngBytes = (string) base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', true);

    $record = $service->storeBytes(
        bytes: $pngBytes,
        originalName: 'photo.png',
        mimeType: 'image/png',
        category: 'avatar',
        ownerType: 'user',
        ownerId: $ownerId,
    );

    $response = $service->serve($record, Request::create('/'), inline: true);
    expect($response->getStatusCode())->toBe(200);
    expect($response->headers->get('X-Content-Type-Options'))->toBe('nosniff');
    expect($response->headers->get('Content-Type'))->toBe('image/png');
    expect($response->headers->get('Content-Disposition'))->toContain('inline; filename="photo.png"');

    $etag = $response->headers->get('ETag');
    expect($etag)->toBe('"'.$record->checksum_sha256.'"');

    $conditional = Request::create('/', 'GET', [], [], [], ['HTTP_IF_NONE_MATCH' => (string) $etag]);
    $notModified = $service->serve($record, $conditional, inline: true);
    expect($notModified->getStatusCode())->toBe(304);

    $service->softDelete($record);
    expect(FileRecord::withTrashed()->find($record->id)?->trashed())->toBeTrue();

    expect(fn () => $service->serve($record->fresh(['*']) ?? $record, Request::create('/')))
        ->toThrow(NotFoundHttpException::class);
});

it('isolates storage prefixes across tenants without mutating disk config', function (): void {
    $service = app(FileStorageService::class);
    $pathA = $service->buildTenantPath('avatar');
    expect($pathA)->toStartWith("tenants/{$this->tenant->id}/avatar/");

    $provisioner = app(TenantProvisioner::class);
    $tenantB = $provisioner->provision('tenant_file_test_b', 'File B College', 'files-b.test', 'onprem');
    app(TenantContext::class)->setTenant($tenantB);

    $pathB = $service->buildTenantPath('avatar');
    expect($pathB)->toStartWith("tenants/{$tenantB->id}/avatar/");
    expect(config('filesystems.disks.files_private.root'))->toBe((string) env('FILES_PRIVATE_ROOT', storage_path('app/files/private')));
});

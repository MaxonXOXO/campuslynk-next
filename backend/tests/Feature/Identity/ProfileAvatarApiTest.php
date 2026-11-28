<?php

declare(strict_types=1);

use App\Core\Storage\Models\FileRecord;
use App\Core\Storage\Services\FileStorageService;
use App\Core\Tenancy\Services\TenantProvisioner;
use App\Core\Tenancy\TenantContext;
use App\Modules\Identity\Models\Activity;
use App\Modules\Identity\Models\Role;
use App\Modules\Identity\Models\RoleAssignment;
use App\Modules\Identity\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\Feature\Tenancy\TenancyTestHelper;

uses(TenancyTestHelper::class);

beforeEach(function (): void {
    $this->purgeAllTenantDatabases();
    config(['app_profile.deploy_profile' => 'cloud']);
    Storage::fake(FileStorageService::DISK_PRIVATE);
    Storage::fake(FileStorageService::DISK_PUBLIC);
    Storage::fake(FileStorageService::DISK_HOT);

    $provisioner = app(TenantProvisioner::class);
    $this->tenant = $provisioner->provision('tenant_avatar_test', 'Avatar College', 'avatar.test', 'cloud');
    app(TenantContext::class)->setTenant($this->tenant);

    $this->user = User::create([
        'type' => 'staff',
        'name' => 'Dr. Meera Nair',
        'email' => 'meera@avatar.test',
        'password' => 'StrongPass99!',
        'must_change_password' => false,
        'status' => 'active',
    ]);
    $this->token = $this->user->createToken('web', ['*'])->plainTextToken;
});

afterEach(function (): void {
    app(TenantContext::class)->forget();
    $this->purgeAllTenantDatabases();
});

function makeValidPngUpload(string $filename = 'avatar.png'): UploadedFile
{
    $img = imagecreatetruecolor(64, 48);
    expect($img)->not->toBeFalse();
    $color = imagecolorallocate($img, 20, 120, 200);
    imagefilledrectangle($img, 0, 0, 63, 47, (int) $color);
    ob_start();
    imagepng($img);
    $bytes = (string) ob_get_clean();
    imagedestroy($img);

    $tmp = tempnam(sys_get_temp_dir(), 'png_');
    file_put_contents((string) $tmp, $bytes);

    return new UploadedFile((string) $tmp, $filename, 'image/png', null, true);
}

it('uploads and replaces an avatar, generates hot thumbnail, soft-deletes previous record, and logs audit', function (): void {
    $upload1 = makeValidPngUpload('first.png');

    $res1 = $this->withHeaders([
        'X-Tenant' => 'tenant_avatar_test',
        'Authorization' => 'Bearer '.$this->token,
    ])->post('http://avatar.test/api/v1/me/avatar', [
        'avatar' => $upload1,
    ]);

    $res1->assertOk()
        ->assertJsonPath('data.avatar_url', "/api/v1/users/{$this->user->id}/avatar");

    app(TenantContext::class)->setTenant($this->tenant);
    $this->user->refresh();
    $firstFileId = $this->user->avatar_file_id;
    expect($firstFileId)->not->toBeNull();

    $firstRecord = FileRecord::query()->find($firstFileId);
    expect($firstRecord)->not->toBeNull();
    Storage::disk(FileStorageService::DISK_PRIVATE)->assertExists($firstRecord->path);
    Storage::disk(FileStorageService::DISK_HOT)->assertExists("tenants/{$this->tenant->id}/avatar_thumb/{$firstFileId}");

    $audit = Activity::query()
        ->where('event', 'user.avatar_updated')
        ->where('subject_id', $this->user->id)
        ->latest('id')
        ->first();
    expect($audit)->not->toBeNull();
    expect($audit->properties['file_id'] ?? null)->toBe($firstFileId);

    // Replace with a second upload
    $upload2 = makeValidPngUpload('second.png');
    $res2 = $this->withHeaders([
        'X-Tenant' => 'tenant_avatar_test',
        'Authorization' => 'Bearer '.$this->token,
    ])->post('http://avatar.test/api/v1/me/avatar', [
        'avatar' => $upload2,
    ]);

    $res2->assertOk();
    app(TenantContext::class)->setTenant($this->tenant);
    $this->user->refresh();
    $secondFileId = $this->user->avatar_file_id;
    expect($secondFileId)->not->toBe($firstFileId);
    expect(FileRecord::withTrashed()->find($firstFileId)?->trashed())->toBeTrue();
    Storage::disk(FileStorageService::DISK_HOT)->assertMissing("tenants/{$this->tenant->id}/avatar_thumb/{$firstFileId}");
    Storage::disk(FileStorageService::DISK_HOT)->assertExists("tenants/{$this->tenant->id}/avatar_thumb/{$secondFileId}");
});

it('rejects animated WebP, SVG, and spoofed files with 422', function (): void {
    // Minimal RIFF/WEBP with VP8X animation flag + ANIM chunk
    $animatedWebp = "RIFF\x24\x00\x00\x00WEBPVP8X\x0a\x00\x00\x00\x02\x00\x00\x00\x00\x00\x00\x00\x00\x00ANIM\x06\x00\x00\x00\x00\x00\x00\x00\x00\x00";
    $tmpWebp = tempnam(sys_get_temp_dir(), 'anim_');
    file_put_contents((string) $tmpWebp, $animatedWebp);
    $webpFile = new UploadedFile((string) $tmpWebp, 'anim.webp', 'image/webp', null, true);

    $this->withHeaders([
        'Accept' => 'application/json',
        'X-Tenant' => 'tenant_avatar_test',
        'Authorization' => 'Bearer '.$this->token,
    ])->post('http://avatar.test/api/v1/me/avatar', [
        'avatar' => $webpFile,
    ])->assertStatus(422);
    @unlink((string) $tmpWebp);

    // SVG upload
    $tmpSvg = tempnam(sys_get_temp_dir(), 'svg_');
    file_put_contents((string) $tmpSvg, '<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    $svgFile = new UploadedFile((string) $tmpSvg, 'icon.svg', 'image/svg+xml', null, true);

    $this->withHeaders([
        'Accept' => 'application/json',
        'X-Tenant' => 'tenant_avatar_test',
        'Authorization' => 'Bearer '.$this->token,
    ])->post('http://avatar.test/api/v1/me/avatar', [
        'avatar' => $svgFile,
    ])->assertStatus(422);
    @unlink((string) $tmpSvg);
});

it('deletes avatar, soft-deletes FileRecord, and logs audit', function (): void {
    $upload = makeValidPngUpload('delete-me.png');

    $this->withHeaders([
        'X-Tenant' => 'tenant_avatar_test',
        'Authorization' => 'Bearer '.$this->token,
    ])->post('http://avatar.test/api/v1/me/avatar', ['avatar' => $upload])->assertOk();

    app(TenantContext::class)->setTenant($this->tenant);
    $this->user->refresh();
    $fileId = $this->user->avatar_file_id;

    $this->withHeaders([
        'X-Tenant' => 'tenant_avatar_test',
        'Authorization' => 'Bearer '.$this->token,
    ])->deleteJson('http://avatar.test/api/v1/me/avatar')
        ->assertOk()
        ->assertJsonPath('data.avatar_url', null);

    app(TenantContext::class)->setTenant($this->tenant);
    $this->user->refresh();
    expect($this->user->avatar_file_id)->toBeNull();
    expect(FileRecord::withTrashed()->find($fileId)?->trashed())->toBeTrue();
    Storage::disk(FileStorageService::DISK_HOT)->assertMissing("tenants/{$this->tenant->id}/avatar_thumb/{$fileId}");

    $audit = Activity::query()
        ->where('event', 'user.avatar_removed')
        ->where('subject_id', $this->user->id)
        ->latest('id')
        ->first();
    expect($audit)->not->toBeNull();
});

it('enforces self and UserPolicy::view authorization, supports ETag 304, and lazily regenerates hot thumbnail', function (): void {
    $upload = makeValidPngUpload('serve.png');
    $this->withHeaders([
        'X-Tenant' => 'tenant_avatar_test',
        'Authorization' => 'Bearer '.$this->token,
    ])->post('http://avatar.test/api/v1/me/avatar', ['avatar' => $upload])->assertOk();

    app(TenantContext::class)->setTenant($this->tenant);
    $this->user->refresh();
    $fileId = $this->user->avatar_file_id;

    // 1. Self can always view own avatar
    $selfRes = $this->withHeaders([
        'X-Tenant' => 'tenant_avatar_test',
        'Authorization' => 'Bearer '.$this->token,
    ])->get("http://avatar.test/api/v1/users/{$this->user->id}/avatar");

    $selfRes->assertOk();
    expect($selfRes->headers->get('X-Content-Type-Options'))->toBe('nosniff');
    $etag = (string) $selfRes->headers->get('ETag');
    expect($etag)->not->toBe('');

    // 2. Conditional ETag returns 304
    $this->withHeaders([
        'X-Tenant' => 'tenant_avatar_test',
        'Authorization' => 'Bearer '.$this->token,
        'If-None-Match' => $etag,
    ])->get("http://avatar.test/api/v1/users/{$this->user->id}/avatar")
        ->assertStatus(304);

    // 3. Hot thumbnail missing -> lazily regenerated from files_private
    Storage::disk(FileStorageService::DISK_HOT)->delete("tenants/{$this->tenant->id}/avatar_thumb/{$fileId}");
    Storage::disk(FileStorageService::DISK_HOT)->assertMissing("tenants/{$this->tenant->id}/avatar_thumb/{$fileId}");

    $this->flushHeaders();
    $this->withHeaders([
        'X-Tenant' => 'tenant_avatar_test',
        'Authorization' => 'Bearer '.$this->token,
    ])->get("http://avatar.test/api/v1/users/{$this->user->id}/avatar")->assertOk();

    Storage::disk(FileStorageService::DISK_HOT)->assertExists("tenants/{$this->tenant->id}/avatar_thumb/{$fileId}");

    // 4. Another user without identity.user.view receives 403
    app(TenantContext::class)->setTenant($this->tenant);
    $otherUser = User::create([
        'type' => 'staff',
        'name' => 'Peer User',
        'email' => 'peer@avatar.test',
        'password' => 'StrongPass99!',
        'must_change_password' => false,
        'status' => 'active',
    ]);
    $otherToken = $otherUser->createToken('web', ['*'])->plainTextToken;

    $this->withHeaders([
        'X-Tenant' => 'tenant_avatar_test',
        'Authorization' => 'Bearer '.$otherToken,
    ])->get("http://avatar.test/api/v1/users/{$this->user->id}/avatar")
        ->assertForbidden();

    // 5. Granting principal (with identity.user.view at institution scope) allows viewing
    app(TenantContext::class)->setTenant($this->tenant);
    $principalRole = Role::query()->where('key', 'principal')->first();
    if ($principalRole !== null) {
        RoleAssignment::query()->create([
            'user_id' => $otherUser->id,
            'role_id' => $principalRole->id,
            'scope_type' => 'institution',
            'scope_label' => 'institution',
            'is_active' => true,
            'valid_from' => now()->subMinute(),
        ]);

        $this->withHeaders([
            'X-Tenant' => 'tenant_avatar_test',
            'Authorization' => 'Bearer '.$otherToken,
        ])->get("http://avatar.test/api/v1/users/{$this->user->id}/avatar")
            ->assertOk();
    }

    // 6. Cross-tenant isolation: user ID from tenant A is 404 in tenant B
    $provisioner = app(TenantProvisioner::class);
    $tenantB = $provisioner->provision('tenant_avatar_b', 'Avatar B College', 'avatar-b.test', 'cloud');
    app(TenantContext::class)->setTenant($tenantB);
    $userB = User::create([
        'type' => 'staff',
        'name' => 'Tenant B User',
        'email' => 'b@avatar-b.test',
        'password' => 'StrongPass99!',
        'must_change_password' => false,
        'status' => 'active',
    ]);
    $tokenB = $userB->createToken('web', ['*'])->plainTextToken;

    $this->withHeaders([
        'X-Tenant' => 'tenant_avatar_b',
        'Authorization' => 'Bearer '.$tokenB,
    ])->get("http://avatar-b.test/api/v1/users/{$this->user->id}/avatar")
        ->assertNotFound();
});

it('blocks avatar mutations during impersonation', function (): void {
    $tokenResult = $this->user->createToken('impersonation', ['impersonation:read_only']);

    $upload = makeValidPngUpload('imp.png');

    $this->withHeaders([
        'X-Tenant' => 'tenant_avatar_test',
        'Authorization' => 'Bearer '.$tokenResult->plainTextToken,
    ])->post('http://avatar.test/api/v1/me/avatar', ['avatar' => $upload])
        ->assertForbidden();

    $this->withHeaders([
        'X-Tenant' => 'tenant_avatar_test',
        'Authorization' => 'Bearer '.$tokenResult->plainTextToken,
    ])->deleteJson('http://avatar.test/api/v1/me/avatar')
        ->assertForbidden();
});

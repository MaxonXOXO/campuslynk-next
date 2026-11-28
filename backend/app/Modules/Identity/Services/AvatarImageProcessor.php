<?php

declare(strict_types=1);

namespace App\Modules\Identity\Services;

use App\Core\Storage\Exceptions\FileValidationException;
use finfo;
use GdImage;
use Illuminate\Http\UploadedFile;

final class AvatarImageProcessor
{
    /**
     * @var list<string>
     */
    public const ALLOWED_MIME_TYPES = [
        'image/jpeg',
        'image/png',
        'image/webp',
    ];

    public const THUMBNAIL_SIZE = 256;

    private const MAX_DIMENSION = 8000;

    /**
     * Validate, strip EXIF/metadata, re-encode original, and build a 256x256 thumbnail.
     *
     * @return array{originalBytes: string, originalMime: string, thumbnailBytes: string, thumbnailMime: string}
     */
    public function process(UploadedFile $file): array
    {
        $realPath = $file->getRealPath();
        if ($realPath === false || ! is_file($realPath)) {
            throw new FileValidationException('Uploaded avatar could not be read.', [
                'avatar' => ['Uploaded avatar could not be read.'],
            ]);
        }

        $rawBytes = file_get_contents($realPath);
        if ($rawBytes === false || $rawBytes === '') {
            throw new FileValidationException('Uploaded avatar is empty.', [
                'avatar' => ['Uploaded avatar must not be empty.'],
            ]);
        }

        $maxBytes = (int) config('filesystems.storage.category_max_bytes.avatar', 5 * 1024 * 1024);
        if (strlen($rawBytes) > $maxBytes) {
            throw new FileValidationException(
                sprintf('Avatar exceeds the maximum allowed size (%d bytes).', $maxBytes),
                ['avatar' => ['Avatar must not exceed 5 MB.']],
            );
        }

        $mimeType = $this->detectMimeType($rawBytes);
        if (! in_array($mimeType, self::ALLOWED_MIME_TYPES, true)) {
            throw new FileValidationException('Unsupported avatar image format.', [
                'avatar' => ['Avatar must be a JPEG, PNG, or static WebP image.'],
            ]);
        }

        if ($mimeType === 'image/webp' && $this->isAnimatedWebp($rawBytes)) {
            throw new FileValidationException('Animated WebP images are not supported.', [
                'avatar' => ['Animated WebP images are not supported. Please upload a static JPEG, PNG, or WebP.'],
            ]);
        }

        $image = $this->decodeImage($rawBytes, $mimeType);

        try {
            if ($mimeType === 'image/jpeg') {
                $image = $this->applyJpegExifOrientation($image, $realPath);
            }

            $originalBytes = $this->encodeOriginal($image, $mimeType);
            $thumbnail = $this->generateThumbnailFromGd($image);

            return [
                'originalBytes' => $originalBytes,
                'originalMime' => $mimeType,
                'thumbnailBytes' => $thumbnail['bytes'],
                'thumbnailMime' => $thumbnail['mime'],
            ];
        } finally {
            imagedestroy($image);
        }
    }

    /**
     * Regenerate a 256x256 thumbnail from stored original bytes.
     *
     * @return array{bytes: string, mime: string}
     */
    public function generateThumbnailFromBytes(string $originalBytes, string $mimeType): array
    {
        $image = $this->decodeImage($originalBytes, $mimeType);

        try {
            return $this->generateThumbnailFromGd($image);
        } finally {
            imagedestroy($image);
        }
    }

    private function detectMimeType(string $bytes): string
    {
        $finfo = new finfo(FILEINFO_MIME_TYPE);
        $detected = $finfo->buffer($bytes);

        return is_string($detected) && $detected !== '' ? strtolower($detected) : 'application/octet-stream';
    }

    /**
     * Detect animated WebP by checking VP8X animation flag (0x02) or ANIM/ANMF chunks.
     */
    private function isAnimatedWebp(string $bytes): bool
    {
        if (strlen($bytes) < 16 || substr($bytes, 0, 4) !== 'RIFF' || substr($bytes, 8, 4) !== 'WEBP') {
            return false;
        }

        if (str_contains($bytes, 'ANIM') || str_contains($bytes, 'ANMF')) {
            return true;
        }

        if (substr($bytes, 12, 4) === 'VP8X' && strlen($bytes) >= 21) {
            $flags = ord($bytes[20]);

            return ($flags & 0x02) !== 0;
        }

        return false;
    }

    private function decodeImage(string $bytes, string $mimeType): GdImage
    {
        $info = @getimagesizefromstring($bytes);
        if (! is_array($info) || $info[0] <= 0 || $info[1] <= 0) {
            throw new FileValidationException('Invalid image file.', [
                'avatar' => ['The uploaded file is not a valid image.'],
            ]);
        }

        if ($info[0] > self::MAX_DIMENSION || $info[1] > self::MAX_DIMENSION) {
            throw new FileValidationException('Image dimensions exceed the maximum allowed limit.', [
                'avatar' => [sprintf('Image dimensions must not exceed %dx%d pixels.', self::MAX_DIMENSION, self::MAX_DIMENSION)],
            ]);
        }

        $image = match ($mimeType) {
            'image/jpeg' => @imagecreatefromstring($bytes),
            'image/png' => @imagecreatefromstring($bytes),
            'image/webp' => @imagecreatefromstring($bytes),
            default => false,
        };

        if (! $image instanceof GdImage) {
            throw new FileValidationException('Unable to decode image file.', [
                'avatar' => ['The uploaded image could not be decoded.'],
            ]);
        }

        return $image;
    }

    private function applyJpegExifOrientation(GdImage $image, string $realPath): GdImage
    {
        if (! function_exists('exif_read_data')) {
            return $image;
        }

        $exif = @exif_read_data($realPath);
        if (! is_array($exif) || ! isset($exif['Orientation'])) {
            return $image;
        }

        $orientation = (int) $exif['Orientation'];
        $rotated = match ($orientation) {
            3 => imagerotate($image, 180, 0),
            6 => imagerotate($image, -90, 0),
            8 => imagerotate($image, 90, 0),
            default => false,
        };

        if ($rotated instanceof GdImage) {
            imagedestroy($image);

            return $rotated;
        }

        return $image;
    }

    private function encodeOriginal(GdImage $image, string $mimeType): string
    {
        ob_start();
        $ok = match ($mimeType) {
            'image/jpeg' => imagejpeg($image, null, 90),
            'image/png' => $this->encodePng($image),
            'image/webp' => function_exists('imagewebp') ? imagewebp($image, null, 90) : $this->encodePng($image),
            default => false,
        };
        $data = ob_get_clean();

        if (! $ok || ! is_string($data) || $data === '') {
            throw new FileValidationException('Failed to encode avatar image.', [
                'avatar' => ['Failed to process the uploaded image.'],
            ]);
        }

        return $data;
    }

    private function encodePng(GdImage $image): bool
    {
        imagealphablending($image, false);
        imagesavealpha($image, true);

        return imagepng($image, null, 6);
    }

    /**
     * @return array{bytes: string, mime: string}
     */
    private function generateThumbnailFromGd(GdImage $source): array
    {
        $srcW = imagesx($source);
        $srcH = imagesy($source);
        $cropSize = min($srcW, $srcH);
        $srcX = (int) floor(($srcW - $cropSize) / 2);
        $srcY = (int) floor(($srcH - $cropSize) / 2);

        $thumb = imagecreatetruecolor(self::THUMBNAIL_SIZE, self::THUMBNAIL_SIZE);
        if (! $thumb instanceof GdImage) {
            throw new FileValidationException('Failed to allocate thumbnail canvas.', [
                'avatar' => ['Failed to process the uploaded image.'],
            ]);
        }

        try {
            imagealphablending($thumb, false);
            imagesavealpha($thumb, true);
            $transparent = imagecolorallocatealpha($thumb, 0, 0, 0, 127);
            if ($transparent !== false) {
                imagefilledrectangle($thumb, 0, 0, self::THUMBNAIL_SIZE, self::THUMBNAIL_SIZE, $transparent);
            }

            imagecopyresampled(
                $thumb,
                $source,
                0,
                0,
                $srcX,
                $srcY,
                self::THUMBNAIL_SIZE,
                self::THUMBNAIL_SIZE,
                $cropSize,
                $cropSize,
            );

            ob_start();
            if (function_exists('imagewebp')) {
                $ok = imagewebp($thumb, null, 85);
                $mime = 'image/webp';
            } else {
                $ok = imagepng($thumb, null, 6);
                $mime = 'image/png';
            }
            $bytes = ob_get_clean();

            if (! $ok || ! is_string($bytes) || $bytes === '') {
                throw new FileValidationException('Failed to encode avatar thumbnail.', [
                    'avatar' => ['Failed to process the uploaded image.'],
                ]);
            }

            return [
                'bytes' => $bytes,
                'mime' => $mime,
            ];
        } finally {
            imagedestroy($thumb);
        }
    }
}

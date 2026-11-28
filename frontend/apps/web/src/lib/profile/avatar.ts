export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

export const AVATAR_ACCEPTED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export function resolveUserAvatarSrc(
  user: { id?: string; avatar_url?: string | null } | null | undefined,
  cacheVersion?: number
): string | null {
  if (!user?.id || !user.avatar_url) {
    return null;
  }

  const base = `/api/session/users/${encodeURIComponent(user.id)}/avatar`;
  return cacheVersion ? `${base}?v=${cacheVersion}` : base;
}

export function validateAvatarFileClient(file: File): string | null {
  if (file.size <= 0) {
    return "Please choose a non-empty image file.";
  }

  if (file.size > AVATAR_MAX_BYTES) {
    return "Profile photo must be 5 MB or smaller.";
  }

  if (
    file.type &&
    !(AVATAR_ACCEPTED_MIME_TYPES as readonly string[]).includes(file.type.toLowerCase())
  ) {
    return "Please choose a JPEG, PNG, or WebP image.";
  }

  return null;
}


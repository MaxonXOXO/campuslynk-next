export function getProfileInitials(
  firstName?: string | null,
  lastName?: string | null,
  name?: string | null
): string {
  const first = firstName?.trim();
  const last = lastName?.trim();

  if (first && last) {
    const firstChar = Array.from(first)[0] ?? "";
    const lastChar = Array.from(last)[0] ?? "";
    return `${firstChar}${lastChar}`.toUpperCase() || "U";
  }

  const trimmedName = name?.trim();
  if (!trimmedName) {
    return "U";
  }

  const parts = trimmedName.split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "U";
  }
  if (parts.length === 1) {
    return Array.from(parts[0]!).slice(0, 2).join("").toUpperCase();
  }

  const firstInitial = Array.from(parts[0]!)[0] ?? "";
  const lastInitial = Array.from(parts[parts.length - 1]!)[0] ?? "";
  return `${firstInitial}${lastInitial}`.toUpperCase() || "U";
}


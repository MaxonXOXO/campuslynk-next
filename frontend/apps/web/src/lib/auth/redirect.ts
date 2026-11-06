import { shouldRedirectToSetup, type SetupStatusCheck, type UserWithAssignments } from "../../app/setup/logic/role-routing";

export type SessionStatus = "loading" | "authenticated" | "unauthenticated" | "must_change_password" | "error";

export const LOGIN_PATH = "/login";
export const CHANGE_PASSWORD_PATH = "/change-password";
export const SETUP_PATH = "/setup";
export const HOME_PATH = "/home";

const PUBLIC_PATHS = new Set([LOGIN_PATH]);
function hasControlChars(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

/**
 * Accept only same-origin, app-relative return URLs. Anything else (absolute URLs,
 * protocol-relative, backslashes, control characters, auth pages) is discarded.
 */
export function sanitizeReturnUrl(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  if (raw.length > 512) return null;
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  if (raw.includes("\\") || hasControlChars(raw)) return null;
  if (/^\/[a-z][a-z0-9+.-]*:/i.test(raw)) return null;
  if (/%(2f|5c|0a|0d|00)/i.test(raw)) return null;

  const path = raw.split(/[?#]/)[0] ?? raw;
  if (path === LOGIN_PATH || path === CHANGE_PASSWORD_PATH || path.startsWith("/api/")) return null;

  return raw;
}

export function buildLoginUrl(returnTo: string | null | undefined): string {
  const safe = sanitizeReturnUrl(returnTo);
  return safe ? `${LOGIN_PATH}?returnTo=${encodeURIComponent(safe)}` : LOGIN_PATH;
}

export interface PostLoginInput {
  mustChangePassword: boolean;
  user: UserWithAssignments | null | undefined;
  setupStatus: SetupStatusCheck | null | undefined;
  returnTo?: string | null;
}

/** Decide where to send a user right after authentication. */
export function resolvePostLoginRoute({ mustChangePassword, user, setupStatus, returnTo }: PostLoginInput): string {
  if (mustChangePassword) return CHANGE_PASSWORD_PATH;
  if (shouldRedirectToSetup(user, setupStatus)) return SETUP_PATH;
  return sanitizeReturnUrl(returnTo) ?? HOME_PATH;
}

export type GuardDecision =
  | { action: "wait" }
  | { action: "render" }
  | { action: "redirect"; to: string };

/** What an app-route guard should do for the current session state and location. */
export function guardDecision(status: SessionStatus, pathname: string, search = ""): GuardDecision {
  if (status === "loading") return { action: "wait" };

  if (status === "unauthenticated") {
    if (PUBLIC_PATHS.has(pathname)) return { action: "render" };
    return { action: "redirect", to: buildLoginUrl(`${pathname}${search}`) };
  }

  if (status === "must_change_password") {
    return pathname === CHANGE_PASSWORD_PATH ? { action: "render" } : { action: "redirect", to: CHANGE_PASSWORD_PATH };
  }

  if (status === "error") return { action: "render" };

  // authenticated: every guarded route (including /change-password) may render
  return { action: "render" };
}

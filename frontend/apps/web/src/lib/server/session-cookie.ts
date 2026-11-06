/**
 * Session cookie handling. The Bearer token lives only in an httpOnly cookie.
 * A second httpOnly cookie remembers the login identifier so the server can
 * re-authenticate after a password change without the browser re-sending it.
 */

export const TOKEN_COOKIE = "cl_session";
export const IDENTIFIER_COOKIE = "cl_ident";

const FALLBACK_MAX_AGE_SECONDS = 60 * 60 * 8;

export interface CookieOptions {
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: "/";
  maxAge: number;
}

export function buildCookieOptions(expiresAt: string | null | undefined, isProduction: boolean, now = Date.now()): CookieOptions {
  let maxAge = FALLBACK_MAX_AGE_SECONDS;

  if (expiresAt) {
    const ms = Date.parse(expiresAt) - now;
    if (Number.isFinite(ms)) {
      maxAge = Math.max(0, Math.floor(ms / 1000));
    }
  }

  return { httpOnly: true, sameSite: "lax", secure: isProduction, path: "/", maxAge };
}

export interface CookieStoreLike {
  get(name: string): { value: string } | undefined;
  set(name: string, value: string, options?: Partial<CookieOptions>): unknown;
  delete?(name: string): unknown;
}

export function readToken(store: CookieStoreLike): string | null {
  return store.get(TOKEN_COOKIE)?.value || null;
}

export function readIdentifier(store: CookieStoreLike): string | null {
  return store.get(IDENTIFIER_COOKIE)?.value || null;
}

export function writeSession(store: CookieStoreLike, token: string, identifier: string, options: CookieOptions): void {
  store.set(TOKEN_COOKIE, token, options);
  store.set(IDENTIFIER_COOKIE, identifier, options);
}

export function clearSession(store: CookieStoreLike, isProduction: boolean): void {
  const expired = { httpOnly: true as const, sameSite: "lax" as const, secure: isProduction, path: "/" as const, maxAge: 0 };
  store.set(TOKEN_COOKIE, "", expired);
  store.set(IDENTIFIER_COOKIE, "", expired);
}


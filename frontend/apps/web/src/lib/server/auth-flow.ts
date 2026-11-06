/**
 * Server-side auth flows (login, logout, password change) with injectable fetch and cookies
 * so they can be unit-tested. Nothing here logs tokens, cookies or request bodies, and no
 * password or token is ever placed in a returned body.
 */
import type { ServerConfig } from "./config";
import {
  buildCookieOptions,
  clearSession,
  readIdentifier,
  readToken,
  writeSession,
  type CookieStoreLike,
} from "./session-cookie";

export interface FlowDeps {
  config: ServerConfig;
  fetchFn: typeof fetch;
  cookies: CookieStoreLike;
}

export interface FlowResult {
  status: number;
  body: Record<string, unknown>;
  retryAfter?: string | null;
}

interface UpstreamCall {
  status: number;
  ok: boolean;
  json: Record<string, unknown>;
  retryAfter: string | null;
}

const UNREACHABLE: FlowResult = {
  status: 502,
  body: { type: "about:blank", title: "Backend unreachable", status: 502 },
};

async function callBackend(
  deps: FlowDeps,
  path: string,
  method: "GET" | "POST",
  options: { body?: unknown; token?: string | null } = {}
): Promise<UpstreamCall | null> {
  const headers = new Headers({ Accept: "application/json, application/problem+json" });
  if (deps.config.tenant) headers.set("X-Tenant", deps.config.tenant);
  if (options.token) headers.set("Authorization", `Bearer ${options.token}`);
  if (options.body !== undefined) headers.set("Content-Type", "application/json");

  try {
    const response = await deps.fetchFn(`${deps.config.backendBaseUrl}/api/v1${path}`, {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      redirect: "manual",
      cache: "no-store",
    });

    let json: Record<string, unknown> = {};
    try {
      const parsed: unknown = await response.json();
      if (parsed && typeof parsed === "object") json = parsed as Record<string, unknown>;
    } catch {
      json = {};
    }

    return {
      status: response.status,
      ok: response.ok,
      json,
      retryAfter: response.headers.get("retry-after"),
    };
  } catch {
    return null;
  }
}

function problemResult(call: UpstreamCall): FlowResult {
  return {
    status: call.status,
    body: { ...call.json, retry_after: call.retryAfter ? Number(call.retryAfter) || null : undefined },
    retryAfter: call.retryAfter,
  };
}

interface LoginData {
  token?: unknown;
  expires_at?: unknown;
  must_change_password?: unknown;
  user?: unknown;
}

async function authenticate(deps: FlowDeps, identifier: string, password: string): Promise<FlowResult> {
  const call = await callBackend(deps, "/auth/login", "POST", {
    body: { identifier, password, device_name: deps.config.deviceName, client: "web" },
  });

  if (!call) return UNREACHABLE;
  if (!call.ok) return problemResult(call);

  const data = (call.json.data ?? {}) as LoginData;
  if (typeof data.token !== "string" || data.token === "") {
    return { status: 502, body: { type: "about:blank", title: "Invalid backend response", status: 502 } };
  }

  writeSession(
    deps.cookies,
    data.token,
    identifier,
    buildCookieOptions(typeof data.expires_at === "string" ? data.expires_at : null, deps.config.isProduction)
  );

  return {
    status: 200,
    body: { must_change_password: data.must_change_password === true, user: data.user ?? null },
  };
}

export function loginFlow(deps: FlowDeps, identifier: string, password: string): Promise<FlowResult> {
  return authenticate(deps, identifier, password);
}

export async function logoutFlow(deps: FlowDeps): Promise<FlowResult> {
  const token = readToken(deps.cookies);
  if (token) {
    // Best effort: the local session is cleared even if the backend call fails.
    await callBackend(deps, "/auth/logout", "POST", { token });
  }
  clearSession(deps.cookies, deps.config.isProduction);
  return { status: 200, body: { ok: true } };
}

/**
 * Change the password, then sign in again with the new password in the same request and
 * replace the cookie. The browser only ever receives { user, must_change_password }.
 */
export async function changePasswordFlow(deps: FlowDeps, currentPassword: string, newPassword: string): Promise<FlowResult> {
  const oldToken = readToken(deps.cookies);
  const identifier = readIdentifier(deps.cookies);

  if (!oldToken || !identifier) {
    return { status: 401, body: { type: "about:blank", title: "Unauthenticated", status: 401 } };
  }

  const change = await callBackend(deps, "/auth/password/change", "POST", {
    token: oldToken,
    body: { current_password: currentPassword, new_password: newPassword },
  });

  if (!change) return UNREACHABLE;

  if (change.status === 401) {
    // The backend answers a wrong current password with 401 too. Tell it apart from a dead
    // session by probing /me: a live token yields 200 (or 403 password-change-required), a dead one 401.
    const probe = await callBackend(deps, "/me", "GET", { token: oldToken });
    if (probe && probe.status !== 401) {
      return {
        status: 422,
        body: {
          type: "about:blank",
          title: "Validation failed",
          status: 422,
          errors: { current_password: ["Your current password is incorrect."] },
        },
      };
    }
    clearSession(deps.cookies, deps.config.isProduction);
    return problemResult(change);
  }

  if (!change.ok) return problemResult(change);

  const relogin = await authenticate(deps, identifier, newPassword);

  if (relogin.status !== 200) {
    // The password changed but automatic sign-in failed: end the session and ask for a manual sign-in.
    clearSession(deps.cookies, deps.config.isProduction);
    return { status: 200, body: { relogin_required: true } };
  }

  // Revoke the superseded token (best effort); the new cookie is already in place.
  await callBackend(deps, "/auth/logout", "POST", { token: oldToken });

  return relogin;
}

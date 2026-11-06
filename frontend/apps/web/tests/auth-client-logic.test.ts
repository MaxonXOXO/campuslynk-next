import { describe, it, expect, vi } from "vitest";
import {
  classifyLoginFailure,
  classifyPasswordFailure,
  isPasswordChangeRequired,
  isUnauthorized,
} from "../src/lib/auth/problem";
import { loginFailureMessage } from "../src/lib/auth/strings";
import {
  buildLoginUrl,
  guardDecision,
  resolvePostLoginRoute,
  sanitizeReturnUrl,
} from "../src/lib/auth/redirect";
import { createBrowserApiClient } from "../src/lib/auth/browser-client";

const superAdmin = { assignments: [{ role_key: "super_admin", scope_type: "institution" }] };
const faculty = { assignments: [{ role_key: "faculty", scope_type: "department" }] };

describe("login error mapping", () => {
  it("uses one generic category for 401 and 403 (no enumeration)", () => {
    expect(classifyLoginFailure({ status: 401 }).kind).toBe("invalid");
    expect(classifyLoginFailure({ status: 403 }).kind).toBe("invalid");
    expect(loginFailureMessage({ kind: "invalid" })).not.toMatch(/user|account|exist|found|inactive/i);
  });

  it("maps 429 with retry seconds, network errors, 5xx and validation", () => {
    expect(classifyLoginFailure({ status: 429, body: { retry_after: 30 } })).toEqual({ kind: "throttled", retryAfterSeconds: 30 });
    expect(classifyLoginFailure({ status: 429, body: {} })).toEqual({ kind: "throttled", retryAfterSeconds: undefined });
    expect(classifyLoginFailure({ network: true }).kind).toBe("network");
    expect(classifyLoginFailure({ status: 502 }).kind).toBe("unavailable");
    expect(classifyLoginFailure({ status: 422 }).kind).toBe("validation");
    expect(loginFailureMessage({ kind: "throttled", retryAfterSeconds: 30 })).toContain("30");
    expect(loginFailureMessage({ kind: "network" })).toMatch(/connect|reach/i);
  });
});

describe("password failure mapping", () => {
  it("maps Laravel field errors to fields", () => {
    const mapped = classifyPasswordFailure({ status: 422, body: { errors: { new_password: ["too common"], current_password: "bad" } } });
    expect(mapped.kind).toBe("fields");
    expect(mapped.fields).toEqual({ new_password: "too common", current_password: "bad" });
  });

  it("maps authentication-style rejections to a wrong current password", () => {
    expect(classifyPasswordFailure({ status: 422, body: {} }).kind).toBe("wrong_current");
    expect(classifyPasswordFailure({ status: 401 }).kind).toBe("unauthenticated");
    expect(classifyPasswordFailure({ network: true }).kind).toBe("network");
  });
});

describe("problem type detection", () => {
  it("detects password-change-required by type URI only, never by title or detail", () => {
    expect(isPasswordChangeRequired({ status: 403, type: "https://errors.example.test/password-change-required" })).toBe(true);
    expect(isPasswordChangeRequired({ status: 403, problem: { type: "/x/password-change-required" } })).toBe(true);
    expect(isPasswordChangeRequired({ status: 403, type: "about:blank", title: "Password Change Required" })).toBe(false);
    expect(isPasswordChangeRequired({ status: 401, type: "/x/password-change-required" })).toBe(false);
  });

  it("detects 401", () => {
    expect(isUnauthorized({ status: 401 })).toBe(true);
    expect(isUnauthorized({ status: 403 })).toBe(false);
  });
});

describe("return URL", () => {
  it("accepts only app-relative paths", () => {
    expect(sanitizeReturnUrl("/setup?step=calendar_basics")).toBe("/setup?step=calendar_basics");
    for (const bad of [
      "https://evil.test",
      "//evil.test",
      "/\\evil.test",
      "javascript:alert(1)",
      "/javascript:alert(1)",
      "/a%2f%2fevil",
      "/a%5cevil",
      "/login",
      "/change-password",
      "/api/session/login",
      "setup",
      "",
      null,
      undefined,
    ]) {
      expect(sanitizeReturnUrl(bad as string | null | undefined)).toBeNull();
    }
  });

  it("builds a login URL carrying an encoded return URL", () => {
    expect(buildLoginUrl("/setup?step=x")).toBe("/login?returnTo=%2Fsetup%3Fstep%3Dx");
    expect(buildLoginUrl("//evil.test")).toBe("/login");
    expect(buildLoginUrl(null)).toBe("/login");
  });
});

describe("post-login routing", () => {
  it("sends forced password change to /change-password first", () => {
    expect(resolvePostLoginRoute({ mustChangePassword: true, user: superAdmin, setupStatus: { completed_at: null } })).toBe("/change-password");
  });

  it("sends an institution super_admin to /setup until setup completes", () => {
    expect(resolvePostLoginRoute({ mustChangePassword: false, user: superAdmin, setupStatus: { completed_at: null }, returnTo: "/home" })).toBe("/setup");
    expect(resolvePostLoginRoute({ mustChangePassword: false, user: superAdmin, setupStatus: { completed_at: "2026-01-01" } })).toBe("/home");
  });

  it("never redirects other roles to setup and honours a safe return URL", () => {
    expect(resolvePostLoginRoute({ mustChangePassword: false, user: faculty, setupStatus: { completed_at: null }, returnTo: "/reports" })).toBe("/reports");
    expect(resolvePostLoginRoute({ mustChangePassword: false, user: faculty, setupStatus: null, returnTo: "https://evil.test" })).toBe("/home");
  });
});

describe("guard behaviour", () => {
  it("waits while loading", () => {
    expect(guardDecision("loading", "/setup")).toEqual({ action: "wait" });
  });

  it("redirects unauthenticated users to /login with the return URL", () => {
    expect(guardDecision("unauthenticated", "/setup", "?step=calendar_basics")).toEqual({
      action: "redirect",
      to: "/login?returnTo=%2Fsetup%3Fstep%3Dcalendar_basics",
    });
  });

  it("confines a forced-change session to /change-password", () => {
    expect(guardDecision("must_change_password", "/setup")).toEqual({ action: "redirect", to: "/change-password" });
    expect(guardDecision("must_change_password", "/change-password")).toEqual({ action: "render" });
  });

  it("renders for authenticated sessions", () => {
    expect(guardDecision("authenticated", "/setup")).toEqual({ action: "render" });
    expect(guardDecision("authenticated", "/change-password")).toEqual({ action: "render" });
  });
});

describe("browser api client", () => {
  function problemResponse(status: number, body: unknown) {
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/problem+json" } });
  }

  it("calls only the same-origin proxy with same-origin credentials and no Authorization header", async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ data: {} }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const client = createBrowserApiClient({ origin: "http://app.test", fetchFn: fetchFn as unknown as typeof fetch });

    await client.setup.status();

    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://app.test/api/proxy/api/v1/setup/status");
    expect(init.credentials).toBe("same-origin");
    expect(new Headers(init.headers).get("authorization")).toBeNull();
  });

  it("invokes the 401 hook (clear session and return to login)", async () => {
    const onUnauthorized = vi.fn();
    const fetchFn = vi.fn(async () => problemResponse(401, { status: 401, title: "Unauthenticated" }));
    const client = createBrowserApiClient({ origin: "http://app.test", fetchFn: fetchFn as unknown as typeof fetch, hooks: { onUnauthorized } });

    await expect(client.setup.status()).rejects.toMatchObject({ status: 401 });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("invokes the password-change hook only for the password-change-required type", async () => {
    const onPasswordChangeRequired = vi.fn();
    const forced = vi.fn(async () =>
      problemResponse(403, { type: "https://errors.example.test/password-change-required", status: 403 })
    );
    const wrongRole = vi.fn(async () => problemResponse(403, { type: "https://errors.example.test/forbidden", status: 403, title: "Password Change Required" }));

    const forcedClient = createBrowserApiClient({ origin: "http://app.test", fetchFn: forced as unknown as typeof fetch, hooks: { onPasswordChangeRequired } });
    await expect(forcedClient.setup.status()).rejects.toMatchObject({ status: 403 });
    expect(onPasswordChangeRequired).toHaveBeenCalledTimes(1);

    const roleClient = createBrowserApiClient({ origin: "http://app.test", fetchFn: wrongRole as unknown as typeof fetch, hooks: { onPasswordChangeRequired } });
    await expect(roleClient.setup.status()).rejects.toMatchObject({ status: 403 });
    expect(onPasswordChangeRequired).toHaveBeenCalledTimes(1);
  });
});


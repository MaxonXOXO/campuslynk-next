import { describe, it, expect, vi } from "vitest";
import { changePasswordFlow, loginFlow, logoutFlow, type FlowDeps } from "../src/lib/server/auth-flow";
import type { ServerConfig } from "../src/lib/server/config";
import { IDENTIFIER_COOKIE, TOKEN_COOKIE, type CookieStoreLike } from "../src/lib/server/session-cookie";

const PASSWORD = "Pw-SENTINEL-old-1";
const NEW_PASSWORD = "Pw-SENTINEL-new-2";
const TOKEN_A = "token-A-SENTINEL";
const TOKEN_B = "token-B-SENTINEL";

const config: ServerConfig = {
  backendBaseUrl: "http://backend.internal:8000",
  tenant: "dev",
  allowedOrigins: [],
  deviceName: "web-browser",
  isProduction: false,
};

function cookieStore(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  const sets: Array<{ name: string; value: string; options?: Record<string, unknown> }> = [];
  const store: CookieStoreLike = {
    get: (name) => (map.has(name) && map.get(name) !== "" ? { value: map.get(name) as string } : undefined),
    set: (name, value, options) => {
      sets.push({ name, value, options: options as Record<string, unknown> });
      map.set(name, value);
    },
  };
  return { store, map, sets };
}

function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
}

function loginSuccess(token: string, mustChange = false) {
  return json(200, {
    data: {
      token,
      token_type: "Bearer",
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
      must_change_password: mustChange,
      user: { id: "01U", name: "Admin", email: "admin@dev.test" },
    },
  });
}

function deps(fetchFn: unknown, cookies: CookieStoreLike): FlowDeps {
  return { config, fetchFn: fetchFn as typeof fetch, cookies };
}

describe("login flow", () => {
  it("sends client=web and a server-set device_name, tenant header, and stores the token httpOnly", async () => {
    const fetchFn = vi.fn(async () => loginSuccess(TOKEN_A, true));
    const { store, sets } = cookieStore();

    const result = await loginFlow(deps(fetchFn, store), "admin@dev.test", PASSWORD);

    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://backend.internal:8000/api/v1/auth/login");
    expect(JSON.parse(init.body as string)).toEqual({
      identifier: "admin@dev.test",
      password: PASSWORD,
      device_name: "web-browser",
      client: "web",
    });
    expect(new Headers(init.headers).get("x-tenant")).toBe("dev");

    expect(result.status).toBe(200);
    expect(result.body.must_change_password).toBe(true);
    expect(sets.find((s) => s.name === TOKEN_COOKIE)?.options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
    expect(sets.find((s) => s.name === IDENTIFIER_COOKIE)?.value).toBe("admin@dev.test");
  });

  it("never returns the token or password to the browser", async () => {
    const fetchFn = vi.fn(async () => loginSuccess(TOKEN_A));
    const { store } = cookieStore();
    const result = await loginFlow(deps(fetchFn, store), "admin@dev.test", PASSWORD);
    const serialised = JSON.stringify(result);
    expect(serialised).not.toContain(TOKEN_A);
    expect(serialised).not.toContain(PASSWORD);
  });

  it("passes problem bodies through on failure and exposes retry_after for 429", async () => {
    const fetchFn = vi.fn(async () =>
      json(429, { type: "about:blank", title: "Too Many Requests", status: 429 }, { "Retry-After": "42" })
    );
    const { store, sets } = cookieStore();
    const result = await loginFlow(deps(fetchFn, store), "x", "y");
    expect(result.status).toBe(429);
    expect(result.body.retry_after).toBe(42);
    expect(sets).toHaveLength(0);
  });

  it("returns 502 when the backend is unreachable", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error("boom");
    });
    const { store } = cookieStore();
    const result = await loginFlow(deps(fetchFn, store), "x", "y");
    expect(result.status).toBe(502);
  });
});

describe("password change flow", () => {
  it("changes the password then logs in again in the same request and replaces the cookie", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchFn = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      if (url.endsWith("/auth/password/change")) return json(200, { data: { message: "ok" } });
      if (url.endsWith("/auth/login")) return loginSuccess(TOKEN_B);
      return json(200, { data: {} });
    });
    const { store, map } = cookieStore({ [TOKEN_COOKIE]: TOKEN_A, [IDENTIFIER_COOKIE]: "admin@dev.test" });

    const result = await changePasswordFlow(deps(fetchFn, store), PASSWORD, NEW_PASSWORD);

    expect(calls.map((c) => c.url.replace(config.backendBaseUrl, ""))).toEqual([
      "/api/v1/auth/password/change",
      "/api/v1/auth/login",
      "/api/v1/auth/logout",
    ]);
    expect(new Headers(calls[0]!.init.headers).get("authorization")).toBe(`Bearer ${TOKEN_A}`);
    expect(JSON.parse(calls[1]!.init.body as string)).toMatchObject({
      identifier: "admin@dev.test",
      password: NEW_PASSWORD,
      client: "web",
    });
    expect(new Headers(calls[2]!.init.headers).get("authorization")).toBe(`Bearer ${TOKEN_A}`);

    expect(map.get(TOKEN_COOKIE)).toBe(TOKEN_B);
    expect(result.status).toBe(200);
    expect(result.body.must_change_password).toBe(false);

    const serialised = JSON.stringify(result);
    for (const secret of [PASSWORD, NEW_PASSWORD, TOKEN_A, TOKEN_B]) {
      expect(serialised).not.toContain(secret);
    }
  });

  it("maps server validation errors without touching the session", async () => {
    const fetchFn = vi.fn(async () =>
      json(422, { title: "Validation", status: 422, errors: { new_password: ["too common"] } })
    );
    const { store, map } = cookieStore({ [TOKEN_COOKIE]: TOKEN_A, [IDENTIFIER_COOKIE]: "a@b.test" });

    const result = await changePasswordFlow(deps(fetchFn, store), PASSWORD, NEW_PASSWORD);

    expect(result.status).toBe(422);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(map.get(TOKEN_COOKIE)).toBe(TOKEN_A);
    expect(JSON.stringify(result)).not.toContain(NEW_PASSWORD);
  });

  it("treats a 401 from the change call as a wrong current password when the session is still valid", async () => {
    const fetchFn = vi.fn(async (url: string) => {
      if (url.endsWith("/auth/password/change")) return json(401, { status: 401, detail: "irrelevant" });
      // Forced-change token: /me is 403 password-change-required, which proves the token is alive.
      return json(403, { status: 403, type: "https://errors.example.test/password-change-required" });
    });
    const { store, map } = cookieStore({ [TOKEN_COOKIE]: TOKEN_A, [IDENTIFIER_COOKIE]: "a@b.test" });

    const result = await changePasswordFlow(deps(fetchFn, store), PASSWORD, NEW_PASSWORD);

    expect(result.status).toBe(422);
    expect(result.body.errors).toEqual({ current_password: ["Your current password is incorrect."] });
    expect(map.get(TOKEN_COOKIE)).toBe(TOKEN_A);
  });

  it("clears the session when the change call is 401 and the token is really dead", async () => {
    const fetchFn = vi.fn(async () => json(401, { status: 401 }));
    const { store, map } = cookieStore({ [TOKEN_COOKIE]: TOKEN_A, [IDENTIFIER_COOKIE]: "a@b.test" });

    const result = await changePasswordFlow(deps(fetchFn, store), PASSWORD, NEW_PASSWORD);

    expect(result.status).toBe(401);
    expect(map.get(TOKEN_COOKIE)).toBe("");
  });

  it("asks for a manual sign-in if the automatic re-login fails after a successful change", async () => {
    const fetchFn = vi.fn(async (url: string) =>
      url.endsWith("/auth/password/change") ? json(200, { data: {} }) : json(401, { status: 401 })
    );
    const { store, map } = cookieStore({ [TOKEN_COOKIE]: TOKEN_A, [IDENTIFIER_COOKIE]: "a@b.test" });

    const result = await changePasswordFlow(deps(fetchFn, store), PASSWORD, NEW_PASSWORD);

    expect(result.body).toEqual({ relogin_required: true });
    expect(map.get(TOKEN_COOKIE)).toBe("");
  });

  it("returns 401 without calling the backend when there is no session", async () => {
    const fetchFn = vi.fn();
    const { store } = cookieStore();
    const result = await changePasswordFlow(deps(fetchFn, store), PASSWORD, NEW_PASSWORD);
    expect(result.status).toBe(401);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe("logout flow", () => {
  it("clears the session even when the backend call fails", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error("down");
    });
    const { store, map } = cookieStore({ [TOKEN_COOKIE]: TOKEN_A, [IDENTIFIER_COOKIE]: "a@b.test" });

    const result = await logoutFlow(deps(fetchFn, store));

    expect(result.status).toBe(200);
    expect(map.get(TOKEN_COOKIE)).toBe("");
    expect(map.get(IDENTIFIER_COOKIE)).toBe("");
  });
});

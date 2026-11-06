import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { handleProxyRequest } from "../src/lib/server/proxy-handler";

const SECRET_TOKEN = "tok-SECRET-123";

function upstreamOk() {
  return vi.fn(async (_url: string, _init?: RequestInit) =>
    new Response(JSON.stringify({ data: { ok: true } }), { status: 200, headers: { "Content-Type": "application/json" } })
  );
}

describe("proxy handler", () => {
  const logs: unknown[][] = [];
  const spies: Array<ReturnType<typeof vi.spyOn>> = [];

  beforeEach(() => {
    process.env.BACKEND_BASE_URL = "http://backend.internal:8000";
    process.env.TENANT_SLUG = "dev";
    logs.length = 0;
    for (const method of ["log", "info", "warn", "error", "debug"] as const) {
      spies.push(vi.spyOn(console, method).mockImplementation((...args: unknown[]) => void logs.push(args)));
    }
  });

  afterEach(() => {
    spies.splice(0).forEach((s) => s.mockRestore());
    delete process.env.BACKEND_BASE_URL;
    delete process.env.TENANT_SLUG;
  });

  it("attaches the cookie token and server tenant, ignoring client-supplied credentials", async () => {
    const fetchFn = upstreamOk();
    const request = new Request("http://app.test/api/proxy/api/v1/setup/status", {
      headers: {
        Cookie: `cl_session=${SECRET_TOKEN}; other=1`,
        Authorization: "Bearer client-forged",
        "X-Tenant": "forged",
        Host: "evil.test",
      },
    });

    const response = await handleProxyRequest(request, fetchFn as unknown as typeof fetch);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe("http://backend.internal:8000/api/v1/setup/status");
    const headers = new Headers(init?.headers);
    expect(headers.get("authorization")).toBe(`Bearer ${SECRET_TOKEN}`);
    expect(headers.get("x-tenant")).toBe("dev");
    expect(headers.get("cookie")).toBeNull();
    expect(init?.redirect).toBe("manual");
  });

  it("decodes percent-encoded cookie values (Sanctum tokens contain a pipe)", async () => {
    const fetchFn = upstreamOk();
    await handleProxyRequest(
      new Request("http://app.test/api/proxy/api/v1/me", { headers: { Cookie: "cl_session=12%7Cabcdef" } }),
      fetchFn as unknown as typeof fetch
    );
    const [, init] = fetchFn.mock.calls[0]!;
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer 12|abcdef");
  });

  it("rejects traversal and non-api paths without calling the backend", async () => {
    const fetchFn = upstreamOk();
    for (const path of ["/api/proxy/api/v1/%2e%2e/up", "/api/proxy/up", "/api/proxy/api/v1/auth/login"]) {
      const response = await handleProxyRequest(new Request(`http://app.test${path}`), fetchFn as unknown as typeof fetch);
      expect([400, 403]).toContain(response.status);
    }
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("rejects mutating requests with a foreign or missing Origin", async () => {
    const fetchFn = upstreamOk();
    const url = "http://app.test/api/proxy/api/v1/setup/steps/calendar_basics";

    const foreign = await handleProxyRequest(
      new Request(url, { method: "PUT", headers: { Origin: "https://evil.test", Host: "app.test" }, body: "{}" }),
      fetchFn as unknown as typeof fetch
    );
    const missing = await handleProxyRequest(new Request(url, { method: "PUT", body: "{}" }), fetchFn as unknown as typeof fetch);

    expect(foreign.status).toBe(403);
    expect(missing.status).toBe(403);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("forwards same-origin mutating requests with their body", async () => {
    const fetchFn = upstreamOk();
    const response = await handleProxyRequest(
      new Request("http://app.test/api/proxy/api/v1/setup/complete", {
        method: "POST",
        headers: { Origin: "http://app.test", Host: "app.test", "Content-Type": "application/json" },
        body: JSON.stringify({ a: 1 }),
      }),
      fetchFn as unknown as typeof fetch
    );
    expect(response.status).toBe(200);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("returns 502 when the backend is unreachable, without leaking details", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error("connect ECONNREFUSED secret-host");
    });
    const response = await handleProxyRequest(
      new Request("http://app.test/api/proxy/api/v1/me", { headers: { Cookie: `cl_session=${SECRET_TOKEN}` } }),
      fetchFn as unknown as typeof fetch
    );
    const text = await response.text();
    expect(response.status).toBe(502);
    expect(text).not.toContain("secret-host");
    expect(text).not.toContain(SECRET_TOKEN);
  });

  it("never logs tokens, cookies or bodies", async () => {
    const fetchFn = upstreamOk();
    await handleProxyRequest(
      new Request("http://app.test/api/proxy/api/v1/me", { headers: { Cookie: `cl_session=${SECRET_TOKEN}` } }),
      fetchFn as unknown as typeof fetch
    );
    expect(JSON.stringify(logs)).not.toContain(SECRET_TOKEN);
    expect(logs).toHaveLength(0);
  });
});

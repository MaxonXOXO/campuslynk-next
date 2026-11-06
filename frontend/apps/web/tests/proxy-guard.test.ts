import { describe, it, expect } from "vitest";
import {
  ProxyRejection,
  buildUpstreamHeaders,
  extractProxyPath,
  filterResponseHeaders,
  isOriginAllowed,
  resolveProxyTarget,
} from "../src/lib/server/proxy-guard";

const BASE = "http://localhost:8000";

function reject(path: string, base = BASE): ProxyRejection {
  try {
    resolveProxyTarget(path, base);
  } catch (error) {
    expect(error).toBeInstanceOf(ProxyRejection);
    return error as ProxyRejection;
  }
  throw new Error(`Expected rejection for ${path}`);
}

describe("proxy path rules", () => {
  it("forwards /api/v1 paths to the configured backend only", () => {
    const url = resolveProxyTarget("/api/v1/setup/status?x=1", BASE);
    expect(url.origin).toBe(BASE);
    expect(url.pathname).toBe("/api/v1/setup/status");
    expect(url.search).toBe("?x=1");
  });

  it("keeps a configured backend base path", () => {
    const url = resolveProxyTarget("/api/v1/me", "https://backend.internal/prefix");
    expect(url.toString()).toBe("https://backend.internal/prefix/api/v1/me");
  });

  it("rejects paths outside /api/v1", () => {
    for (const p of ["/up", "/api/v2/me", "/api/v1", "/other/api/v1/me", "api/v1/me", ""]) {
      expect(reject(p).status).toBe(400);
    }
  });

  it("rejects absolute and protocol-relative URLs", () => {
    for (const p of [
      "http://evil.test/api/v1/me",
      "//evil.test/api/v1/me",
      "/api/v1//evil.test/x",
      "/api/v1/http://evil.test",
      "/api/v1/x%3A%2F%2Fevil",
    ]) {
      reject(p);
    }
  });

  it("rejects dot segments and encoded variants", () => {
    for (const p of [
      "/api/v1/../../etc/passwd",
      "/api/v1/setup/..%2f..%2fup",
      "/api/v1/%2e%2e/up",
      "/api/v1/%2E%2E/up",
      "/api/v1/setup/%2e%2e%2fup",
      "/api/v1/./me",
      "/api/v1/%252e%252e/up",
      "/api/v1/%252e%252e%252fup",
    ]) {
      reject(p);
    }
  });

  it("rejects backslashes, control characters and malformed encoding", () => {
    for (const p of ["/api/v1/a\\b", "/api/v1/a%5Cb", "/api/v1/a%00b", "/api/v1/a%0Ab", "/api/v1/%E0%A4%A"]) {
      reject(p);
    }
  });

  it("does not expose auth endpoints (client and device_name are server-set)", () => {
    for (const p of ["/api/v1/auth/login", "/api/v1/auth/logout", "/api/v1/auth/password/change", "/api/v1/AUTH/login", "/api/v1/%61uth/login"]) {
      expect(reject(p).status).toBe(403);
    }
  });

  it("extracts the raw path after the proxy prefix", () => {
    expect(extractProxyPath("http://app.test/api/proxy/api/v1/me?a=b")).toBe("/api/v1/me?a=b");
    expect(() => extractProxyPath("http://app.test/other")).toThrow(ProxyRejection);
  });
});

describe("proxy header rules", () => {
  it("drops client-supplied Authorization, X-Tenant, Host and Cookie, and sets its own", () => {
    const incoming = new Headers({
      Authorization: "Bearer client-token",
      "X-Tenant": "other",
      Host: "evil.test",
      Cookie: "cl_session=secret",
      "X-Forwarded-Host": "evil.test",
      "Content-Type": "application/json",
      Accept: "application/json",
    });

    const out = buildUpstreamHeaders(incoming, { token: "server-token", tenant: "dev" });

    expect(out.get("authorization")).toBe("Bearer server-token");
    expect(out.get("x-tenant")).toBe("dev");
    expect(out.get("host")).toBeNull();
    expect(out.get("cookie")).toBeNull();
    expect(out.get("x-forwarded-host")).toBeNull();
    expect(out.get("content-type")).toBe("application/json");
  });

  it("always asks the backend for JSON, whatever Accept the client sent", () => {
    for (const accept of ["*/*", "text/html", ""]) {
      const out = buildUpstreamHeaders(new Headers(accept ? { Accept: accept } : {}), {});
      expect(out.get("accept")).toBe("application/json, application/problem+json");
    }
  });

  it("sends no Authorization or X-Tenant when the server has none", () => {
    const out = buildUpstreamHeaders(new Headers({ Authorization: "Bearer x", "X-Tenant": "y" }), {});
    expect(out.get("authorization")).toBeNull();
    expect(out.get("x-tenant")).toBeNull();
  });

  it("filters response headers (no Set-Cookie passthrough) and disables caching", () => {
    const out = filterResponseHeaders(
      new Headers({ "Set-Cookie": "a=b", "Content-Type": "application/json", "Retry-After": "5", "X-Powered-By": "PHP" })
    );
    expect(out.get("set-cookie")).toBeNull();
    expect(out.get("x-powered-by")).toBeNull();
    expect(out.get("retry-after")).toBe("5");
    expect(out.get("cache-control")).toBe("no-store");
  });
});

describe("origin check for mutating requests", () => {
  it("allows safe methods without an Origin", () => {
    expect(isOriginAllowed({ method: "GET", origin: null, host: "app.test" })).toBe(true);
  });

  it("rejects mutating requests with a missing or foreign Origin", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(isOriginAllowed({ method, origin: null, host: "app.test" })).toBe(false);
      expect(isOriginAllowed({ method, origin: "https://evil.test", host: "app.test" })).toBe(false);
      expect(isOriginAllowed({ method, origin: "not a url", host: "app.test" })).toBe(false);
    }
  });

  it("allows a matching host or an allow-listed origin", () => {
    expect(isOriginAllowed({ method: "POST", origin: "http://localhost:3000", host: "localhost:3000" })).toBe(true);
    expect(
      isOriginAllowed({ method: "POST", origin: "https://portal.test", host: "internal:3000", allowedOrigins: ["https://portal.test"] })
    ).toBe(true);
  });
});

// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AVATAR_MAX_BYTES,
  handleAvatarDelete,
  handleAvatarUpload,
  handleUserAvatarGet,
} from "../src/lib/server/avatar-proxy";
import { TOKEN_COOKIE } from "../src/lib/server/session-cookie";

describe("avatar-proxy BFF handlers", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.BACKEND_BASE_URL = "http://api.local:8000";
    process.env.TENANT_SLUG = "tenant_demo";
    process.env.APP_ALLOWED_ORIGINS = "http://localhost:3000";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("rejects unauthenticated avatar upload with 401", async () => {
    const req = new Request("http://localhost:3000/api/session/avatar", {
      method: "POST",
      headers: {
        origin: "http://localhost:3000",
        host: "localhost:3000",
      },
    });

    const res = await handleAvatarUpload(req);
    expect(res.status).toBe(401);
  });

  it("rejects foreign-origin avatar upload with 403", async () => {
    const req = new Request("http://localhost:3000/api/session/avatar", {
      method: "POST",
      headers: {
        origin: "https://evil.example",
        host: "localhost:3000",
        cookie: `${TOKEN_COOKIE}=tok_123`,
      },
    });

    const res = await handleAvatarUpload(req);
    expect(res.status).toBe(403);
  });

  it("enforces the 5 MB cap on the BFF before forwarding", async () => {
    const bigBlob = new Blob([new Uint8Array(AVATAR_MAX_BYTES + 1)], { type: "image/png" });
    const form = new FormData();
    form.append("avatar", bigBlob, "huge.png");

    const fetchSpy = vi.fn();
    const req = new Request("http://localhost:3000/api/session/avatar", {
      method: "POST",
      headers: {
        origin: "http://localhost:3000",
        host: "localhost:3000",
        cookie: `${TOKEN_COOKIE}=tok_123`,
      },
      body: form,
    });

    const res = await handleAvatarUpload(req, fetchSpy as unknown as typeof fetch);
    expect(res.status).toBe(422);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("forwards valid multipart avatar upload with Bearer token and X-Tenant", async () => {
    const blob = new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" });
    const form = new FormData();
    form.append("avatar", blob, "avatar.png");

    const fetchSpy = vi.fn(async () =>
      new Response(JSON.stringify({ data: { id: "01U1", avatar_url: "/api/v1/users/01U1/avatar" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );

    const req = new Request("http://localhost:3000/api/session/avatar", {
      method: "POST",
      headers: {
        origin: "http://localhost:3000",
        host: "localhost:3000",
        cookie: `${TOKEN_COOKIE}=tok_123`,
      },
      body: form,
    });

    const res = await handleAvatarUpload(req, fetchSpy as unknown as typeof fetch);
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://api.local:8000/api/v1/me/avatar");
    expect(init.method).toBe("POST");
    const headers = init.headers as Headers;
    expect(headers.get("authorization")).toBe("Bearer tok_123");
    expect(headers.get("x-tenant")).toBe("tenant_demo");
  });

  it("forwards avatar delete with Bearer token", async () => {
    const fetchSpy = vi.fn(async () =>
      new Response(JSON.stringify({ data: { id: "01U1", avatar_url: null } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );

    const req = new Request("http://localhost:3000/api/session/avatar", {
      method: "DELETE",
      headers: {
        origin: "http://localhost:3000",
        host: "localhost:3000",
        cookie: `${TOKEN_COOKIE}=tok_123`,
      },
    });

    const res = await handleAvatarDelete(req, fetchSpy as unknown as typeof fetch);
    expect(res.status).toBe(200);
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://api.local:8000/api/v1/me/avatar");
    expect(init.method).toBe("DELETE");
  });

  it("rejects invalid user IDs and unauthenticated GETs, and proxies image with nosniff and 304", async () => {
    const badReq = new Request("http://localhost:3000/api/session/users/bad/avatar", {
      headers: { cookie: `${TOKEN_COOKIE}=tok_123` },
    });
    expect((await handleUserAvatarGet(badReq, "../etc")).status).toBe(400);

    const unauthReq = new Request("http://localhost:3000/api/session/users/01U1/avatar");
    expect((await handleUserAvatarGet(unauthReq, "01U1")).status).toBe(401);

    const fetchSpy = vi.fn(async () =>
      new Response(null, {
        status: 304,
        headers: { etag: '"abc-thumb"', "cache-control": "private, max-age=300" },
      })
    );

    const conditionalReq = new Request("http://localhost:3000/api/session/users/01U1/avatar", {
      headers: {
        cookie: `${TOKEN_COOKIE}=tok_123`,
        "if-none-match": '"abc-thumb"',
      },
    });

    const res = await handleUserAvatarGet(conditionalReq, "01U1", fetchSpy as unknown as typeof fetch);
    expect(res.status).toBe(304);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://api.local:8000/api/v1/users/01U1/avatar");
    expect((init.headers as Headers).get("if-none-match")).toBe('"abc-thumb"');
  });
});


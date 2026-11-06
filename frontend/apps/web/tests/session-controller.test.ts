import { describe, it, expect, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  SessionController,
  SessionHttpError,
  type SessionApi,
  type SessionUser,
} from "../src/lib/auth/session-core";

const superAdmin: SessionUser = {
  id: "01U",
  name: "Admin",
  must_change_password: false,
  assignments: [{ role_key: "super_admin", scope_type: "institution" }],
};
const faculty: SessionUser = { id: "02U", name: "F", assignments: [{ role_key: "faculty", scope_type: "department" }] };

function setup(overrides: Partial<SessionApi> = {}, location = "/setup?step=calendar_basics") {
  const api: SessionApi = {
    login: vi.fn(async () => ({ must_change_password: false, user: superAdmin })),
    logout: vi.fn(async () => undefined),
    changePassword: vi.fn(async () => ({ must_change_password: false, user: superAdmin })),
    fetchMe: vi.fn(async () => superAdmin),
    fetchSetupStatus: vi.fn(async () => ({ completed_at: null })),
    ...overrides,
  };
  const navigate = vi.fn();
  const controller = new SessionController({ api, navigate, currentLocation: () => location });
  return { api, navigate, controller };
}

describe("session bootstrap", () => {
  it("becomes authenticated from /me", async () => {
    const { controller } = setup();
    await controller.bootstrap();
    expect(controller.getState().status).toBe("authenticated");
    expect(controller.getState().user?.name).toBe("Admin");
  });

  it("is unauthenticated on 401", async () => {
    const { controller } = setup({ fetchMe: vi.fn(async () => { throw { status: 401 }; }) });
    await controller.bootstrap();
    expect(controller.getState().status).toBe("unauthenticated");
  });

  it("treats a restricted token (password-change-required type) as go-to-change-password on reload", async () => {
    const { controller } = setup({
      fetchMe: vi.fn(async () => { throw { status: 403, type: "https://errors.example.test/password-change-required" }; }),
    });
    await controller.bootstrap();
    expect(controller.getState().status).toBe("must_change_password");
  });

  it("surfaces transient failures as an error state, not a logout", async () => {
    const { controller } = setup({ fetchMe: vi.fn(async () => { throw { status: 502 }; }) });
    await controller.bootstrap();
    expect(controller.getState().status).toBe("error");
  });
});

describe("login flow", () => {
  it("routes a forced change from the login response without calling /me", async () => {
    const { controller, api } = setup({ login: vi.fn(async () => ({ must_change_password: true, user: superAdmin })) });
    const outcome = await controller.login("admin@dev.test", "pw");
    expect(outcome).toEqual({ ok: true, route: "/change-password" });
    expect(controller.getState().status).toBe("must_change_password");
    expect(api.fetchMe).not.toHaveBeenCalled();
  });

  it("sends an institution super_admin to /setup while setup is incomplete", async () => {
    const { controller } = setup();
    expect(await controller.login("a", "b", "/home")).toEqual({ ok: true, route: "/setup" });
    expect(controller.getState().status).toBe("authenticated");
  });

  it("sends a completed-setup super_admin to the return URL", async () => {
    const { controller } = setup({ fetchSetupStatus: vi.fn(async () => ({ completed_at: "2026-01-01T00:00:00Z" })) });
    expect(await controller.login("a", "b", "/reports")).toEqual({ ok: true, route: "/reports" });
  });

  it("sends other roles to the placeholder home and never calls /setup/status", async () => {
    const { controller, api } = setup({ fetchMe: vi.fn(async () => faculty) });
    expect(await controller.login("a", "b")).toEqual({ ok: true, route: "/home" });
    expect(api.fetchSetupStatus).not.toHaveBeenCalled();
  });

  it("ignores an unsafe return URL", async () => {
    const { controller } = setup({ fetchMe: vi.fn(async () => faculty) });
    expect(await controller.login("a", "b", "https://evil.test")).toEqual({ ok: true, route: "/home" });
  });

  it("maps failures: invalid, throttled with seconds, and network", async () => {
    const invalid = setup({ login: vi.fn(async () => { throw new SessionHttpError({ status: 401, body: {} }); }) });
    expect(await invalid.controller.login("a", "b")).toEqual({ ok: false, failure: { kind: "invalid" } });

    const throttled = setup({ login: vi.fn(async () => { throw new SessionHttpError({ status: 429, body: { retry_after: 12 } }); }) });
    expect(await throttled.controller.login("a", "b")).toEqual({ ok: false, failure: { kind: "throttled", retryAfterSeconds: 12 } });

    const network = setup({ login: vi.fn(async () => { throw new SessionHttpError({ network: true }); }) });
    expect(await network.controller.login("a", "b")).toEqual({ ok: false, failure: { kind: "network" } });
    expect(network.controller.getState().status).toBe("loading");
  });
});

describe("401 handling", () => {
  it("clears the session and returns to /login with the return URL", async () => {
    const { controller, navigate, api } = setup();
    await controller.bootstrap();

    controller.handleUnauthorized();

    expect(controller.getState()).toEqual({ status: "unauthenticated", user: null });
    expect(api.logout).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith("/login?returnTo=%2Fsetup%3Fstep%3Dcalendar_basics");
  });

  it("is idempotent and does not loop when already signed out", async () => {
    const { controller, navigate } = setup();
    await controller.bootstrap();
    controller.handleUnauthorized();
    controller.handleUnauthorized();
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it("does not navigate away from /login (keeps the return URL)", async () => {
    const { controller, navigate } = setup({}, "/login?returnTo=%2Fsetup");
    await controller.bootstrap();
    controller.handleUnauthorized();
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe("forced password change flow", () => {
  it("lands in the app after a change without asking for the password again", async () => {
    const { controller, api } = setup({ login: vi.fn(async () => ({ must_change_password: true, user: superAdmin })) });
    await controller.login("a", "old");

    const outcome = await controller.changePassword("old", "new-strong-pass");

    expect(api.changePassword).toHaveBeenCalledWith("old", "new-strong-pass");
    expect(outcome).toEqual({ ok: true, route: "/setup" });
    expect(controller.getState().status).toBe("authenticated");
  });

  it("returns to /login when the server could not re-authenticate", async () => {
    const { controller } = setup({ changePassword: vi.fn(async () => ({ relogin_required: true })) });
    expect(await controller.changePassword("old", "new")).toEqual({ ok: true, route: "/login" });
    expect(controller.getState().status).toBe("unauthenticated");
  });

  it("maps server field errors and keeps the session", async () => {
    const { controller } = setup({
      changePassword: vi.fn(async () => { throw new SessionHttpError({ status: 422, body: { errors: { new_password: ["too common"] } } }); }),
      login: vi.fn(async () => ({ must_change_password: true, user: superAdmin })),
    });
    await controller.login("a", "b");
    const outcome = await controller.changePassword("old", "new");
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error.fields.new_password).toBe("too common");
    expect(controller.getState().status).toBe("must_change_password");
  });

  it("clears the session when the change call is unauthenticated", async () => {
    const { controller } = setup({ changePassword: vi.fn(async () => { throw new SessionHttpError({ status: 401 }); }) });
    await controller.changePassword("old", "new");
    expect(controller.getState().status).toBe("unauthenticated");
  });
});

describe("logout", () => {
  it("calls the endpoint, clears the session and navigates to /login", async () => {
    const { controller, api, navigate } = setup();
    await controller.bootstrap();
    await controller.logout();
    expect(api.logout).toHaveBeenCalledTimes(1);
    expect(controller.getState().status).toBe("unauthenticated");
    expect(navigate).toHaveBeenCalledWith("/login");
  });
});

describe("secret hygiene", () => {
  const roots = ["../src/lib/auth", "../src/lib/server", "../src/app/api", "../src/app/login", "../src/app/change-password"];

  function files(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = path.join(dir, e.name);
      return e.isDirectory() ? files(full) : /\.tsx?$/.test(e.name) ? [full] : [];
    });
  }

  it("auth and proxy code never logs and never touches web storage", () => {
    const offenders: string[] = [];
    for (const root of roots) {
      for (const file of files(path.resolve(__dirname, root))) {
        const text = fs.readFileSync(file, "utf-8");
        if (/console\.\w+\(/.test(text) || /localStorage|sessionStorage/.test(text)) offenders.push(path.relative(__dirname, file));
      }
    }
    expect(offenders).toEqual([]);
  });

  it("no code path puts credentials in a URL", () => {
    for (const root of roots) {
      for (const file of files(path.resolve(__dirname, root))) {
        const text = fs.readFileSync(file, "utf-8");
        expect(text).not.toMatch(/[?&](token|password)=/i);
      }
    }
  });
});


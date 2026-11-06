import { describe, it, expect } from "vitest";
import realMeFixture from "./fixtures/me-super-admin.json";
import {
  isSuperAdminAtInstitutionScope,
  shouldRedirectToSetup,
} from "../src/app/setup/logic/role-routing";
import {
  guardDecision,
  resolvePostLoginRoute,
  SETUP_PATH,
  HOME_PATH,
} from "../src/lib/auth/redirect";

describe("Real /me Bootstrap Super Admin Fixture", () => {
  const meData = realMeFixture.data;

  it("matches expected /me contract shape without mismatch", () => {
    expect(meData.id).toBeDefined();
    expect(meData.type).toBe("staff");
    expect(meData.email).toBe("admin@dev.test");
    expect(meData.status).toBe("active");
    expect(Array.isArray(meData.assignments)).toBe(true);
    expect(meData.assignments.length).toBeGreaterThan(0);

    const assignment = meData.assignments[0];
    expect(assignment).toBeDefined();
    expect(assignment?.role_key).toBe("super_admin");
    expect(assignment?.scope_type).toBe("institution");
    expect(assignment?.scope_label).toBe("i_dev");
    expect(Array.isArray(meData.capabilities)).toBe(true);
    expect(meData.capabilities).toContain("organisation.stream.manage");
    expect(meData.capabilities).toContain("organisation.department.manage");
    expect(meData.capabilities).toContain("organisation.academic_calendar.manage");
  });

  it("identifies bootstrap user as super_admin at institution scope", () => {
    expect(isSuperAdminAtInstitutionScope(meData)).toBe(true);
  });

  it("routes to /setup when setup is not completed", () => {
    const uncompletedSetup = { completed_at: null };
    expect(shouldRedirectToSetup(meData, uncompletedSetup)).toBe(true);

    const postLoginRoute = resolvePostLoginRoute({
      mustChangePassword: false,
      user: meData,
      setupStatus: uncompletedSetup,
    });
    expect(postLoginRoute).toBe(SETUP_PATH);
  });

  it("allows access to /setup under auth guard for authenticated bootstrap admin", () => {
    const decision = guardDecision("authenticated", SETUP_PATH, "");
    expect(decision).toEqual({ action: "render" });
  });

  it("routes to /home when setup has already been completed", () => {
    const completedSetup = { completed_at: "2026-11-06T15:30:00Z" };
    expect(shouldRedirectToSetup(meData, completedSetup)).toBe(false);

    const postLoginRoute = resolvePostLoginRoute({
      mustChangePassword: false,
      user: meData,
      setupStatus: completedSetup,
    });
    expect(postLoginRoute).toBe(HOME_PATH);
  });
});

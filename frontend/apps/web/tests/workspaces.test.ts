import { describe, it, expect } from "vitest";
import {
  computeWorkspaces,
  getInstitutionScopeLabel,
  getLandingRoute,
  getLandingWorkspace,
  hasWorkspaceAccess,
  isWorkspaceSlug,
} from "../src/lib/workspaces/workspaces";
import { WORKSPACE_NAV } from "../src/lib/workspaces/navigation";
import { resolvePostLoginRoute } from "../src/lib/auth/redirect";

describe("Workspace Computation from /me assignments", () => {
  it("computes a single workspace for single-role users", () => {
    const superAdmin = computeWorkspaces({
      assignments: [{ role_key: "super_admin", scope_type: "institution", scope_label: "i_carmel" }],
    });
    expect(superAdmin.map((w) => w.slug)).toEqual(["super-admin"]);

    const lecturer = computeWorkspaces({
      assignments: [{ role_key: "lecturer", scope_type: "department", scope_label: "d_me" }],
    });
    expect(lecturer.map((w) => w.slug)).toEqual(["teaching"]);

    const student = computeWorkspaces({
      assignments: [{ role_key: "student", scope_type: "own", scope_label: "own_01" }],
    });
    expect(student.map((w) => w.slug)).toEqual(["student"]);
  });

  it("computes deduplicated workspaces sorted by highest authority for multi-role users", () => {
    const principalWhoTeaches = {
      assignments: [
        { role_key: "lecturer", scope_type: "department", scope_label: "d_cse" },
        { role_key: "course_teacher", scope_type: "course_offering", scope_label: "co_101" },
        { role_key: "principal", scope_type: "institution", scope_label: "i_dev" },
      ],
    };

    const computed = computeWorkspaces(principalWhoTeaches);
    expect(computed.map((w) => w.slug)).toEqual(["principal", "teaching"]);
    expect(computed[1]?.assignments).toHaveLength(2);
    expect(getLandingWorkspace(principalWhoTeaches)?.slug).toBe("principal");
    expect(getLandingRoute(principalWhoTeaches)).toBe("/w/principal");

    const hodTutorLecturer = {
      assignments: [
        { role_key: "lecturer", scope_type: "department", scope_label: "d_me" },
        { role_key: "tutor", scope_type: "batch", scope_label: "b_2026_me" },
        { role_key: "hod", scope_type: "department", scope_label: "d_me" },
      ],
    };

    expect(computeWorkspaces(hodTutorLecturer).map((w) => w.slug)).toEqual([
      "hod",
      "tutor-mentor",
      "teaching",
    ]);
    expect(getLandingWorkspace(hodTutorLecturer)?.slug).toBe("hod");
  });

  it("excludes inactive, expired, future, deferred (chairman), and dropped (admin) assignments", () => {
    const now = new Date("2026-11-21T12:00:00Z");
    const user = {
      assignments: [
        { role_key: "super_admin", scope_type: "institution", is_active: false },
        { role_key: "principal", scope_type: "institution", valid_to: "2026-11-01T00:00:00Z" },
        { role_key: "hod", scope_type: "department", valid_from: "2026-12-01T00:00:00Z" },
        { role_key: "chairman", scope_type: "institution" },
        { role_key: "admin", scope_type: "institution" },
      ],
    };

    expect(computeWorkspaces(user, now)).toEqual([]);
    expect(getLandingWorkspace(user, now)).toBeNull();
    expect(getLandingRoute(user, now)).toBe("/home");
  });

  it("validates workspace slugs and user membership", () => {
    const hodOnly = {
      assignments: [{ role_key: "hod", scope_type: "department", scope_label: "d_ce" }],
    };

    expect(isWorkspaceSlug("super-admin")).toBe(true);
    expect(isWorkspaceSlug("chairman")).toBe(false);
    expect(hasWorkspaceAccess(hodOnly, "hod")).toBe(true);
    expect(hasWorkspaceAccess(hodOnly, "super-admin")).toBe(false);
    expect(hasWorkspaceAccess(hodOnly, "unknown")).toBe(false);
  });

  it("extracts institution scope label only from active institution-scoped super_admin assignment", () => {
    expect(
      getInstitutionScopeLabel({
        assignments: [{ role_key: "super_admin", scope_type: "institution", scope_label: "i_dev" }],
      })
    ).toBe("i_dev");

    expect(
      getInstitutionScopeLabel({
        assignments: [{ role_key: "super_admin", scope_type: "department", scope_label: "d_me" }],
      })
    ).toBeNull();
  });

  it("routes post-login to highest-authority workspace unless setup is incomplete", () => {
    const superAdmin = {
      assignments: [{ role_key: "super_admin", scope_type: "institution", scope_label: "i_dev" }],
    };
    expect(
      resolvePostLoginRoute({
        mustChangePassword: false,
        user: superAdmin,
        setupStatus: { completed_at: null },
      })
    ).toBe("/setup");

    expect(
      resolvePostLoginRoute({
        mustChangePassword: false,
        user: superAdmin,
        setupStatus: { completed_at: "2026-11-20T00:00:00Z" },
      })
    ).toBe("/w/super-admin");

    const principalPlusTeacher = {
      assignments: [
        { role_key: "lecturer", scope_type: "department" },
        { role_key: "principal", scope_type: "institution" },
      ],
    };
    expect(
      resolvePostLoginRoute({
        mustChangePassword: false,
        user: principalPlusTeacher,
        setupStatus: null,
      })
    ).toBe("/w/principal");
  });
});

describe("Super Admin Sidebar Config Isolation", () => {
  it("contains strictly non-academic navigation routes", () => {
    const superAdminNav = WORKSPACE_NAV["super-admin"];
    expect(superAdminNav.map((item) => item.href)).toEqual([
      "/w/super-admin",
      "/w/super-admin/principal",
      "/w/super-admin/users",
      "/w/super-admin/settings",
    ]);

    const academicKeywords =
      /(department|batch|program|course|subject|attendance|mark|exam|grade|student|timetable|syllabus|academic)/i;

    for (const item of superAdminNav) {
      expect(item.href).not.toMatch(academicKeywords);
      expect(item.label).not.toMatch(academicKeywords);
    }
  });
});


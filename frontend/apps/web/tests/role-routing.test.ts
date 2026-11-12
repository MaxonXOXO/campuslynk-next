import { describe, it, expect } from "vitest";
import {
  isSuperAdminAtInstitutionScope,
  shouldRedirectToSetup,
  isImpersonationError,
  isWrongRoleForbiddenError,
  isSetupAlreadyCompletedError,
} from "../src/app/setup/logic/role-routing";
import type {
  UserWithAssignments,
  SetupStatusCheck,
} from "../src/app/setup/logic/role-routing";

describe("Role Routing & Gating Logic (Part 2 & Part 6)", () => {
  describe("isSuperAdminAtInstitutionScope", () => {
    it("returns true only for active super_admin at institution scope", () => {
      const superAdminInstitution: UserWithAssignments = {
        assignments: [
          { role_key: "super_admin", scope_type: "institution", is_active: true },
        ],
      };
      expect(isSuperAdminAtInstitutionScope(superAdminInstitution)).toBe(true);

      // Default active when is_active is undefined
      const defaultActive: UserWithAssignments = {
        assignments: [
          { role_key: "super_admin", scope_type: "institution" },
        ],
      };
      expect(isSuperAdminAtInstitutionScope(defaultActive)).toBe(true);
    });

    it("returns false for super_admin scoped to department or other scopes", () => {
      const superAdminDept: UserWithAssignments = {
        assignments: [
          { role_key: "super_admin", scope_type: "department", is_active: true },
        ],
      };
      expect(isSuperAdminAtInstitutionScope(superAdminDept)).toBe(false);

      const superAdminBatch: UserWithAssignments = {
        assignments: [
          { role_key: "super_admin", scope_type: "batch", is_active: true },
        ],
      };
      expect(isSuperAdminAtInstitutionScope(superAdminBatch)).toBe(false);
    });

    it("returns false for non-super_admin roles even at institution scope", () => {
      const principal: UserWithAssignments = {
        assignments: [
          { role_key: "principal", scope_type: "institution", is_active: true },
        ],
      };
      expect(isSuperAdminAtInstitutionScope(principal)).toBe(false);

      const hod: UserWithAssignments = {
        assignments: [
          { role_key: "hod", scope_type: "department", is_active: true },
        ],
      };
      expect(isSuperAdminAtInstitutionScope(hod)).toBe(false);

      const student: UserWithAssignments = {
        assignments: [
          { role_key: "student", scope_type: "batch", is_active: true },
        ],
      };
      expect(isSuperAdminAtInstitutionScope(student)).toBe(false);
    });

    it("returns false if super_admin assignment is inactive", () => {
      const inactiveAdmin: UserWithAssignments = {
        assignments: [
          { role_key: "super_admin", scope_type: "institution", is_active: false },
        ],
      };
      expect(isSuperAdminAtInstitutionScope(inactiveAdmin)).toBe(false);
    });

    it("returns false for empty, null, or undefined user", () => {
      expect(isSuperAdminAtInstitutionScope(null)).toBe(false);
      expect(isSuperAdminAtInstitutionScope(undefined)).toBe(false);
      expect(isSuperAdminAtInstitutionScope({})).toBe(false);
      expect(isSuperAdminAtInstitutionScope({ assignments: [] })).toBe(false);
    });
  });

  describe("shouldRedirectToSetup", () => {
    const institutionSuperAdmin: UserWithAssignments = {
      assignments: [{ role_key: "super_admin", scope_type: "institution" }],
    };

    it("redirects super_admin at institution scope when completed_at is null or undefined", () => {
      const uncompletedStatus: SetupStatusCheck = { completed_at: null };
      expect(shouldRedirectToSetup(institutionSuperAdmin, uncompletedStatus)).toBe(true);

      const missingCompletedAt: SetupStatusCheck = { completed_at: null, is_completed: false };
      expect(shouldRedirectToSetup(institutionSuperAdmin, missingCompletedAt)).toBe(true);
    });

    it("does NOT redirect super_admin if setup is already completed", () => {
      const completedStatus: SetupStatusCheck = {
        completed_at: "2026-11-05T12:00:00Z",
        is_completed: true,
      };
      expect(shouldRedirectToSetup(institutionSuperAdmin, completedStatus)).toBe(false);
    });

    it("NEVER redirects other roles to setup, even if completed_at is null", () => {
      const hodUser: UserWithAssignments = {
        assignments: [{ role_key: "hod", scope_type: "department" }],
      };
      const principalUser: UserWithAssignments = {
        assignments: [{ role_key: "principal", scope_type: "institution" }],
      };
      const deptAdminUser: UserWithAssignments = {
        assignments: [{ role_key: "super_admin", scope_type: "department" }],
      };

      const uncompletedStatus: SetupStatusCheck = { completed_at: null };
      expect(shouldRedirectToSetup(hodUser, uncompletedStatus)).toBe(false);
      expect(shouldRedirectToSetup(principalUser, uncompletedStatus)).toBe(false);
      expect(shouldRedirectToSetup(deptAdminUser, uncompletedStatus)).toBe(false);
      expect(shouldRedirectToSetup(null, uncompletedStatus)).toBe(false);
    });
  });

  describe("Impersonation vs Wrong-Role 403 Distinction (Part 1 & Item 14)", () => {
    it("distinguishes impersonation 403 by machine-readable type URI", () => {
      const impersonationError = {
        status: 403,
        type: "https://errors.campuslynk.net/impersonation-not-allowed",
        detail: "Some custom detail message that could be anything in any language",
      };

      expect(isImpersonationError(impersonationError)).toBe(true);
      expect(isWrongRoleForbiddenError(impersonationError)).toBe(false);
    });

    it("identifies wrong-role 403 forbidden without string-matching English detail", () => {
      const forbiddenError = {
        status: 403,
        type: "https://errors.campuslynk.net/forbidden",
        detail: "User does not have required role or scope",
      };

      expect(isImpersonationError(forbiddenError)).toBe(false);
      expect(isWrongRoleForbiddenError(forbiddenError)).toBe(true);
    });

    it("supports nested problem envelope from ApiError instances", () => {
      const nestedImpersonation = {
        problem: {
          status: 403,
          type: "https://errors.campuslynk.net/impersonation-not-allowed",
        },
      };
      expect(isImpersonationError(nestedImpersonation)).toBe(true);
      expect(isWrongRoleForbiddenError(nestedImpersonation)).toBe(false);

      const nestedForbidden = {
        problem: {
          status: 403,
          type: "https://errors.campuslynk.net/forbidden",
        },
      };
      expect(isImpersonationError(nestedForbidden)).toBe(false);
      expect(isWrongRoleForbiddenError(nestedForbidden)).toBe(true);
    });

    it("returns false for non-403 errors", () => {
      const notFound = { status: 404, type: "https://errors.campuslynk.net/not-found" };
      expect(isImpersonationError(notFound)).toBe(false);
      expect(isWrongRoleForbiddenError(notFound)).toBe(false);

      const serverError = { status: 500, type: "https://errors.campuslynk.net/server-error" };
      expect(isImpersonationError(serverError)).toBe(false);
      expect(isWrongRoleForbiddenError(serverError)).toBe(false);
    });
  });

  describe("isSetupAlreadyCompletedError (409)", () => {
    it("requires the already-completed problem type as well as 409 status", () => {
      expect(isSetupAlreadyCompletedError({ status: 409 })).toBe(false);
      expect(
        isSetupAlreadyCompletedError({
          status: 409,
          type: "https://errors.campuslynk.net/setup-already-completed",
        })
      ).toBe(true);
    });

    it("identifies problem type URI even if status property is nested", () => {
      expect(
        isSetupAlreadyCompletedError({
          problem: {
            status: 409,
            type: "https://errors.campuslynk.net/setup-already-completed",
          },
        })
      ).toBe(true);
    });

    it("does not treat unrelated conflicts or English detail text as completion", () => {
      expect(
        isSetupAlreadyCompletedError({
          status: 409,
          type: "https://errors.example.test/other-conflict",
          detail: "Setup already completed",
        })
      ).toBe(false);
      expect(
        isSetupAlreadyCompletedError({
          problem: { status: 409, type: "about:blank" },
        })
      ).toBe(false);
    });

    it("supports the backend's configurable problem-type base URL", () => {
      expect(
        isSetupAlreadyCompletedError({
          status: 409,
          type: "https://college.example.test/problems/setup-already-completed",
        })
      ).toBe(true);
    });

    it("returns false for other status codes", () => {
      expect(isSetupAlreadyCompletedError({ status: 400 })).toBe(false);
      expect(isSetupAlreadyCompletedError({ status: 422 })).toBe(false);
      expect(
        isSetupAlreadyCompletedError({
          status: 500,
          type: "https://errors.campuslynk.net/setup-already-completed",
        })
      ).toBe(false);
      expect(isSetupAlreadyCompletedError(null)).toBe(false);
    });
  });
});

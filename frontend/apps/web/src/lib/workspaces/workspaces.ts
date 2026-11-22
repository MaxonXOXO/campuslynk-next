import type { UserRoleAssignment, UserWithAssignments } from "@/app/setup/logic/role-routing";

export interface WorkspaceRoleAssignment extends UserRoleAssignment {
  scope_label?: string;
}

export interface UserWithWorkspaceAssignments extends UserWithAssignments {
  assignments?: WorkspaceRoleAssignment[];
}

export type WorkspaceSlug =
  | "super-admin"
  | "principal"
  | "hod"
  | "coordinator"
  | "tutor-mentor"
  | "teaching"
  | "student"
  | "parent";

export interface WorkspaceMetadata {
  slug: WorkspaceSlug;
  label: string;
  shortLabel: string;
  description: string;
}

export interface ComputedWorkspace extends WorkspaceMetadata {
  assignments: UserRoleAssignment[];
  scopeLabels: string[];
}

/** Highest-authority to lowest-authority ordering per ADR-0017 §4. */
export const WORKSPACE_AUTHORITY_ORDER: readonly WorkspaceSlug[] = [
  "super-admin",
  "principal",
  "hod",
  "coordinator",
  "tutor-mentor",
  "teaching",
  "student",
  "parent",
] as const;

export const WORKSPACE_META: Record<WorkspaceSlug, WorkspaceMetadata> = {
  "super-admin": {
    slug: "super-admin",
    label: "Super Admin",
    shortLabel: "Super Admin",
    description: "People, roles, and system configuration",
  },
  principal: {
    slug: "principal",
    label: "Principal",
    shortLabel: "Principal",
    description: "Institution-wide leadership and oversight",
  },
  hod: {
    slug: "hod",
    label: "Head of Department",
    shortLabel: "HOD",
    description: "Department administration and staff assignments",
  },
  coordinator: {
    slug: "coordinator",
    label: "Coordinator",
    shortLabel: "Coordinator",
    description: "Stream, general department, and office coordination",
  },
  "tutor-mentor": {
    slug: "tutor-mentor",
    label: "Tutor & Mentor",
    shortLabel: "Tutor / Mentor",
    description: "Batch mentoring and student guidance",
  },
  teaching: {
    slug: "teaching",
    label: "Teaching",
    shortLabel: "Teaching",
    description: "Courses, labs, and instructional delivery",
  },
  student: {
    slug: "student",
    label: "Student",
    shortLabel: "Student",
    description: "Academic progress and enrolled courses",
  },
  parent: {
    slug: "parent",
    label: "Parent",
    shortLabel: "Parent",
    description: "Guardian view of student progress",
  },
};

/**
 * Mapping from backend `role_key` (RbacBaselineSeeder) to workspace slug.
 * Intentionally excludes `chairman` (deferred) and `admin` (dropped) per ADR-0017.
 */
export const ROLE_TO_WORKSPACE: Readonly<Record<string, WorkspaceSlug>> = {
  super_admin: "super-admin",
  principal: "principal",
  hod: "hod",
  academic_coordinator: "coordinator",
  gen_dept_coordinator: "coordinator",
  workshop_superintendent: "coordinator",
  sf_office: "coordinator",
  tutor: "tutor-mentor",
  mentor: "tutor-mentor",
  lecturer: "teaching",
  demonstrator: "teaching",
  trade_instructor: "teaching",
  workshop_instructor: "teaching",
  tradesman: "teaching",
  laboratory_assistant: "teaching",
  physical_instructor: "teaching",
  course_teacher: "teaching",
  student: "student",
  parent: "parent",
};

export function isWorkspaceSlug(value: string): value is WorkspaceSlug {
  return (WORKSPACE_AUTHORITY_ORDER as readonly string[]).includes(value);
}

export function isAssignmentActive(assignment: UserRoleAssignment, now: Date = new Date()): boolean {
  if (assignment.is_active === false) {
    return false;
  }

  const nowMs = now.getTime();

  if (assignment.valid_from) {
    const fromMs = Date.parse(assignment.valid_from);
    if (!Number.isNaN(fromMs) && fromMs > nowMs) {
      return false;
    }
  }

  if (assignment.valid_to) {
    const toMs = Date.parse(assignment.valid_to);
    if (!Number.isNaN(toMs) && toMs <= nowMs) {
      return false;
    }
  }

  return true;
}

/**
 * Compute deduplicated workspaces ordered from highest to lowest authority
 * directly from `/me` active assignments.
 */
export function computeWorkspaces(
  user: UserWithWorkspaceAssignments | null | undefined,
  now: Date = new Date()
): ComputedWorkspace[] {
  if (!user || !Array.isArray(user.assignments)) {
    return [];
  }

  const grouped = new Map<WorkspaceSlug, WorkspaceRoleAssignment[]>();

  for (const assignment of user.assignments) {
    if (!isAssignmentActive(assignment, now)) continue;

    const slug = ROLE_TO_WORKSPACE[assignment.role_key];
    if (!slug) continue;

    const existing = grouped.get(slug);
    if (existing) {
      existing.push(assignment);
    } else {
      grouped.set(slug, [assignment]);
    }
  }

  const workspaces: ComputedWorkspace[] = [];

  for (const slug of WORKSPACE_AUTHORITY_ORDER) {
    const assignments = grouped.get(slug);
    if (!assignments || assignments.length === 0) continue;

    const scopeLabels = Array.from(
      new Set(
        assignments
          .map((a) => a.scope_label)
          .filter((label): label is string => typeof label === "string" && label.length > 0)
      )
    );

    workspaces.push({
      ...WORKSPACE_META[slug],
      assignments,
      scopeLabels,
    });
  }

  return workspaces;
}

export function getLandingWorkspace(
  user: UserWithWorkspaceAssignments | null | undefined,
  now: Date = new Date()
): ComputedWorkspace | null {
  return computeWorkspaces(user, now)[0] ?? null;
}

export function getLandingRoute(
  user: UserWithWorkspaceAssignments | null | undefined,
  now: Date = new Date(),
  fallbackPath = "/home"
): string {
  const landing = getLandingWorkspace(user, now);
  return landing ? `/w/${landing.slug}` : fallbackPath;
}

export function hasWorkspaceAccess(
  user: UserWithWorkspaceAssignments | null | undefined,
  slug: string,
  now: Date = new Date()
): slug is WorkspaceSlug {
  if (!isWorkspaceSlug(slug)) return false;
  return computeWorkspaces(user, now).some((w) => w.slug === slug);
}

/** Extract the institution scope_label from the user's active institution-scoped Super Admin assignment. */
export function getInstitutionScopeLabel(
  user: UserWithWorkspaceAssignments | null | undefined,
  now: Date = new Date()
): string | null {
  if (!user || !Array.isArray(user.assignments)) {
    return null;
  }

  const match = user.assignments.find(
    (a) =>
      a.role_key === "super_admin" &&
      a.scope_type === "institution" &&
      isAssignmentActive(a, now) &&
      typeof a.scope_label === "string" &&
      a.scope_label.length > 0
  );

  return match?.scope_label ?? null;
}

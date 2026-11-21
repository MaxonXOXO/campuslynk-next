import type { WorkspaceSlug } from "./workspaces";

export type NavIconKey = "overview" | "principal" | "users" | "setup";

export interface WorkspaceNavItem {
  label: string;
  href: string;
  icon: NavIconKey;
  exact?: boolean;
}

/**
 * Per-workspace sidebar navigation registry.
 * Super Admin contains only identity, role governance, and system configuration routes —
 * never academic data (departments, batches, programs, courses, attendance, marks, students).
 */
export const WORKSPACE_NAV: Readonly<Record<WorkspaceSlug, readonly WorkspaceNavItem[]>> = {
  "super-admin": [
    {
      label: "Overview",
      href: "/w/super-admin",
      icon: "overview",
      exact: true,
    },
    {
      label: "Principal",
      href: "/w/super-admin/principal",
      icon: "principal",
    },
    {
      label: "Users",
      href: "/w/super-admin/users",
      icon: "users",
    },
    {
      label: "Institution Setup",
      href: "/setup",
      icon: "setup",
    },
  ],
  principal: [
    {
      label: "Overview",
      href: "/w/principal",
      icon: "overview",
      exact: true,
    },
  ],
  hod: [
    {
      label: "Overview",
      href: "/w/hod",
      icon: "overview",
      exact: true,
    },
  ],
  coordinator: [
    {
      label: "Overview",
      href: "/w/coordinator",
      icon: "overview",
      exact: true,
    },
  ],
  "tutor-mentor": [
    {
      label: "Overview",
      href: "/w/tutor-mentor",
      icon: "overview",
      exact: true,
    },
  ],
  teaching: [
    {
      label: "Overview",
      href: "/w/teaching",
      icon: "overview",
      exact: true,
    },
  ],
  student: [
    {
      label: "Overview",
      href: "/w/student",
      icon: "overview",
      exact: true,
    },
  ],
  parent: [
    {
      label: "Overview",
      href: "/w/parent",
      icon: "overview",
      exact: true,
    },
  ],
};


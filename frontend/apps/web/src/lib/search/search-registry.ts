import { WORKSPACE_NAV } from "@/lib/workspaces/navigation";
import { WORKSPACE_META, type WorkspaceSlug } from "@/lib/workspaces/workspaces";

export type ControlPanelCategoryId = "home" | "setup" | "auth" | "api" | "audit";

export interface ControlPanelSettingItem {
  id: string;
  categoryId: ControlPanelCategoryId;
  categoryLabel: string;
  title: string;
  description: string;
  settingKey?: string;
  targetElementId?: string;
  keywords: readonly string[];
}

export const CONTROL_PANEL_SETTINGS_CATALOG: readonly ControlPanelSettingItem[] = [
  {
    id: "setup-overview",
    categoryId: "home",
    categoryLabel: "Home",
    title: "Tenant Setup Overview & Roadmap",
    description: "Review first-run setup progress and upcoming governance controls.",
    keywords: ["home", "overview", "status", "roadmap", "wizard"],
  },
  {
    id: "institution-name",
    categoryId: "setup",
    categoryLabel: "Institution & Initial Setup",
    title: "Institution Name",
    description: "Official display name of the institution shown across workspaces.",
    targetElementId: "cp-inst-name",
    keywords: ["institution", "college", "name", "profile", "branding"],
  },
  {
    id: "institution-code",
    categoryId: "setup",
    categoryLabel: "Institution & Initial Setup",
    title: "Institution Code",
    description: "Short institutional identifier used on reports and transcripts.",
    targetElementId: "cp-inst-code",
    keywords: ["institution", "code", "short code", "profile", "identifier"],
  },
  {
    id: "institution-email",
    categoryId: "setup",
    categoryLabel: "Institution & Initial Setup",
    title: "Institution Contact Email",
    description: "Primary official contact email address for the institution.",
    targetElementId: "cp-inst-email",
    keywords: ["email", "contact", "institution", "profile", "support"],
  },
  {
    id: "institution-website",
    categoryId: "setup",
    categoryLabel: "Institution & Initial Setup",
    title: "Institution Website",
    description: "Public website URL displayed in tenant profile details.",
    targetElementId: "cp-inst-website",
    keywords: ["website", "url", "domain", "institution", "profile"],
  },
  {
    id: "calendar-day-order",
    categoryId: "setup",
    categoryLabel: "Institution & Initial Setup",
    title: "Calendar Basics & Day Order Format",
    description: "Configure academic year calendar and day-order scheduling format.",
    targetElementId: "cp-day-order-format",
    keywords: ["calendar", "academic year", "day order", "schedule", "timetable"],
  },
  {
    id: "organisation-basics",
    categoryId: "setup",
    categoryLabel: "Institution & Initial Setup",
    title: "Organisation Basics",
    description: "Review streams, departments, and baseline institutional structure.",
    keywords: ["organisation", "organization", "streams", "departments", "structure"],
  },
  {
    id: "student-self-registration",
    categoryId: "setup",
    categoryLabel: "Institution & Initial Setup",
    title: "Student Self-Registration",
    description: "Allow or restrict students from self-registering accounts.",
    targetElementId: "cp-student-self-reg",
    keywords: ["student", "self-registration", "signup", "registration policy", "onboarding"],
  },
  {
    id: "parent-self-registration",
    categoryId: "setup",
    categoryLabel: "Institution & Initial Setup",
    title: "Parent Self-Registration",
    description: "Allow or restrict parents from self-registering portal accounts.",
    targetElementId: "cp-parent-self-reg",
    keywords: ["parent", "guardian", "self-registration", "signup", "registration policy"],
  },
  {
    id: "registration-approval-mode",
    categoryId: "setup",
    categoryLabel: "Institution & Initial Setup",
    title: "Registration Approval Mode",
    description: "Control whether self-registrations require manual approval.",
    targetElementId: "cp-approval-mode",
    keywords: ["approval", "mode", "registration policy", "manual", "auto", "lock", "unlock"],
  },
  {
    id: "staff-self-registration",
    categoryId: "auth",
    categoryLabel: "Authentication & Onboarding",
    title: "Staff Self-Registration",
    description: "Enable or disable public staff self-registration for this tenant.",
    settingKey: "auth.staff_self_registration_enabled",
    targetElementId: "cp-staff-self-reg",
    keywords: [
      "staff",
      "self-registration",
      "signup",
      "onboarding",
      "auth",
      "toggle",
      "register-staff",
    ],
  },
  {
    id: "staff-daily-cap",
    categoryId: "auth",
    categoryLabel: "Authentication & Onboarding",
    title: "Staff Self-Registration Daily Cap",
    description: "Maximum number of staff self-registration submissions allowed per day.",
    settingKey: "auth.staff_self_registration_daily_cap",
    targetElementId: "cp-daily-cap",
    keywords: ["daily cap", "limit", "rate limit", "throttle", "onboarding", "staff"],
  },
  {
    id: "rejected-resubmit-cooldown",
    categoryId: "auth",
    categoryLabel: "Authentication & Onboarding",
    title: "Rejected Resubmit Cooldown (Days)",
    description: "Number of days a rejected applicant must wait before re-applying.",
    settingKey: "auth.rejected_resubmit_cooldown_days",
    targetElementId: "cp-cooldown-days",
    keywords: ["cooldown", "rejected", "resubmit", "reapply", "days", "onboarding"],
  },
  {
    id: "active-token-inventory",
    categoryId: "api",
    categoryLabel: "API Access",
    title: "Active Token Inventory",
    description: "Inspect active Sanctum API session tokens across web and mobile clients.",
    keywords: ["tokens", "inventory", "sessions", "active", "sanctum", "api"],
  },
  {
    id: "web-token-lifetime",
    categoryId: "api",
    categoryLabel: "API Access",
    title: "Web Session Token Lifetime (Hours)",
    description: "Configure expiry duration in hours for browser session tokens.",
    settingKey: "auth.token_lifetime_web_hours",
    targetElementId: "cp-web-token-hours",
    keywords: ["web", "token", "lifetime", "hours", "expiry", "session", "timeout", "api"],
  },
  {
    id: "mobile-token-lifetime",
    categoryId: "api",
    categoryLabel: "API Access",
    title: "Mobile Token Lifetime (Days)",
    description: "Configure expiry duration in days for mobile app bearer tokens.",
    settingKey: "auth.token_lifetime_mobile_days",
    targetElementId: "cp-mobile-token-days",
    keywords: ["mobile", "token", "lifetime", "days", "expiry", "app", "api"],
  },
  {
    id: "audit-security-log",
    categoryId: "audit",
    categoryLabel: "Audit & Security",
    title: "Audit & Security Log",
    description: "Search immutable configuration changes, setup locks, and security events.",
    targetElementId: "cp-audit-search",
    keywords: ["audit", "security", "logs", "history", "trail", "reason", "events"],
  },
] as const;

export function searchControlPanelSettings(query: string): ControlPanelSettingItem[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return [...CONTROL_PANEL_SETTINGS_CATALOG];
  }
  const tokens = q.split(/\s+/).filter(Boolean);
  return CONTROL_PANEL_SETTINGS_CATALOG.filter((item) => {
    const haystack = [
      item.title,
      item.description,
      item.categoryLabel,
      item.settingKey ?? "",
      ...item.keywords,
    ]
      .join(" ")
      .toLowerCase();
    return tokens.every((token) => haystack.includes(token));
  });
}

export interface SearchPageItem {
  id: string;
  label: string;
  workspaceLabel: string;
  href: string;
  keywords: readonly string[];
}

export function getWorkspaceSearchPages(
  workspaces: readonly WorkspaceSlug[]
): SearchPageItem[] {
  const pages: SearchPageItem[] = [];
  for (const slug of workspaces) {
    const meta = WORKSPACE_META[slug];
    const items = WORKSPACE_NAV[slug] ?? [];
    for (const item of items) {
      pages.push({
        id: `${slug}:${item.href}`,
        label: item.label,
        workspaceLabel: meta.label,
        href: item.href,
        keywords: [item.label, meta.label, slug, item.href],
      });
    }
  }
  return pages;
}

export interface SearchQuickActionItem {
  id: string;
  label: string;
  description: string;
  href: string;
  keywords: readonly string[];
}

export function getSearchQuickActions(
  workspaces: readonly WorkspaceSlug[]
): SearchQuickActionItem[] {
  const actions: SearchQuickActionItem[] = [];
  const hasSuperAdmin = workspaces.includes("super-admin");
  const hasPrincipal = workspaces.includes("principal");

  if (hasSuperAdmin) {
    actions.push(
      {
        id: "action-sa-import-staff",
        label: "Import Staff (CSV / XLSX)",
        description: "Bulk upload staff accounts in Super Admin workspace",
        href: "/w/super-admin/users/import",
        keywords: ["import", "bulk", "csv", "xlsx", "staff", "upload", "users"],
      },
      {
        id: "action-sa-appoint-principal",
        label: "Appoint or Replace Principal",
        description: "Manage institutional Principal governance assignment",
        href: "/w/super-admin/principal",
        keywords: ["appoint", "replace", "principal", "governance", "role"],
      }
    );
  } else if (hasPrincipal) {
    actions.push({
      id: "action-pr-import-staff",
      label: "Import Staff (CSV / XLSX)",
      description: "Bulk upload staff accounts in Principal workspace",
      href: "/w/principal/users/import",
      keywords: ["import", "bulk", "csv", "xlsx", "staff", "upload", "users"],
    });
  }

  actions.push({
    id: "action-change-password",
    label: "Change Password",
    description: "Update your account password",
    href: "/change-password",
    keywords: ["password", "security", "account", "credentials"],
  });

  return actions;
}

export function buildControlPanelSettingHref(item: ControlPanelSettingItem): string {
  const params = new URLSearchParams();
  if (item.categoryId !== "home") {
    params.set("category", item.categoryId);
  }
  if (item.targetElementId) {
    params.set("focus", item.targetElementId);
  }
  const qs = params.toString();
  return qs ? `/w/super-admin/settings?${qs}` : "/w/super-admin/settings";
}


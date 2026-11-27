"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  PageHeader,
  Skeleton,
  StatusBadge,
  buttonVariants,
  cn,
} from "@academic-suite/ui";
import {
  RiAlertLine,
  RiArrowRightLine,
  RiBuilding2Line,
  RiHistoryLine,
  RiHome4Line,
  RiKey2Line,
  RiMenuLine,
  RiRoadMapLine,
  RiSearchLine,
  RiShieldCheckLine,
} from "@remixicon/react";
import { useApiClient } from "@/lib/auth/session-provider";
import { useApiQuery, useQueryScope, scopedQueryKey, STALE_TIME_LIST_MS } from "@/lib/query/api-query";
import {
  searchControlPanelSettings,
  type ControlPanelSettingItem,
} from "@/lib/search/search-registry";
import { SetupControlPane } from "@/components/super-admin/control-panel/SetupControlPane";
import { AuthControlPane } from "@/components/super-admin/control-panel/AuthControlPane";
import { ApiAccessControlPane } from "@/components/super-admin/control-panel/ApiAccessControlPane";
import { AuditControlPane } from "@/components/super-admin/control-panel/AuditControlPane";

export type ControlPanelCategoryId = "home" | "setup" | "auth" | "api" | "audit";

export interface ControlPanelCategoryMeta {
  id: ControlPanelCategoryId;
  label: string;
  description: string;
  keywords: readonly string[];
}

export const CONTROL_PANEL_CATEGORIES: readonly ControlPanelCategoryMeta[] = [
  {
    id: "home",
    label: "Home",
    description: "Tenant overview, setup status, and upcoming governance roadmap.",
    keywords: ["home", "overview", "setup", "roadmap"],
  },
  {
    id: "setup",
    label: "Institution & Initial Setup",
    description: "Profile, calendar basics, organisation summary, and registration policy.",
    keywords: [
      "institution",
      "profile",
      "calendar",
      "academic year",
      "organisation",
      "registration policy",
      "signup",
      "unlock",
      "lock",
    ],
  },
  {
    id: "auth",
    label: "Authentication & Onboarding",
    description: "Staff self-registration, daily caps, cooldowns, and session policy.",
    keywords: [
      "auth",
      "authentication",
      "onboarding",
      "self-registration",
      "staff",
      "daily cap",
      "cooldown",
      "token",
    ],
  },
  {
    id: "api",
    label: "API Access",
    description: "Token lifetimes and active session token inventory.",
    keywords: ["api", "token", "lifetime", "mobile", "web", "sanctum"],
  },
  {
    id: "audit",
    label: "Audit & Security",
    description: "Immutable configuration, lock, and security event trail.",
    keywords: ["audit", "security", "logs", "history", "reason"],
  },
] as const;

export function resolveControlPanelCategory(raw: string | null): ControlPanelCategoryId {
  if (!raw) {
    return "home";
  }
  const match = CONTROL_PANEL_CATEGORIES.find((c) => c.id === raw);
  return match ? match.id : "home";
}

function categoryIcon(id: ControlPanelCategoryId) {
  switch (id) {
    case "home":
      return RiHome4Line;
    case "setup":
      return RiBuilding2Line;
    case "auth":
      return RiShieldCheckLine;
    case "api":
      return RiKey2Line;
    case "audit":
      return RiHistoryLine;
  }
}

export function ControlPanelPage() {
  const client = useApiClient();
  const scope = useQueryScope();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const activeCategory = resolveControlPanelCategory(searchParams.get("category"));
  const focusTargetId = searchParams.get("focus");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [mobileRailOpen, setMobileRailOpen] = React.useState(false);

  React.useEffect(() => {
    if (!focusTargetId) return;
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      const el = document.getElementById(focusTargetId);
      if (el) {
        window.clearInterval(timer);
        if (typeof el.scrollIntoView === "function") {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
        el.focus?.();
      } else if (attempts >= 20) {
        window.clearInterval(timer);
      }
    }, 100);
    return () => window.clearInterval(timer);
  }, [focusTargetId, activeCategory]);

  const setupStatusQuery = useApiQuery({
    queryKey: scopedQueryKey(scope, "organisation", "setup", "status"),
    queryFn: () => client.organisation.setup.status(),
    staleTime: STALE_TIME_LIST_MS,
  });

  const matchingSettings = React.useMemo(() => {
    const q = searchQuery.trim();
    if (!q) {
      return [];
    }
    return searchControlPanelSettings(q);
  }, [searchQuery]);

  const filteredCategories = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      return CONTROL_PANEL_CATEGORIES;
    }
    const matchedCategoryIds = new Set(matchingSettings.map((item) => item.categoryId));
    return CONTROL_PANEL_CATEGORIES.filter(
      (cat) =>
        matchedCategoryIds.has(cat.id) ||
        cat.label.toLowerCase().includes(q) ||
        cat.description.toLowerCase().includes(q) ||
        cat.keywords.some((kw) => kw.toLowerCase().includes(q))
    );
  }, [searchQuery, matchingSettings]);

  function selectCategory(categoryId: ControlPanelCategoryId, focusId?: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (categoryId === "home") {
      params.delete("category");
    } else {
      params.set("category", categoryId);
    }
    if (focusId) {
      params.set("focus", focusId);
    } else {
      params.delete("focus");
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    setMobileRailOpen(false);
  }

  function selectSettingMatch(item: ControlPanelSettingItem) {
    selectCategory(item.categoryId, item.targetElementId);
    setSearchQuery("");
  }

  const setupStatus = setupStatusQuery.data?.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Control Panel"
        description="Manage tenant configuration, audited setup locks, authentication policies, and security logs."
      />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[260px_minmax(0,1fr)]">
        {/* Left Category Rail */}
        <aside aria-label="Control Panel categories" className="min-w-0 space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <RiSearchLine
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                type="search"
                aria-label="Find a setting"
                placeholder="Find a setting"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="md:hidden shrink-0"
              aria-label="Toggle settings navigation"
              aria-expanded={mobileRailOpen}
              aria-controls="control-panel-rail-nav"
              onClick={() => setMobileRailOpen((prev) => !prev)}
            >
              <RiMenuLine className="size-4" aria-hidden="true" />
            </Button>
          </div>

          {searchQuery.trim().length > 0 && matchingSettings.length > 0 && (
            <div
              aria-label="Matching settings"
              className="space-y-1 rounded-xl border border-border bg-card p-2"
            >
              <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Matching settings
              </p>
              {matchingSettings.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => selectSettingMatch(item)}
                  className="flex w-full flex-col gap-0.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-muted/60 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <span className="text-xs font-medium text-foreground">
                    {item.title}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {item.categoryLabel}
                  </span>
                </button>
              ))}
            </div>
          )}

          <nav
            id="control-panel-rail-nav"
            aria-label="Settings categories"
            className={cn(
              "space-y-1 rounded-xl border border-border bg-card p-2",
              mobileRailOpen ? "block" : "hidden md:block"
            )}
          >
            {filteredCategories.length === 0 ? (
              <p className="px-3 py-4 text-xs text-muted-foreground">
                No matching settings categories found.
              </p>
            ) : (
              filteredCategories.map((cat) => {
                const Icon = categoryIcon(cat.id);
                const isActive = activeCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    aria-current={isActive ? "page" : undefined}
                    onClick={() => selectCategory(cat.id)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors",
                      "outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-foreground hover:bg-muted/60"
                    )}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden="true" />
                    <span className="truncate">{cat.label}</span>
                  </button>
                );
              })
            )}
          </nav>
        </aside>

        {/* Right Content Pane */}
        <section
          aria-label="Control Panel content"
          className="min-w-0 space-y-6"
        >
          {activeCategory === "home" && (
            <div className="space-y-6">
              {setupStatusQuery.isLoading ? (
                <Skeleton className="h-28 w-full rounded-xl" />
              ) : setupStatusQuery.isError ? (
                <Alert variant="destructive">
                  <RiAlertLine className="size-4" aria-hidden="true" />
                  <AlertTitle>Unable to load setup status</AlertTitle>
                  <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
                    <span>Could not verify initial setup completion state.</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void setupStatusQuery.refetch()}
                    >
                      Retry
                    </Button>
                  </AlertDescription>
                </Alert>
              ) : setupStatus && !setupStatus.is_completed ? (
                <Alert>
                  <RiBuilding2Line className="size-4" aria-hidden="true" />
                  <AlertTitle>Initial institution setup is in progress</AlertTitle>
                  <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
                    <span>
                      Complete the initial setup wizard to lock baseline institution
                      settings and enable full governance controls.
                    </span>
                    <Link
                      href="/setup"
                      className={buttonVariants({ size: "sm" })}
                    >
                      Continue setup
                      <RiArrowRightLine className="size-4" aria-hidden="true" />
                    </Link>
                  </AlertDescription>
                </Alert>
              ) : null}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {CONTROL_PANEL_CATEGORIES.filter((c) => c.id !== "home").map((cat) => {
                  const Icon = categoryIcon(cat.id);
                  return (
                    <Card key={cat.id} className="flex flex-col justify-between">
                      <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-base">
                          <Icon className="size-4 text-primary" aria-hidden="true" />
                          {cat.label}
                        </CardTitle>
                        <CardDescription>{cat.description}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => selectCategory(cat.id)}
                        >
                          Open
                          <RiArrowRightLine className="size-4" aria-hidden="true" />
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <RiRoadMapLine className="size-4 text-primary" aria-hidden="true" />
                    Roadmap
                  </CardTitle>
                  <CardDescription>
                    Planned tenant-level governance and security controls arriving in upcoming releases.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
                    <span>SSO / SAML &amp; Institutional Identity Federation</span>
                    <StatusBadge status="neutral">Planned</StatusBadge>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
                    <span>Automated Security &amp; Audit Log Export Scheduling</span>
                    <StatusBadge status="neutral">Planned</StatusBadge>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {activeCategory === "setup" && <SetupControlPane />}
          {activeCategory === "auth" && <AuthControlPane />}
          {activeCategory === "api" && <ApiAccessControlPane />}
          {activeCategory === "audit" && <AuditControlPane />}
        </section>
      </div>
    </div>
  );
}

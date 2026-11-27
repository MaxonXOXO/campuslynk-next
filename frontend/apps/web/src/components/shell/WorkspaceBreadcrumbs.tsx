"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Button,
  Separator,
} from "@academic-suite/ui";
import { RiArrowLeftLine } from "@remixicon/react";
import { CONTROL_PANEL_CATEGORIES } from "@/components/super-admin/ControlPanelPage";
import { WORKSPACE_NAV } from "@/lib/workspaces/navigation";
import { WORKSPACE_META, type WorkspaceSlug } from "@/lib/workspaces/workspaces";

export interface BreadcrumbSegment {
  label: string;
  href?: string;
}

const SEGMENT_LABELS: Record<string, string> = {
  import: "Import Staff",
  settings: "Control Panel",
  users: "Users",
  principal: "Principal",
  departments: "Departments",
};

function formatSegmentLabel(
  segment: string,
  accumulatedHref: string,
  activeSlug: WorkspaceSlug
): string {
  const navMatch = WORKSPACE_NAV[activeSlug]?.find(
    (item) => item.href === accumulatedHref
  );
  if (navMatch) return navMatch.label;
  if (SEGMENT_LABELS[segment]) return SEGMENT_LABELS[segment];
  return segment
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function buildBreadcrumbTrail(
  activeSlug: WorkspaceSlug,
  pathname: string,
  categoryParam?: string | null
): BreadcrumbSegment[] {
  const workspaceRoot = `/w/${activeSlug}`;
  const workspaceLabel = WORKSPACE_META[activeSlug]?.label ?? activeSlug;
  const segments: BreadcrumbSegment[] = [
    { label: workspaceLabel, href: workspaceRoot },
  ];

  const normalizedPath = pathname.replace(/\/+$/, "") || workspaceRoot;
  if (normalizedPath === workspaceRoot) {
    segments.push({ label: "Overview" });
    return segments;
  }

  const relative = normalizedPath.startsWith(`${workspaceRoot}/`)
    ? normalizedPath.slice(workspaceRoot.length + 1)
    : "";
  const parts = relative.split("/").filter(Boolean);

  let currentHref = workspaceRoot;
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i]!;
    currentHref = `${currentHref}/${part}`;
    const isLastPathSegment = i === parts.length - 1;
    const label = formatSegmentLabel(part, currentHref, activeSlug);

    if (isLastPathSegment && part === "settings" && categoryParam) {
      const cat = CONTROL_PANEL_CATEGORIES.find((c) => c.id === categoryParam);
      if (cat && cat.id !== "home") {
        segments.push({ label, href: currentHref });
        segments.push({ label: cat.label });
        return segments;
      }
    }

    segments.push(isLastPathSegment ? { label } : { label, href: currentHref });
  }

  return segments;
}

export interface WorkspaceBreadcrumbsProps {
  activeSlug: WorkspaceSlug;
}

export function WorkspaceBreadcrumbs({ activeSlug }: WorkspaceBreadcrumbsProps) {
  const pathname = usePathname() ?? `/w/${activeSlug}`;
  const searchParams = useSearchParams();
  const router = useRouter();

  const categoryParam = searchParams.get("category");
  const trail = React.useMemo(
    () => buildBreadcrumbTrail(activeSlug, pathname, categoryParam),
    [activeSlug, pathname, categoryParam]
  );

  const isRootOverview =
    (pathname.replace(/\/+$/, "") || `/w/${activeSlug}`) === `/w/${activeSlug}`;
  const parentHref =
    trail.length >= 2
      ? (trail[trail.length - 2]?.href ?? `/w/${activeSlug}`)
      : `/w/${activeSlug}`;

  function handleBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push(parentHref);
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {!isRootOverview && (
        <>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleBack}
            className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
            aria-label="Go back"
          >
            <RiArrowLeftLine className="size-3.5" aria-hidden="true" />
            <span>Back</span>
          </Button>
          <Separator orientation="vertical" className="h-4" />
        </>
      )}

      <Breadcrumb>
        <BreadcrumbList>
          {trail.map((segment, index) => {
            const isLast = index === trail.length - 1;
            return (
              <React.Fragment key={`${segment.label}-${index}`}>
                {index > 0 && <BreadcrumbSeparator />}
                <BreadcrumbItem>
                  {isLast || !segment.href ? (
                    <BreadcrumbPage>{segment.label}</BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink render={<Link href={segment.href} />}>
                      {segment.label}
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
              </React.Fragment>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>
    </div>
  );
}


"use client";

import * as React from "react";
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  useIsMobile,
  cn,
} from "@academic-suite/ui";
import {
  RiBriefcaseLine,
  RiCheckLine,
  RiExpandUpDownLine,
} from "@remixicon/react";
import type { ComputedWorkspace, WorkspaceSlug } from "@/lib/workspaces/workspaces";

export interface WorkspaceSwitcherProps {
  workspaces: ComputedWorkspace[];
  activeSlug: WorkspaceSlug;
  onSelect: (slug: WorkspaceSlug) => void;
}

export function WorkspaceSwitcher({
  workspaces,
  activeSlug,
  onSelect,
}: WorkspaceSwitcherProps) {
  const isMobile = useIsMobile();
  const [sheetOpen, setSheetOpen] = React.useState(false);

  // ADR-0017 §4: Switcher is visible only when the person has two or more workspaces.
  if (workspaces.length < 2) {
    return null;
  }

  const activeWorkspace =
    workspaces.find((w) => w.slug === activeSlug) ?? workspaces[0]!;

  if (isMobile) {
    return (
      <>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5 max-w-[170px]"
          aria-label="Switch workspace"
          aria-haspopup="dialog"
          aria-expanded={sheetOpen}
          onClick={() => setSheetOpen(true)}
        >
          <RiBriefcaseLine className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
          <span className="truncate">{activeWorkspace.shortLabel}</span>
          <RiExpandUpDownLine className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Button>

        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent
            side="bottom"
            className="rounded-t-2xl pb-6 max-h-[80vh] overflow-y-auto"
          >
            <SheetHeader className="text-left">
              <SheetTitle>Switch workspace</SheetTitle>
              <SheetDescription>
                Choose which active role workspace to open.
              </SheetDescription>
            </SheetHeader>

            <div className="px-4 space-y-2" role="group" aria-label="Available workspaces">
              {workspaces.map((ws) => {
                const isActive = ws.slug === activeSlug;
                return (
                  <button
                    key={ws.slug}
                    type="button"
                    aria-pressed={isActive}
                    data-selected={isActive ? "true" : "false"}
                    onClick={() => {
                      setSheetOpen(false);
                      if (!isActive) {
                        onSelect(ws.slug);
                      }
                    }}
                    className={cn(
                      "w-full flex items-start justify-between gap-3 rounded-xl border p-3.5 text-left transition-colors",
                      "outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                      isActive
                        ? "border-primary bg-primary/5 text-foreground"
                        : "border-border bg-card hover:bg-muted/60 text-foreground"
                    )}
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold">{ws.label}</span>
                        {isActive && (
                          <Badge variant="default" className="text-[10px]">
                            Active
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{ws.description}</p>
                      {ws.scopeLabels.length > 0 && (
                        <p className="text-[11px] font-mono text-muted-foreground truncate">
                          Scope: {ws.scopeLabels.join(", ")}
                        </p>
                      )}
                    </div>
                    {isActive && (
                      <RiCheckLine
                        className="size-4 shrink-0 text-primary mt-0.5"
                        aria-hidden="true"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </SheetContent>
        </Sheet>
      </>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            aria-label="Switch workspace"
          >
            <RiBriefcaseLine className="size-4 text-primary" aria-hidden="true" />
            <span>{activeWorkspace.shortLabel}</span>
            <RiExpandUpDownLine className="size-3.5 text-muted-foreground" aria-hidden="true" />
          </Button>
        }
      />
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {workspaces.map((ws) => {
            const isActive = ws.slug === activeSlug;
            return (
              <DropdownMenuItem
                key={ws.slug}
                aria-current={isActive ? "page" : undefined}
                data-selected={isActive ? "true" : "false"}
                onClick={() => {
                  if (!isActive) {
                    onSelect(ws.slug);
                  }
                }}
                className={cn(
                  "flex items-start justify-between gap-2 py-2",
                  isActive && "bg-primary/5 font-medium"
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-foreground">{ws.label}</div>
                  <div className="text-xs text-muted-foreground line-clamp-1">
                    {ws.description}
                  </div>
                </div>
                {isActive && (
                  <RiCheckLine className="size-4 shrink-0 text-primary mt-0.5" aria-hidden="true" />
                )}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}


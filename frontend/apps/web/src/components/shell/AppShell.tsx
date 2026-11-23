"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Separator,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@academic-suite/ui";
import {
  RiBuilding2Line,
  RiDashboardLine,
  RiKey2Line,
  RiLogoutBoxRLine,
  RiSettings4Line,
  RiShieldUserLine,
  RiUserSettingsLine,
} from "@remixicon/react";
import { useSession } from "@/lib/auth/session-provider";
import { WORKSPACE_NAV, type NavIconKey } from "@/lib/workspaces/navigation";
import {
  WORKSPACE_META,
  computeWorkspaces,
  type WorkspaceSlug,
} from "@/lib/workspaces/workspaces";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";

const NAV_ICONS: Record<NavIconKey, React.ComponentType<{ className?: string }>> = {
  overview: RiDashboardLine,
  principal: RiShieldUserLine,
  departments: RiBuilding2Line,
  users: RiUserSettingsLine,
  setup: RiSettings4Line,
};

function getInitials(name: string | undefined): string {
  if (!name) return "U";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "U";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
}

export interface AppShellProps {
  activeSlug: WorkspaceSlug;
  children: React.ReactNode;
}

export function AppShell({ activeSlug, children }: AppShellProps) {
  const { state, controller } = useSession();
  const pathname = usePathname() ?? `/w/${activeSlug}`;
  const router = useRouter();
  const user = state.user;

  const workspaces = React.useMemo(() => computeWorkspaces(user), [user]);
  const activeWorkspace =
    workspaces.find((w) => w.slug === activeSlug) ?? null;
  const meta = WORKSPACE_META[activeSlug];
  const navItems = WORKSPACE_NAV[activeSlug];

  return (
    <SidebarProvider>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
      >
        Skip to main content
      </a>

      <Sidebar collapsible="icon">
        <SidebarHeader className="border-b border-sidebar-border px-3 py-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground text-xs font-bold">
              AS
            </div>
            <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
              <p className="text-sm font-semibold text-sidebar-foreground truncate">
                Academic Suite
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {meta.label}
              </p>
            </div>
          </div>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>{meta.label} Workspace</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {navItems.map((item) => {
                  const Icon = NAV_ICONS[item.icon];
                  const isActive = item.exact
                    ? pathname === item.href
                    : pathname === item.href || pathname.startsWith(`${item.href}/`);

                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        isActive={isActive}
                        tooltip={item.label}
                        render={<Link href={item.href} />}
                      >
                        <Icon className="size-4" aria-hidden="true" />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="border-t border-sidebar-border p-3 group-data-[collapsible=icon]:hidden">
          <div className="space-y-1">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Active Context
            </p>
            <div className="flex items-center gap-1.5 flex-wrap">
              <Badge variant="secondary" className="text-xs">
                {meta.shortLabel}
              </Badge>
              {process.env.NODE_ENV === "development" &&
                activeWorkspace?.scopeLabels.map((scope) => (
                  <Badge key={scope} variant="outline" className="text-[11px] font-mono">
                    {scope}
                  </Badge>
                ))}
            </div>
          </div>
        </SidebarFooter>

        <SidebarRail />
      </Sidebar>

      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-30 flex min-h-14 items-center justify-between gap-2 border-b border-border bg-background/95 px-3 sm:px-6 backdrop-blur supports-backdrop-filter:bg-background/80">
          <div className="flex items-center gap-2 min-w-0">
            <SidebarTrigger />
            <Separator orientation="vertical" className="h-5" />
            <span className="text-sm font-semibold text-foreground truncate">
              {meta.label}
            </span>
            <WorkspaceSwitcher
              workspaces={workspaces}
              activeSlug={activeSlug}
              onSelect={(slug) => router.push(`/w/${slug}`)}
            />
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="gap-2 max-w-[160px] sm:max-w-xs"
                  aria-label="Account menu"
                >
                  <Avatar size="sm">
                    <AvatarFallback>{getInitials(user?.name)}</AvatarFallback>
                  </Avatar>
                  <span className="hidden sm:inline truncate text-sm">
                    {user?.name ?? "Account"}
                  </span>
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuGroup>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium text-foreground truncate">
                      {user?.name ?? "Signed-in user"}
                    </span>
                    {user?.email && (
                      <span className="text-xs text-muted-foreground truncate">
                        {user.email}
                      </span>
                    )}
                  </div>
                </DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push("/change-password")}>
                <RiKey2Line className="size-4" aria-hidden="true" />
                Change password
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => void controller.logout()}
              >
                <RiLogoutBoxRLine className="size-4" aria-hidden="true" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <div
          id="main-content"
          tabIndex={-1}
          className="flex-1 w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 outline-none"
        >
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}


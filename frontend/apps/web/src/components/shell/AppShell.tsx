"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  AnimatedThemeToggler,
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
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
  useSidebar,
} from "@academic-suite/ui";
import {
  RiBuilding2Line,
  RiCustomerService2Line,
  RiDashboardLine,
  RiHistoryLine,
  RiLogoutBoxRLine,
  RiNotification3Line,
  RiSettings4Line,
  RiShieldUserLine,
  RiSideBarLine,
  RiUser3Line,
  RiUserSettingsLine,
} from "@remixicon/react";
import { getProfileInitials } from "@/lib/profile/initials";
import { resolveUserAvatarSrc } from "@/lib/profile/avatar";
import logoAsset from "@/app/design-system/logo.svg";
import { useSession } from "@/lib/auth/session-provider";
import { WORKSPACE_NAV, type NavIconKey } from "@/lib/workspaces/navigation";
import {
  WORKSPACE_META,
  computeWorkspaces,
  type WorkspaceSlug,
} from "@/lib/workspaces/workspaces";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import { GlobalSearchCommand } from "./GlobalSearchCommand";
import { WorkspaceBreadcrumbs } from "./WorkspaceBreadcrumbs";

const NAV_ICONS: Record<NavIconKey, React.ComponentType<{ className?: string }>> = {
  overview: RiDashboardLine,
  principal: RiShieldUserLine,
  departments: RiBuilding2Line,
  users: RiUserSettingsLine,
  setup: RiSettings4Line,
  audit: RiHistoryLine,
};

const logoSrc =
  typeof logoAsset === "string"
    ? logoAsset
    : (logoAsset as { src: string }).src;

function SidebarThemeItem() {
  const { state, isMobile } = useSidebar();
  const isCollapsed = state === "collapsed" && !isMobile;

  return (
    <SidebarMenuItem>
      <AnimatedThemeToggler collapsed={isCollapsed} />
    </SidebarMenuItem>
  );
}

function SidebarCollapseItem() {
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";

  return (
    <SidebarMenuItem className="hidden md:block">
      <SidebarMenuButton
        type="button"
        tooltip={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        onClick={toggleSidebar}
      >
        <RiSideBarLine className="size-4" aria-hidden="true" />
        <span>{isCollapsed ? "Expand sidebar" : "Collapse sidebar"}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
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
  const workspaceSlugs = React.useMemo(() => workspaces.map((w) => w.slug), [workspaces]);
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
        <SidebarHeader className="h-14 justify-center border-b border-border px-3 py-0 transition-[padding] duration-200 ease-linear group-data-[collapsible=icon]:px-1.5">
          <div className="flex items-center gap-2.5 min-w-0 transition-[gap] duration-200 ease-linear group-data-[collapsible=icon]:gap-0">
            <img
              src={logoSrc}
              alt="CampusLynk"
              draggable={false}
              className="h-7 w-auto shrink-0 object-contain select-none pointer-events-none"
            />
            <span className="text-lg font-semibold tracking-tight text-sidebar-foreground truncate transition-all duration-200 ease-linear group-data-[collapsible=icon]:w-0 group-data-[collapsible=icon]:opacity-0">
              CampusLynk
            </span>
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
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={pathname === "/profile"}
                    tooltip="Profile"
                    render={<Link href="/profile" />}
                  >
                    <RiUser3Line className="size-4" aria-hidden="true" />
                    <span>Profile</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="border-t border-border p-2">
          <SidebarMenu>
            <SidebarThemeItem />
            <SidebarCollapseItem />
            <div className="-mx-2 my-1 hidden border-t border-border md:block" role="separator" />
            <SidebarMenuItem>
              <SidebarMenuButton type="button" tooltip="Contact Us">
                <RiCustomerService2Line className="size-4" aria-hidden="true" />
                <span>Contact Us</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton type="button" tooltip="Settings">
                <RiSettings4Line className="size-4" aria-hidden="true" />
                <span>Settings</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>

        <SidebarRail />
      </Sidebar>

      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b border-border bg-background/95 px-3 sm:px-6 backdrop-blur supports-backdrop-filter:bg-background/80">
          <div className="flex items-center gap-2 min-w-0">
            <SidebarTrigger className="md:hidden" />
            <Separator orientation="vertical" className="h-5 md:hidden" />
            <span className="text-sm font-semibold text-foreground truncate">
              {meta.label}
            </span>
            <WorkspaceSwitcher
              workspaces={workspaces}
              activeSlug={activeSlug}
              onSelect={(slug) => router.push(`/w/${slug}`)}
            />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Popover>
              <PopoverTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Notifications"
                  >
                    <RiNotification3Line className="size-4" aria-hidden="true" />
                  </Button>
                }
              />
              <PopoverContent align="center" className="w-80 p-0">
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <span className="text-sm font-semibold text-foreground">
                    Notifications
                  </span>
                </div>
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No new notifications
                </div>
              </PopoverContent>
            </Popover>

            <GlobalSearchCommand activeSlug={activeSlug} workspaces={workspaceSlugs} />

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
                      {resolveUserAvatarSrc(user) && (
                        <AvatarImage
                          src={resolveUserAvatarSrc(user) ?? undefined}
                          alt={user?.name ?? "User avatar"}
                        />
                      )}
                      <AvatarFallback>
                        {getProfileInitials(user?.first_name, user?.last_name, user?.name)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="hidden sm:inline truncate text-sm">
                      {user?.name ?? "Account"}
                    </span>
                  </Button>
                }
              />
              <DropdownMenuContent align="center" className="w-56">
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
                <DropdownMenuItem onClick={() => router.push("/profile")}>
                  <RiUser3Line className="size-4" aria-hidden="true" />
                  Profile
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
          </div>
        </header>

        <div
          id="main-content"
          tabIndex={-1}
          className="flex-1 w-full max-w-[96rem] mx-auto p-4 sm:p-6 lg:p-8 outline-none"
        >
          <React.Suspense fallback={null}>
            <WorkspaceBreadcrumbs activeSlug={activeSlug} />
          </React.Suspense>
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}


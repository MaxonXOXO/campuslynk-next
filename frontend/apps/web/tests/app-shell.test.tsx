import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import { renderWithQueryClient } from "./helpers/query-wrapper";
import userEvent from "@testing-library/user-event";
import { WorkspaceShellLayout } from "../src/components/shell/WorkspaceShellLayout";
import type { SessionUser } from "../src/lib/auth/session-core";

const mocks = vi.hoisted(() => ({
  pathname: "/w/super-admin",
  router: { push: vi.fn(), replace: vi.fn() },
  logout: vi.fn(async () => undefined),
  user: null as SessionUser | null,
  client: {
    identity: {
      users: {
        list: vi.fn(async () => ({ data: [], meta: { total: 0 } })),
      },
    },
  },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => mocks.router,
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/auth/auth-guard", () => ({
  AuthGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/lib/auth/session-provider", () => ({
  useApiClient: () => mocks.client,
  useSession: () => ({
    state: { status: "authenticated", user: mocks.user },
    controller: { logout: mocks.logout },
  }),
}));

function setViewportWidth(width: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width,
  });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn((query: string) => ({
      matches: width < 768,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe("App Shell & Workspace Switcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setViewportWidth(1280);
    mocks.pathname = "/w/super-admin";
  });

  afterEach(() => {
    cleanup();
  });

  it("hides the workspace switcher when user has only one workspace and renders zero academic links in Super Admin sidebar", () => {
    mocks.user = {
      id: "01SA",
      name: "IT Head",
      email: "it@dev.test",
      assignments: [
        { role_key: "super_admin", scope_type: "institution", scope_label: "i_dev" },
      ],
    };

    renderWithQueryClient(
      <WorkspaceShellLayout workspace="super-admin">
        <div>Overview Body</div>
      </WorkspaceShellLayout>
    );

    expect(screen.queryByRole("button", { name: "Switch workspace" })).not.toBeInTheDocument();
    expect(screen.getByText("Overview Body")).toBeInTheDocument();

    const sidebarLinks = screen
      .getAllByRole("link")
      .filter((a) => a.getAttribute("href") !== "#main-content");
    expect(sidebarLinks.map((a) => a.getAttribute("href"))).toEqual([
      "/w/super-admin",
      "/w/super-admin/principal",
      "/w/super-admin/users",
      "/w/super-admin/settings",
    ]);

    for (const link of sidebarLinks) {
      expect(link.getAttribute("href")).not.toMatch(
        /(department|batch|program|course|subject|attendance|mark|exam|grade|student|timetable)/i
      );
    }
  });

  it("shows workspace switcher in header on desktop when user has multiple workspaces and switches workspace", async () => {
    const user = userEvent.setup();
    mocks.pathname = "/w/principal";
    mocks.user = {
      id: "01PR",
      name: "Dr. Rao",
      email: "principal@dev.test",
      assignments: [
        { role_key: "principal", scope_type: "institution", scope_label: "i_dev" },
        { role_key: "lecturer", scope_type: "department", scope_label: "d_me" },
      ],
    };

    renderWithQueryClient(
      <WorkspaceShellLayout workspace="principal">
        <div>Principal Body</div>
      </WorkspaceShellLayout>
    );

    const switcher = screen.getByRole("button", { name: "Switch workspace" });
    await user.click(switcher);

    const teachingItem = await screen.findByRole("menuitem", { name: /teaching/i });
    await user.click(teachingItem);

    expect(mocks.router.push).toHaveBeenCalledWith("/w/teaching");
  });

  it("opens a bottom sheet switcher with selected-state semantics on small screens (375px)", async () => {
    const user = userEvent.setup();
    setViewportWidth(375);
    mocks.pathname = "/w/hod";
    mocks.user = {
      id: "01HOD",
      name: "Prof. Nair",
      email: "hod@dev.test",
      assignments: [
        { role_key: "hod", scope_type: "department", scope_label: "d_ce" },
        { role_key: "lecturer", scope_type: "department", scope_label: "d_ce" },
      ],
    };

    renderWithQueryClient(
      <WorkspaceShellLayout workspace="hod">
        <div>HOD Body</div>
      </WorkspaceShellLayout>
    );

    const switcher = screen.getByRole("button", { name: "Switch workspace" });
    await user.click(switcher);

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAttribute("data-side", "bottom");

    const hodOption = within(dialog).getByRole("button", { name: /head of department/i });
    const teachingOption = within(dialog).getByRole("button", { name: /teaching/i });

    expect(hodOption).toHaveAttribute("aria-pressed", "true");
    expect(hodOption).toHaveAttribute("data-selected", "true");
    expect(teachingOption).toHaveAttribute("aria-pressed", "false");
    expect(teachingOption).toHaveAttribute("data-selected", "false");

    await user.click(teachingOption);
    expect(mocks.router.push).toHaveBeenCalledWith("/w/teaching");
  });

  it("renders the theme switcher directly above Collapse sidebar and adapts when collapsed", async () => {
    const user = userEvent.setup();
    mocks.user = {
      id: "01SA",
      name: "IT Head",
      email: "it@dev.test",
      assignments: [
        { role_key: "super_admin", scope_type: "institution", scope_label: "i_dev" },
      ],
    };

    const startViewTransitionMock = vi.fn((cb: () => void) => {
      cb();
      return {
        ready: Promise.resolve(),
        finished: Promise.resolve(),
      };
    });
    Object.defineProperty(document, "startViewTransition", {
      configurable: true,
      writable: true,
      value: startViewTransitionMock,
    });
    Object.defineProperty(document.documentElement, "animate", {
      configurable: true,
      writable: true,
      value: vi.fn(() => ({ cancel: vi.fn() })),
    });

    renderWithQueryClient(
      <WorkspaceShellLayout workspace="super-admin">
        <div>Overview Body</div>
      </WorkspaceShellLayout>
    );

    const themeSwitch = screen.getByRole("switch", { name: /switch to dark mode/i });
    const collapseBtn = screen.getByRole("button", { name: /collapse sidebar/i });
    expect(
      themeSwitch.compareDocumentPosition(collapseBtn) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();

    await user.click(themeSwitch);
    expect(startViewTransitionMock).toHaveBeenCalledTimes(1);
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    await user.click(collapseBtn);
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /switch to dark mode/i })).toBeInTheDocument();
  });

  it("renders search bar and notifications panel button to the left of the profile pill", async () => {
    const user = userEvent.setup();
    mocks.user = {
      id: "01SA",
      name: "IT Head",
      email: "it@dev.test",
      assignments: [
        { role_key: "super_admin", scope_type: "institution", scope_label: "i_dev" },
      ],
    };

    renderWithQueryClient(
      <WorkspaceShellLayout workspace="super-admin">
        <div>Overview Body</div>
      </WorkspaceShellLayout>
    );

    const searchInput = screen.getByRole("searchbox", { name: "Search" });
    const notificationsBtn = screen.getByRole("button", { name: "Notifications" });
    const accountBtn = screen.getByRole("button", { name: "Account menu" });

    expect(
      searchInput.compareDocumentPosition(notificationsBtn) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      notificationsBtn.compareDocumentPosition(accountBtn) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();

    await user.click(notificationsBtn);
    expect(await screen.findByText("No new notifications")).toBeInTheDocument();
  });

  it("renders forbidden state when a user with only a deferred/dropped role (chairman or admin) visits /w/<slug>", () => {
    mocks.user = {
      id: "01CH",
      name: "Chairman User",
      assignments: [{ role_key: "chairman", scope_type: "institution", scope_label: "i_dev" }],
    };

    const { rerender } = renderWithQueryClient(
      <WorkspaceShellLayout workspace="super-admin">
        <div>Protected</div>
      </WorkspaceShellLayout>
    );

    expect(screen.queryByText("Protected")).not.toBeInTheDocument();
    expect(screen.getByText("Workspace Access Unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();

    mocks.user = {
      id: "01AD",
      name: "Legacy Admin",
      assignments: [{ role_key: "admin", scope_type: "institution", scope_label: "i_dev" }],
    };

    rerender(
      <WorkspaceShellLayout workspace="principal">
        <div>Protected Principal</div>
      </WorkspaceShellLayout>
    );

    expect(screen.queryByText("Protected Principal")).not.toBeInTheDocument();
    expect(screen.getByText("Workspace Access Unavailable")).toBeInTheDocument();
  });

  it("renders forbidden state with link to landing workspace when a lecturer visits /w/super-admin", () => {
    mocks.user = {
      id: "01LEC",
      name: "Lecturer User",
      assignments: [{ role_key: "lecturer", scope_type: "department", scope_label: "d_me" }],
    };

    renderWithQueryClient(
      <WorkspaceShellLayout workspace="super-admin">
        <div>Super Admin Secret</div>
      </WorkspaceShellLayout>
    );

    expect(screen.queryByText("Super Admin Secret")).not.toBeInTheDocument();
    expect(screen.getByText("Workspace Access Unavailable")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /go to teaching/i })).toHaveAttribute(
      "href",
      "/w/teaching"
    );
  });
});


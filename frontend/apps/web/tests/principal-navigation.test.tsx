import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithQueryClient } from "./helpers/query-wrapper";
import { WORKSPACE_NAV } from "../src/lib/workspaces/navigation";
import { WorkspaceShellLayout } from "../src/components/shell/WorkspaceShellLayout";
import type { SessionUser } from "../src/lib/auth/session-core";

const mocks = vi.hoisted(() => ({
  pathname: "/w/principal",
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
  useSearchParams: () => new URLSearchParams(""),
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

describe("Principal navigation and dual-role workspace switching", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pathname = "/w/principal";
    mocks.client.identity.users.list.mockResolvedValue({ data: [], meta: { total: 0 } });
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: 1280,
    });
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: vi.fn((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("configures Principal sidebar with Overview, Departments, and Users only (no Super Admin, setup, or Audit routes)", () => {
    const items = WORKSPACE_NAV.principal;
    expect(items.map((item) => item.label)).toEqual([
      "Overview",
      "Departments",
      "Users",
    ]);
    expect(items.map((item) => item.href)).toEqual([
      "/w/principal",
      "/w/principal/departments",
      "/w/principal/users",
    ]);
    for (const item of items) {
      expect(item.href).not.toMatch(/^\/w\/super-admin/);
      expect(item.href).not.toMatch(/^\/setup/);
      expect(item.href).not.toMatch(/audit/i);
    }
  });

  it("allows a dual-role user to see and switch between both workspaces", async () => {
    const user = userEvent.setup();
    mocks.user = {
      id: "01DUAL",
      name: "Dr. Dual Role",
      email: "dual@dev.test",
      assignments: [
        { role_key: "super_admin", scope_type: "institution", scope_label: "i_dev" },
        { role_key: "principal", scope_type: "institution", scope_label: "i_dev" },
      ],
    };

    renderWithQueryClient(
      <WorkspaceShellLayout workspace="principal">
        <div>Principal Content</div>
      </WorkspaceShellLayout>
    );

    const switcher = screen.getByRole("button", { name: "Switch workspace" });
    await user.click(switcher);

    expect(
      await screen.findByRole("menuitem", { name: /super admin/i })
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("menuitem", { name: /principal/i })
    ).toBeInTheDocument();

    await user.click(screen.getByRole("menuitem", { name: /super admin/i }));
    expect(mocks.router.push).toHaveBeenCalledWith("/w/super-admin");
  });

  it("displays a Pending count badge on the Principal Users sidebar item from a limit=1 query", async () => {
    mocks.user = {
      id: "01PRIN",
      name: "Dr. Principal",
      email: "principal@dev.test",
      assignments: [
        { role_key: "principal", scope_type: "institution", scope_label: "i_dev" },
      ],
    };
    mocks.client.identity.users.list.mockResolvedValueOnce({
      data: [],
      meta: { total: 3 },
    });

    renderWithQueryClient(
      <WorkspaceShellLayout workspace="principal">
        <div>Principal Content</div>
      </WorkspaceShellLayout>
    );

    expect(await screen.findByLabelText("3 pending approvals")).toHaveTextContent("3");
    expect(mocks.client.identity.users.list).toHaveBeenCalledWith({
      status: "pending",
      limit: 1,
    });
  });
});

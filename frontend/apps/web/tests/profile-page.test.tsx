import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithQueryClient } from "./helpers/query-wrapper";
import { AppShell } from "../src/components/shell/AppShell";
import { DashboardGreetingHeader } from "../src/components/shell/DashboardGreetingHeader";
import { ProfilePage } from "../src/components/profile/ProfilePage";
import { getProfileInitials } from "../src/lib/profile/initials";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  logout: vi.fn(),
  sectionParam: null as string | null,
  user: {
    id: "01USER",
    name: "Dr. Asha Nair",
    first_name: "Asha" as string | null,
    last_name: "Nair" as string | null,
    email: "asha@college.edu",
    mobile: "+919876543210",
    registration_number: "STF-001",
    role_assignments: [
      { role: { slug: "super_admin" }, scope_label: "institution" },
    ],
    capabilities: [],
  },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/profile",
  useRouter: () => ({
    push: mocks.push,
    replace: mocks.replace,
  }),
  useSearchParams: () =>
    new URLSearchParams(
      mocks.sectionParam ? `section=${mocks.sectionParam}` : ""
    ),
}));

vi.mock("@/lib/auth/session-provider", () => ({
  useSession: () => ({
    controller: {
      logout: mocks.logout,
      bootstrap: vi.fn(),
      changePassword: vi.fn(),
    },
    state: {
      status: "authenticated",
      user: mocks.user,
    },
  }),
  useApiClient: () => ({
    identity: { users: { list: vi.fn().mockResolvedValue({ data: [], meta: { total: 0 } }) } },
    auth: {
      updateMe: vi.fn(),
      sessions: { list: vi.fn(), revoke: vi.fn(), revokeOthers: vi.fn() },
    },
  }),
}));

describe("Profile & Settings v1 — Slice 1", () => {
  beforeEach(() => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    mocks.push.mockReset();
    mocks.replace.mockReset();
    mocks.sectionParam = null;
    mocks.user.first_name = "Asha";
    mocks.user.last_name = "Nair";
    mocks.user.name = "Dr. Asha Nair";
  });

  afterEach(() => {
    cleanup();
  });

  it("derives initials from first_name + last_name when both are set, else from name", () => {
    expect(getProfileInitials("Asha", "Nair", "Dr. Asha Nair")).toBe("AN");
    expect(getProfileInitials("അരുൺ", "നായർ", "Arun Nair")).toBe("അന");
    expect(getProfileInitials("Asha", null, "Dr. Asha Nair")).toBe("DN");
    expect(getProfileInitials(null, null, "Single")).toBe("SI");
  });

  it("renders Profile link (/profile) and Change password link (/profile?section=security) in account menu", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(
      <AppShell activeSlug="super-admin">
        <div>Body</div>
      </AppShell>
    );

    await user.click(screen.getByRole("button", { name: "Account menu" }));
    await user.click(await screen.findByRole("menuitem", { name: "Profile" }));
    expect(mocks.push).toHaveBeenCalledWith("/profile");

    await user.click(screen.getByRole("button", { name: "Account menu" }));
    await user.click(
      await screen.findByRole("menuitem", { name: "Change password" })
    );
    expect(mocks.push).toHaveBeenCalledWith("/profile?section=security");
  });

  it("greets user by first_name verbatim when set and falls back to name when unset", () => {
    const { rerender } = renderWithQueryClient(<DashboardGreetingHeader />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      /Asha$/
    );

    mocks.user.first_name = "   ";
    rerender(<DashboardGreetingHeader />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      /Dr\. Asha Nair$/
    );
  });

  it("selects section from ?section= deep link and falls back to personal info on unknown values", () => {
    mocks.sectionParam = "security";
    const { rerender } = renderWithQueryClient(<ProfilePage />);
    expect(
      screen.getByRole("button", { name: "Security" })
    ).toHaveAttribute("aria-current", "page");

    mocks.sectionParam = "unknown_tab";
    rerender(<ProfilePage />);
    expect(
      screen.getByRole("button", { name: "Personal info" })
    ).toHaveAttribute("aria-current", "page");
  });
});


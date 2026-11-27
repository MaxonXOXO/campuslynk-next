import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiError } from "@academic-suite/api-client";
import { renderWithQueryClient } from "./helpers/query-wrapper";
import { AppShell } from "../src/components/shell/AppShell";
import { DashboardGreetingHeader } from "../src/components/shell/DashboardGreetingHeader";
import { ProfilePage } from "../src/components/profile/ProfilePage";
import { ChangePasswordForm } from "../src/components/auth/ChangePasswordForm";
import { getProfileInitials } from "../src/lib/profile/initials";
import { authStrings } from "../src/lib/auth/strings";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  logout: vi.fn(),
  bootstrap: vi.fn(),
  changePassword: vi.fn(),
  updateMe: vi.fn(),
  sessionsList: vi.fn(),
  sessionsRevoke: vi.fn(),
  sessionsRevokeOthers: vi.fn(),
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
      bootstrap: mocks.bootstrap,
      changePassword: mocks.changePassword,
    },
    state: {
      status: "authenticated",
      user: mocks.user,
    },
  }),
  useApiClient: () => ({
    identity: { users: { list: vi.fn().mockResolvedValue({ data: [], meta: { total: 0 } }) } },
    auth: {
      updateMe: mocks.updateMe,
      sessions: {
        list: mocks.sessionsList,
        revoke: mocks.sessionsRevoke,
        revokeOthers: mocks.sessionsRevokeOthers,
      },
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
    mocks.bootstrap.mockReset().mockResolvedValue(undefined);
    mocks.changePassword.mockReset().mockResolvedValue({ ok: true, route: "/home" });
    mocks.updateMe.mockReset().mockResolvedValue({ data: mocks.user });
    mocks.sessionsList.mockReset().mockResolvedValue({
      data: [
        {
          id: "01SESS_CURR",
          device_label: "Chrome on Windows",
          is_current: true,
          is_support_session: false,
          created_at: "2026-11-27T10:00:00Z",
          last_used_at: "2026-11-27T12:00:00Z",
          expires_at: null,
        },
        {
          id: "01SESS_OTHER",
          device_label: "Safari on iOS",
          is_current: false,
          is_support_session: false,
          created_at: "2026-11-26T10:00:00Z",
          last_used_at: null,
          expires_at: null,
        },
        {
          id: "01SESS_SUPP",
          device_label: "Support session",
          is_current: false,
          is_support_session: true,
          created_at: "2026-11-27T11:30:00Z",
          last_used_at: null,
          expires_at: "2026-11-27T12:00:00Z",
        },
      ],
    });
    mocks.sessionsRevoke.mockReset().mockResolvedValue({ data: { revoked: true } });
    mocks.sessionsRevokeOthers.mockReset().mockResolvedValue({ data: { revoked_count: 1 } });
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

  it("renders read-only full name, email, and mobile with explanatory notes and no avatar upload", () => {
    renderWithQueryClient(<ProfilePage />);

    expect(screen.getByText("Profile photo upload is coming later.")).toBeInTheDocument();
    expect(screen.queryByLabelText(/upload/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Full name")).toHaveAttribute("readonly");
    expect(screen.getByLabelText("Email")).toHaveAttribute("readonly");
    expect(screen.getByLabelText("Mobile")).toHaveAttribute("readonly");
    expect(
      screen.getAllByText("Managed by your institution administrator")
    ).toHaveLength(2);
    expect(
      screen.getAllByText("Email and mobile changes need verification, coming soon")
    ).toHaveLength(2);
  });

  it("submits first_name and last_name via PATCH /me and refreshes session user", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<ProfilePage />);

    const firstInput = screen.getByLabelText("First name");
    const lastInput = screen.getByLabelText("Last name");
    await user.clear(firstInput);
    await user.type(firstInput, "അരുൺ");
    await user.clear(lastInput);
    await user.type(lastInput, "   ");

    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(mocks.updateMe).toHaveBeenCalledWith({
        first_name: "അരുൺ",
        last_name: null,
      });
    });
    expect(mocks.bootstrap).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByText("Personal information updated.")
    ).toBeInTheDocument();
  });

  it("displays API error inline and moves focus to the error alert when PATCH /me fails", async () => {
    const user = userEvent.setup();
    mocks.updateMe.mockRejectedValueOnce(
      new ApiError({
        type: "about:blank",
        title: "Validation failed",
        status: 422,
        detail: "The first_name contains invalid characters.",
        errors: { first_name: ["Invalid character in first name."] },
      })
    );

    renderWithQueryClient(<ProfilePage />);
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("The first_name contains invalid characters.");
    expect(alert.parentElement).toHaveFocus();
    expect(
      screen.getByText("Invalid character in first name.")
    ).toBeInTheDocument();
  });

  it("validates confirm-password mismatch inline in ChangePasswordForm", async () => {
    const user = userEvent.setup();
    mocks.sectionParam = "security";
    renderWithQueryClient(<ProfilePage />);

    await user.type(screen.getByLabelText("Current password"), "CurrentPass99!");
    await user.type(screen.getByLabelText("New password"), "NewStrongPass99!");
    await user.type(screen.getByLabelText("Confirm new password"), "Different99!");
    await user.click(screen.getByRole("button", { name: "Update password" }));

    expect(
      await screen.findByText(authStrings.changePassword.mismatch)
    ).toBeInTheDocument();
    expect(mocks.changePassword).not.toHaveBeenCalled();
  });

  it("sends revoke_other_sessions from /profile and hides checkbox on forced /change-password", async () => {
    const user = userEvent.setup();
    mocks.sectionParam = "security";
    const { rerender } = renderWithQueryClient(<ProfilePage />);

    const checkbox = screen.getByRole("checkbox", {
      name: "Sign out other devices",
    });
    expect(checkbox).toHaveAttribute("aria-checked", "true");
    await user.click(checkbox);

    await user.type(screen.getByLabelText("Current password"), "CurrentPass99!");
    await user.type(screen.getByLabelText("New password"), "NewStrongPass99!");
    await user.type(screen.getByLabelText("Confirm new password"), "NewStrongPass99!");
    await user.click(screen.getByRole("button", { name: "Update password" }));

    await waitFor(() => {
      expect(mocks.changePassword).toHaveBeenCalledWith(
        "CurrentPass99!",
        "NewStrongPass99!",
        false
      );
    });

    rerender(<ChangePasswordForm mode="forced" />);
    expect(
      screen.queryByRole("checkbox", { name: "Sign out other devices" })
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "Other signed-in devices will be signed out when you update your password."
      )
    ).toBeInTheDocument();
  });

  it("lists sessions with This device and Support session (read-only) without Revoke buttons or token hashes", async () => {
    mocks.sectionParam = "security";
    const { container } = renderWithQueryClient(<ProfilePage />);

    expect(await screen.findByText("Chrome on Windows")).toBeInTheDocument();
    expect(screen.getByText("This device")).toBeInTheDocument();
    expect(screen.getByText("Support session (read-only)")).toBeInTheDocument();

    const devicesList = screen.getByRole("list", { name: "Signed-in devices" });
    const listItems = within(devicesList).getAllByRole("listitem");
    expect(listItems).toHaveLength(3);
    expect(within(listItems[0]!).queryByRole("button", { name: "Revoke" })).not.toBeInTheDocument();
    expect(within(listItems[1]!).getByRole("button", { name: "Revoke" })).toBeInTheDocument();
    expect(within(listItems[2]!).queryByRole("button", { name: "Revoke" })).not.toBeInTheDocument();

    expect(container.textContent).not.toMatch(/01SESS_|token|sha256/i);
  });

  it("revokes an individual session with confirmation and refreshes the list", async () => {
    const user = userEvent.setup();
    mocks.sectionParam = "security";
    renderWithQueryClient(<ProfilePage />);

    const revokeBtn = await screen.findByRole("button", { name: "Revoke" });
    await user.click(revokeBtn);

    expect(await screen.findByText("Sign out device?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Revoke session" }));

    await waitFor(() => {
      expect(mocks.sessionsRevoke).toHaveBeenCalledWith("01SESS_OTHER");
    });
    expect(mocks.sessionsList).toHaveBeenCalledTimes(2);
  });

  it("revokes all other sessions with confirmation and refreshes the list", async () => {
    const user = userEvent.setup();
    mocks.sectionParam = "security";
    renderWithQueryClient(<ProfilePage />);

    const revokeAllBtn = await screen.findByRole("button", {
      name: "Sign out all other sessions",
    });
    await user.click(revokeAllBtn);

    const dialog = await screen.findByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Sign out all other sessions" })
    );

    await waitFor(() => {
      expect(mocks.sessionsRevokeOthers).toHaveBeenCalledTimes(1);
    });
    expect(mocks.sessionsList).toHaveBeenCalledTimes(2);
  });

  it("shows loading, empty, and error retry states for sessions", async () => {
    const user = userEvent.setup();
    mocks.sectionParam = "security";
    mocks.sessionsList.mockReturnValueOnce(new Promise(() => {}));
    const { unmount } = renderWithQueryClient(<ProfilePage />);
    expect(screen.getByLabelText("Loading active sessions")).toBeInTheDocument();
    unmount();

    mocks.sessionsList.mockResolvedValueOnce({ data: [] });
    const emptyRender = renderWithQueryClient(<ProfilePage />);
    expect(await screen.findByText("No active sessions found.")).toBeInTheDocument();
    emptyRender.unmount();

    mocks.sessionsList
      .mockRejectedValueOnce(new Error("Network error"))
      .mockResolvedValueOnce({ data: [] });
    renderWithQueryClient(<ProfilePage />);
    expect(
      await screen.findByText("Unable to load active sessions")
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("No active sessions found.")).toBeInTheDocument();
  });
});


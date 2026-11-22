import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiError } from "@academic-suite/api-client";
import { SuperAdminUsersPage } from "../src/components/super-admin/SuperAdminUsersPage";

const mocks = vi.hoisted(() => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  client: {
    users: {
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      suspend: vi.fn(),
      reactivate: vi.fn(),
      unlock: vi.fn(),
      resetPassword: vi.fn(),
    },
  },
  sessionUser: {
    id: "01SA",
    name: "IT Head",
    assignments: [
      { role_key: "super_admin", scope_type: "institution", scope_label: "i_carmel" },
    ],
  },
}));

vi.mock("@/lib/auth/session-provider", () => ({
  useApiClient: () => mocks.client,
  useSession: () => ({
    state: { status: "authenticated", user: mocks.sessionUser },
  }),
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));

const SAMPLE_USERS = [
  {
    id: "01SA",
    type: "staff",
    name: "IT Head",
    email: "it@dev.test",
    mobile: null,
    registration_number: null,
    status: "active",
    must_change_password: false,
    temporary_password_expires_at: null,
    is_locked: false,
    locked_until: null,
    last_login_at: "2026-11-20T09:00:00Z",
    assignments: [
      {
        id: "01A_SA",
        role_key: "super_admin",
        role_name: "Super Admin",
        scope_type: "institution",
        scope_label: "i_carmel",
      },
    ],
  },
  {
    id: "01U_ACTIVE",
    type: "staff",
    name: "Ananya Menon",
    email: "ananya@dev.test",
    mobile: "+919876543210",
    registration_number: null,
    status: "active",
    must_change_password: true,
    temporary_password_expires_at: "2026-11-24T12:00:00Z",
    is_locked: true,
    locked_until: "2026-11-22T12:15:00Z",
    last_login_at: "2026-11-20T09:00:00Z",
    assignments: [
      {
        id: "01A_LEC",
        role_key: "lecturer",
        role_name: "Lecturer",
        scope_type: "department",
        scope_label: "d_ce",
      },
    ],
  },
  {
    id: "01U_SUSPENDED",
    type: "student",
    name: "Basil Varghese",
    email: "basil@dev.test",
    mobile: null,
    registration_number: "REG-2026-002",
    status: "suspended",
    must_change_password: false,
    temporary_password_expires_at: null,
    is_locked: false,
    locked_until: null,
    last_login_at: null,
    assignments: [],
  },
];

describe("SuperAdminUsersPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    mocks.sessionUser = {
      id: "01SA",
      name: "IT Head",
      assignments: [
        { role_key: "super_admin", scope_type: "institution", scope_label: "i_carmel" },
      ],
    };
    mocks.client.users.list.mockResolvedValue({
      data: SAMPLE_USERS,
      meta: { current_page: 1, last_page: 2, per_page: 25, total: 30 },
    });
    mocks.client.users.update.mockResolvedValue({ data: SAMPLE_USERS[1] });
    mocks.client.users.suspend.mockResolvedValue({
      data: { ...SAMPLE_USERS[1], status: "suspended" },
    });
    mocks.client.users.reactivate.mockResolvedValue({
      data: { ...SAMPLE_USERS[2], status: "active" },
    });
    mocks.client.users.unlock.mockResolvedValue({ data: { message: "Unlocked" } });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders Roles column, Locked badge, expiry hint, and enables Create User with temporary password reveal", async () => {
    const user = userEvent.setup();
    const secret = "TempCreate#2026";
    render(<SuperAdminUsersPage />);

    await waitFor(() => {
      expect(screen.getAllByText("Ananya Menon").length).toBeGreaterThan(0);
    });

    expect(screen.queryByText(/awaiting backend support/i)).not.toBeInTheDocument();

    const table = screen.getByRole("table");
    const headers = within(table).getAllByRole("columnheader").map((th) => th.textContent);
    expect(headers).toEqual([
      "Name",
      "Type",
      "Roles",
      "Contact",
      "Status",
      "Last Login",
      "Actions",
    ]);

    expect(within(table).getByText("Lecturer")).toBeInTheDocument();
    expect(within(table).getByText("Locked")).toBeInTheDocument();
    expect(within(table).getByText(/expires 24 Nov 2026/i)).toBeInTheDocument();

    // Create User flow
    const createBtn = screen.getByRole("button", { name: /create user/i });
    expect(createBtn).toBeEnabled();
    await user.click(createBtn);

    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Full Name"), "Dr. Priya Nair");
    await user.type(within(dialog).getByLabelText("Email"), "priya@dev.test");

    mocks.client.users.create.mockResolvedValueOnce({
      data: {
        id: "01U_PRIYA",
        type: "staff",
        name: "Dr. Priya Nair",
        email: "priya@dev.test",
        status: "active",
        must_change_password: true,
        is_locked: false,
        assignments: [],
        temporary_password: secret,
        expires_at: "2026-11-24T12:00:00Z",
      },
    });

    await user.click(within(dialog).getByRole("button", { name: "Create Account" }));

    expect(
      await screen.findByText(/One-Time Temporary Password for Dr\. Priya Nair/i)
    ).toBeInTheDocument();
    expect(JSON.stringify(localStorage)).not.toContain(secret);
    expect(JSON.stringify(sessionStorage)).not.toContain(secret);
    expect(window.location.href).not.toContain(secret);
  });

  it("disables Reset temporary password for self/higher-role, shows Unlock only when locked, and handles 200 + 403 resetPassword", async () => {
    const user = userEvent.setup();

    // Pretend logged-in user is HOD (rank 70), so Super Admin (100) is higher-role
    mocks.sessionUser = {
      id: "01HOD_SELF",
      name: "HOD Self",
      assignments: [
        { role_key: "hod", scope_type: "department", scope_label: "d_ce" },
      ],
    };

    mocks.client.users.list.mockResolvedValue({
      data: [
        {
          id: "01HOD_SELF",
          type: "staff",
          name: "HOD Self",
          email: "hod@dev.test",
          status: "active",
          must_change_password: false,
          is_locked: false,
          assignments: [
            {
              id: "01A_HOD",
              role_key: "hod",
              role_name: "HOD",
              scope_type: "department",
              scope_label: "d_ce",
            },
          ],
        },
        ...SAMPLE_USERS,
      ],
      meta: { current_page: 1, last_page: 1, per_page: 25, total: 4 },
    });

    render(<SuperAdminUsersPage />);
    await waitFor(() => {
      expect(screen.getAllByText("Ananya Menon").length).toBeGreaterThan(0);
    });

    // Self row: Reset disabled, Unlock hidden (not locked)
    await user.click(screen.getAllByRole("button", { name: "Actions for HOD Self" })[0]!);
    const selfReset = await screen.findByRole("menuitem", { name: /reset temporary password/i });
    expect(selfReset).toHaveAttribute("aria-disabled", "true");
    expect(screen.queryByRole("menuitem", { name: /unlock account/i })).not.toBeInTheDocument();
    await user.keyboard("{Escape}");

    // Higher-role row (IT Head = super_admin): Reset disabled
    await user.click(screen.getAllByRole("button", { name: "Actions for IT Head" })[0]!);
    const higherReset = await screen.findByRole("menuitem", { name: /reset temporary password/i });
    expect(higherReset).toHaveAttribute("aria-disabled", "true");
    await user.keyboard("{Escape}");

    // Lower-role locked row (Ananya Menon = lecturer, is_locked = true): Unlock visible + Reset enabled
    await user.click(screen.getAllByRole("button", { name: "Actions for Ananya Menon" })[0]!);
    expect(await screen.findByRole("menuitem", { name: /unlock account/i })).toBeInTheDocument();
    const lecReset = await screen.findByRole("menuitem", { name: /reset temporary password/i });
    expect(lecReset).not.toHaveAttribute("aria-disabled", "true");

    await user.click(lecReset);
    const confirmDialog = await screen.findByRole("alertdialog");

    // First test 403 out-of-scope response
    mocks.client.users.resetPassword.mockRejectedValueOnce(
      new ApiError({
        type: "https://errors.campuslynk.net/forbidden",
        title: "Forbidden",
        status: 403,
        detail: "Target user is outside your authorized department scope.",
      })
    );
    await user.click(within(confirmDialog).getByRole("button", { name: "Reset Password" }));
    expect(
      await screen.findByText("Target user is outside your authorized department scope.")
    ).toBeInTheDocument();

    // Now test 200 success -> reveal
    await user.click(screen.getAllByRole("button", { name: "Actions for Ananya Menon" })[0]!);
    await user.click(await screen.findByRole("menuitem", { name: /reset temporary password/i }));
    const confirmDialog2 = await screen.findByRole("alertdialog");

    mocks.client.users.resetPassword.mockResolvedValueOnce({
      data: {
        user_id: "01U_ACTIVE",
        temporary_password: "Reset#Temp99",
        expires_at: "2026-11-24T12:00:00Z",
        must_change_password: true,
      },
    });
    await user.click(within(confirmDialog2).getByRole("button", { name: "Reset Password" }));

    expect(
      await screen.findByText(/One-Time Temporary Password for Ananya Menon/i)
    ).toBeInTheDocument();
  });
});

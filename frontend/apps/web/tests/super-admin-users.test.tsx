import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { renderWithQueryClient } from "./helpers/query-wrapper";
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
      deactivate: vi.fn(),
      approve: vi.fn(),
      reject: vi.fn(),
      bulkApprove: vi.fn(),
      unlock: vi.fn(),
      resetPassword: vi.fn(),
    },
  },
  sessionUser: {
    id: "01SA",
    name: "IT Head",
    capabilities: ["identity.user.create"],
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

const ALL_FALSE_ABILITIES = {
  update: false,
  suspend: false,
  reactivate: false,
  deactivate: false,
  reset_password: false,
  unlock: false,
  approve: false,
  reject: false,
};

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
    abilities: { ...ALL_FALSE_ABILITIES, update: true },
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
    abilities: {
      ...ALL_FALSE_ABILITIES,
      update: true,
      suspend: true,
      deactivate: true,
      reset_password: true,
      unlock: true,
    },
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
    abilities: {
      ...ALL_FALSE_ABILITIES,
      update: true,
      reactivate: true,
    },
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
      capabilities: ["identity.user.create"],
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

  it("renders Roles column, Locked badge, and temporary password expiry hint", async () => {
    renderWithQueryClient(<SuperAdminUsersPage />);

    await waitFor(() => {
      expect(screen.getAllByText("Ananya Menon").length).toBeGreaterThan(0);
    });

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
  });

  it("creates a user and shows ephemeral temporary password reveal without persisting secrets", async () => {
    const user = userEvent.setup();
    const secret = "TempCreate#2026";
    renderWithQueryClient(<SuperAdminUsersPage />);

    await waitFor(() => {
      expect(screen.getAllByText("Ananya Menon").length).toBeGreaterThan(0);
    });

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
        abilities: ALL_FALSE_ABILITIES,
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
  }, 15000);

  it("hides Reset temporary password when abilities.reset_password is false", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<SuperAdminUsersPage />);
    await waitFor(() => {
      expect(screen.getAllByText("IT Head").length).toBeGreaterThan(0);
    });

    await user.click(screen.getAllByRole("button", { name: "Actions for IT Head" })[0]!);
    expect(
      screen.queryByRole("menuitem", { name: /reset temporary password/i })
    ).not.toBeInTheDocument();
  });

  it("shows Unlock account only when is_locked is true and abilities.unlock is true", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<SuperAdminUsersPage />);
    await waitFor(() => {
      expect(screen.getAllByText("Ananya Menon").length).toBeGreaterThan(0);
    });

    await user.click(screen.getAllByRole("button", { name: "Actions for IT Head" })[0]!);
    expect(screen.queryByRole("menuitem", { name: /unlock account/i })).not.toBeInTheDocument();
    await user.keyboard("{Escape}");

    await user.click(screen.getAllByRole("button", { name: "Actions for Ananya Menon" })[0]!);
    expect(await screen.findByRole("menuitem", { name: /unlock account/i })).toBeInTheDocument();
  });

  it("surfaces 403 out-of-scope error when resetting temporary password", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<SuperAdminUsersPage />);
    await waitFor(() => {
      expect(screen.getAllByText("Ananya Menon").length).toBeGreaterThan(0);
    });

    await user.click(screen.getAllByRole("button", { name: "Actions for Ananya Menon" })[0]!);
    await user.click(await screen.findByRole("menuitem", { name: /reset temporary password/i }));
    const confirmDialog = await screen.findByRole("alertdialog");

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
  });

  it("resets temporary password and shows one-time reveal on 200", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<SuperAdminUsersPage />);
    await waitFor(() => {
      expect(screen.getAllByText("Ananya Menon").length).toBeGreaterThan(0);
    });

    await user.click(screen.getAllByRole("button", { name: "Actions for Ananya Menon" })[0]!);
    await user.click(await screen.findByRole("menuitem", { name: /reset temporary password/i }));
    const confirmDialog = await screen.findByRole("alertdialog");

    mocks.client.users.resetPassword.mockResolvedValueOnce({
      data: {
        user_id: "01U_ACTIVE",
        temporary_password: "Reset#Temp99",
        expires_at: "2026-11-24T12:00:00Z",
        must_change_password: true,
      },
    });
    await user.click(within(confirmDialog).getByRole("button", { name: "Reset Password" }));

    expect(
      await screen.findByText(/One-Time Temporary Password for Ananya Menon/i)
    ).toBeInTheDocument();
  });
});

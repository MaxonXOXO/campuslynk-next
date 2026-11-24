import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { renderWithQueryClient } from "./helpers/query-wrapper";
import userEvent from "@testing-library/user-event";
import { PrincipalUsersPage } from "../src/components/principal/PrincipalUsersPage";

const mocks = vi.hoisted(() => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  client: {
    identity: {
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
  },
  sessionUser: {
    id: "01PRIN",
    name: "Dr. Principal",
    capabilities: ["identity.user.create"],
    assignments: [
      { role_key: "principal", scope_type: "institution", scope_label: "i_carmel" },
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
    last_login_at: null,
    assignments: [{ id: "a_sa", role_key: "super_admin", role_name: "Super Admin" }],
  },
  {
    id: "01PRIN",
    type: "staff",
    name: "Dr. Principal",
    email: "principal@dev.test",
    mobile: null,
    registration_number: null,
    status: "active",
    must_change_password: false,
    temporary_password_expires_at: null,
    is_locked: false,
    locked_until: null,
    last_login_at: null,
    assignments: [{ id: "a_pr", role_key: "principal", role_name: "Principal" }],
  },
  {
    id: "01LEC",
    type: "staff",
    name: "Ananya Menon",
    email: "ananya@dev.test",
    mobile: null,
    registration_number: null,
    status: "active",
    must_change_password: false,
    temporary_password_expires_at: null,
    is_locked: true,
    locked_until: "2026-11-24T12:00:00Z",
    last_login_at: null,
    assignments: [{ id: "a_lec", role_key: "lecturer", role_name: "Lecturer" }],
  },
];

describe("PrincipalUsersPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    mocks.sessionUser = {
      id: "01PRIN",
      name: "Dr. Principal",
      capabilities: ["identity.user.create"],
      assignments: [
        { role_key: "principal", scope_type: "institution", scope_label: "i_carmel" },
      ],
    };
    mocks.client.identity.users.list.mockResolvedValue({
      data: SAMPLE_USERS,
      meta: { current_page: 1, last_page: 1, per_page: 25, total: 3 },
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders Roles column and Locked badge without any awaiting backend text", async () => {
    renderWithQueryClient(<PrincipalUsersPage />);

    await waitFor(() => {
      expect(screen.getAllByText("Ananya Menon").length).toBeGreaterThan(0);
    });

    expect(screen.queryByText(/awaiting backend/i)).not.toBeInTheDocument();
    const table = screen.getByRole("table");
    expect(within(table).getByText("Lecturer")).toBeInTheDocument();
    expect(within(table).getByText("Locked")).toBeInTheDocument();
  });

  it("creates a user without role fields and reveals ephemeral temporary password", async () => {
    const user = userEvent.setup();
    const secret = "TempPrinUser#2026";
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    renderWithQueryClient(<PrincipalUsersPage />);

    await waitFor(() => {
      expect(screen.getAllByText("Ananya Menon").length).toBeGreaterThan(0);
    });

    await user.click(screen.getByRole("button", { name: /create user/i }));
    const dialog = await screen.findByRole("dialog");

    expect(within(dialog).queryByLabelText(/role/i)).not.toBeInTheDocument();

    await user.type(within(dialog).getByLabelText("Full Name"), "New Lecturer");
    await user.type(within(dialog).getByLabelText("Email"), "newlec@dev.test");

    mocks.client.identity.users.create.mockResolvedValueOnce({
      data: {
        id: "01U_NEW",
        type: "staff",
        name: "New Lecturer",
        email: "newlec@dev.test",
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
      await screen.findByText(/One-Time Temporary Password for New Lecturer/i)
    ).toBeInTheDocument();
    expect(JSON.stringify(localStorage)).not.toContain(secret);
    expect(JSON.stringify(sessionStorage)).not.toContain(secret);
    expect(window.location.href).not.toContain(secret);
    expect(logSpy.mock.calls.flat().join(" ")).not.toContain(secret);
  }, 15000);

  it("hides Create User when identity.user.create capability is absent", async () => {
    mocks.sessionUser = {
      ...mocks.sessionUser,
      capabilities: [],
    };

    renderWithQueryClient(<PrincipalUsersPage />);

    await waitFor(() => {
      expect(screen.getAllByText("Ananya Menon").length).toBeGreaterThan(0);
    });

    expect(screen.queryByRole("button", { name: /create user/i })).not.toBeInTheDocument();
  });

  it("hides all row actions when capabilities do not include row-action permissions", async () => {
    renderWithQueryClient(<PrincipalUsersPage />);

    await waitFor(() => {
      expect(screen.getAllByText("Ananya Menon").length).toBeGreaterThan(0);
    });

    expect(
      screen.queryByRole("button", { name: "Actions for Ananya Menon" })
    ).not.toBeInTheDocument();
  });

  it("hides row actions for self and super_admin even when row-action capabilities are granted", async () => {
    mocks.sessionUser = {
      ...mocks.sessionUser,
      capabilities: [
        "identity.user.create",
        "identity.user.suspend",
        "identity.user.reset_password",
        "identity.user.unlock",
      ],
    };

    renderWithQueryClient(<PrincipalUsersPage />);

    await waitFor(() => {
      expect(screen.getAllByText("Ananya Menon").length).toBeGreaterThan(0);
    });

    expect(
      screen.queryByRole("button", { name: "Actions for Dr. Principal" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Actions for IT Head" })
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Actions for Ananya Menon" }).length
    ).toBeGreaterThan(0);
  });
});


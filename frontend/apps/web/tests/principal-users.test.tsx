import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { renderWithQueryClient } from "./helpers/query-wrapper";
import userEvent from "@testing-library/user-event";
import { ApiError } from "@academic-suite/api-client";
import { PrincipalUsersPage } from "../src/components/principal/PrincipalUsersPage";
import { SuperAdminUsersPage } from "../src/components/super-admin/SuperAdminUsersPage";

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
        deactivate: vi.fn(),
        approve: vi.fn(),
        reject: vi.fn(),
        bulkApprove: vi.fn(),
        unlock: vi.fn(),
        resetPassword: vi.fn(),
      },
    },
    organisation: {
      departments: {
        list: vi.fn(),
      },
    },
  },
  sessionUser: {
    id: "01PRIN",
    name: "Dr. Principal",
    capabilities: [
      "identity.user.create",
      "identity.user.approve",
      "identity.user.reject",
    ],
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

const FALSE_ABILITIES = {
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
    last_login_at: null,
    assignments: [{ id: "a_sa", role_key: "super_admin", role_name: "Super Admin" }],
    abilities: { ...FALSE_ABILITIES },
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
    abilities: {
      ...FALSE_ABILITIES,
      update: true,
      suspend: true,
      deactivate: true,
      reset_password: true,
      unlock: true,
    },
  },
  {
    id: "01PEND",
    type: "staff",
    name: "Rahul Krishnan",
    email: "rahul@dev.test",
    mobile: null,
    registration_number: null,
    status: "pending",
    must_change_password: false,
    temporary_password_expires_at: null,
    is_locked: false,
    locked_until: null,
    last_login_at: null,
    staff_profile: {
      requested_department_id: "d_ce",
      designation: "Assistant Professor",
    },
    assignments: [],
    abilities: {
      ...FALSE_ABILITIES,
      approve: true,
      reject: true,
    },
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
      capabilities: [
        "identity.user.create",
        "identity.user.approve",
        "identity.user.reject",
      ],
      assignments: [
        { role_key: "principal", scope_type: "institution", scope_label: "i_carmel" },
      ],
    };
    mocks.client.identity.users.list.mockResolvedValue({
      data: SAMPLE_USERS,
      meta: { current_page: 1, last_page: 1, per_page: 25, total: 3 },
    });
    mocks.client.organisation.departments.list.mockResolvedValue({
      data: [{ id: "d_ce", code: "CE", name: "Civil Engineering" }],
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders row actions from UserResource.abilities and hides menu when all abilities are false", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<PrincipalUsersPage />);

    await waitFor(() => {
      expect(screen.getAllByText("Ananya Menon").length).toBeGreaterThan(0);
    });

    expect(
      screen.queryByRole("button", { name: "Actions for IT Head" })
    ).not.toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: "Actions for Ananya Menon" })[0]!);
    expect(await screen.findByRole("menuitem", { name: /deactivate account/i })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /approve account/i })).not.toBeInTheDocument();
  });

  it("relies on UserResource.abilities rather than a local role-rank table even for super_admin rows", async () => {
    const user = userEvent.setup();
    mocks.client.identity.users.list.mockResolvedValueOnce({
      data: [
        {
          ...SAMPLE_USERS[0],
          abilities: { ...FALSE_ABILITIES, update: true },
        },
      ],
      meta: { current_page: 1, last_page: 1, per_page: 25, total: 1 },
    });

    renderWithQueryClient(<PrincipalUsersPage />);
    await waitFor(() => {
      expect(screen.getAllByText("IT Head").length).toBeGreaterThan(0);
    });

    await user.click(screen.getAllByRole("button", { name: "Actions for IT Head" })[0]!);
    expect(await screen.findByRole("menuitem", { name: /edit details/i })).toBeInTheDocument();
  });

  it("shows Deactivate warning about sign-in, role assignments, and HOD vacancy, and validates reason 5-500 chars", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<PrincipalUsersPage />);

    await waitFor(() => {
      expect(screen.getAllByText("Ananya Menon").length).toBeGreaterThan(0);
    });

    await user.click(screen.getAllByRole("button", { name: "Actions for Ananya Menon" })[0]!);
    await user.click(await screen.findByRole("menuitem", { name: /deactivate account/i }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/revokes sign-in access/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/ends all active role assignments/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/department or role will become vacant/i)).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText("Reason"), "abc");
    await user.click(within(dialog).getByRole("button", { name: "Deactivate Account" }));

    expect(
      within(dialog).getByText("Reason must be between 5 and 500 characters.")
    ).toBeInTheDocument();
    expect(mocks.client.identity.users.deactivate).not.toHaveBeenCalled();
  });

  it("maps 403 and 409 errors in the Deactivate dialog", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<PrincipalUsersPage />);

    await waitFor(() => {
      expect(screen.getAllByText("Ananya Menon").length).toBeGreaterThan(0);
    });

    await user.click(screen.getAllByRole("button", { name: "Actions for Ananya Menon" })[0]!);
    await user.click(await screen.findByRole("menuitem", { name: /deactivate account/i }));

    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Reason"), "Resigned from post");

    mocks.client.identity.users.deactivate.mockRejectedValueOnce(
      new ApiError({
        type: "about:blank",
        title: "Forbidden",
        status: 403,
        detail: "Cannot deactivate a higher authority user.",
      })
    );
    await user.click(within(dialog).getByRole("button", { name: "Deactivate Account" }));
    expect(
      await within(dialog).findByText("Cannot deactivate a higher authority user.")
    ).toBeInTheDocument();

    mocks.client.identity.users.deactivate.mockRejectedValueOnce(
      new ApiError({
        type: "about:blank",
        title: "Conflict",
        status: 409,
        detail: "Cannot deactivate the last active Super Admin.",
      })
    );
    await user.click(within(dialog).getByRole("button", { name: "Deactivate Account" }));
    expect(
      await within(dialog).findByText("Cannot deactivate the last active Super Admin.")
    ).toBeInTheDocument();
  });

  it("validates required reason (5-500 chars) on Reject", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<PrincipalUsersPage />);

    await waitFor(() => {
      expect(screen.getAllByText("Rahul Krishnan").length).toBeGreaterThan(0);
    });

    await user.click(screen.getAllByRole("button", { name: "Actions for Rahul Krishnan" })[0]!);
    await user.click(await screen.findByRole("menuitem", { name: /reject account/i }));

    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Reject Account" }));

    expect(
      within(dialog).getByText("Reason must be between 5 and 500 characters.")
    ).toBeInTheDocument();
    expect(mocks.client.identity.users.reject).not.toHaveBeenCalled();
  });

  it("notes that reactivating a deactivated user restores status only and surfaces 409 errors", async () => {
    const user = userEvent.setup();
    mocks.client.identity.users.list.mockResolvedValueOnce({
      data: [
        {
          ...SAMPLE_USERS[1],
          status: "deactivated",
          abilities: { ...FALSE_ABILITIES, reactivate: true },
        },
      ],
      meta: { current_page: 1, last_page: 1, per_page: 25, total: 1 },
    });

    renderWithQueryClient(<PrincipalUsersPage />);
    await waitFor(() => {
      expect(screen.getAllByText("Ananya Menon").length).toBeGreaterThan(0);
    });

    await user.click(screen.getAllByRole("button", { name: "Actions for Ananya Menon" })[0]!);
    await user.click(await screen.findByRole("menuitem", { name: /reactivate account/i }));

    const confirmDialog = await screen.findByRole("alertdialog");
    expect(
      within(confirmDialog).getByText(/previously ended role assignments remain ended/i)
    ).toBeInTheDocument();

    mocks.client.identity.users.reactivate.mockRejectedValueOnce(
      new ApiError({
        type: "about:blank",
        title: "Conflict",
        status: 409,
        detail: "Rejected accounts cannot be reactivated.",
      })
    );
    await user.click(within(confirmDialog).getByRole("button", { name: "Reactivate" }));
    expect(
      await screen.findByText("Rejected accounts cannot be reactivated.")
    ).toBeInTheDocument();
  });

  it("renders requested department, designation, and bulk-approve per-row summary in the Pending tab", async () => {
    const user = userEvent.setup();
    mocks.client.identity.users.list.mockResolvedValue({
      data: [SAMPLE_USERS[2]],
      meta: { current_page: 1, last_page: 1, per_page: 25, total: 1 },
    });
    mocks.client.identity.users.bulkApprove.mockResolvedValueOnce({
      data: {
        summary: { approved: 1, failed: 1 },
        results: [
          { user_id: "01PEND", status: "approved", message: null },
          { user_id: "01SKIP", status: "skipped", message: "Already active" },
        ],
      },
    });

    renderWithQueryClient(<PrincipalUsersPage />);
    await user.click(await screen.findByRole("tab", { name: /pending approval/i }));

    await waitFor(() => {
      expect(screen.getAllByText("Rahul Krishnan").length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText(/Assistant Professor/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Civil Engineering \(CE\)/i).length).toBeGreaterThan(0);

    await user.click(screen.getAllByRole("checkbox", { name: "Select Rahul Krishnan" })[0]!);
    await user.click(screen.getByRole("button", { name: /approve selected \(1\)/i }));

    expect(
      await screen.findByText(/Bulk Approval Summary: 1 approved, 1 not approved/i)
    ).toBeInTheDocument();
    expect(screen.getByText("approved")).toBeInTheDocument();
    expect(screen.getByText("skipped")).toBeInTheDocument();
    expect(screen.getByText("Already active")).toBeInTheDocument();
  });

  it("displays a Principal-created user in the directory after query invalidation and refetch", async () => {
    const user = userEvent.setup();
    mocks.client.identity.users.list
      .mockResolvedValueOnce({
        data: SAMPLE_USERS,
        meta: { current_page: 1, last_page: 1, per_page: 25, total: 3 },
      })
      .mockResolvedValueOnce({
        data: [
          ...SAMPLE_USERS,
          {
            id: "01NEW_STAFF",
            type: "staff",
            name: "Dr. Meera Nair",
            email: "meera@dev.test",
            mobile: null,
            registration_number: null,
            status: "active",
            must_change_password: true,
            temporary_password_expires_at: "2026-11-26T12:00:00Z",
            is_locked: false,
            locked_until: null,
            last_login_at: null,
            assignments: [],
            abilities: FALSE_ABILITIES,
          },
        ],
        meta: { current_page: 1, last_page: 1, per_page: 25, total: 4 },
      });

    mocks.client.identity.users.create.mockResolvedValueOnce({
      data: {
        id: "01NEW_STAFF",
        type: "staff",
        name: "Dr. Meera Nair",
        email: "meera@dev.test",
        status: "active",
        must_change_password: true,
        is_locked: false,
        assignments: [],
        abilities: FALSE_ABILITIES,
        temporary_password: "Temp#Meera2026",
        expires_at: "2026-11-26T12:00:00Z",
      },
    });

    renderWithQueryClient(<PrincipalUsersPage />);
    await waitFor(() => {
      expect(screen.getAllByText("Ananya Menon").length).toBeGreaterThan(0);
    });

    await user.click(screen.getByRole("button", { name: /create user/i }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Full Name"), "Dr. Meera Nair");
    await user.type(within(dialog).getByLabelText("Email"), "meera@dev.test");
    await user.click(within(dialog).getByRole("button", { name: "Create Account" }));

    await waitFor(() => {
      expect(screen.getAllByText("Dr. Meera Nair").length).toBeGreaterThan(0);
    });
  }, 15000);

  it("renders the same shared UserDirectory for Super Admin and Principal with different abilities", async () => {
    mocks.client.identity.users.list.mockResolvedValue({
      data: [
        {
          ...SAMPLE_USERS[1],
          abilities: { ...FALSE_ABILITIES, deactivate: false },
        },
      ],
      meta: { current_page: 1, last_page: 1, per_page: 25, total: 1 },
    });

    renderWithQueryClient(<SuperAdminUsersPage />);
    await waitFor(() => {
      expect(screen.getAllByText("Ananya Menon").length).toBeGreaterThan(0);
    });
    expect(
      screen.queryByRole("button", { name: "Actions for Ananya Menon" })
    ).not.toBeInTheDocument();
  });
});

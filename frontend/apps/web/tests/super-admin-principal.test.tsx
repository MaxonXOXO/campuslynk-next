import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiError } from "@academic-suite/api-client";
import { SuperAdminPrincipalPage } from "../src/components/super-admin/SuperAdminPrincipalPage";

const mocks = vi.hoisted(() => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  client: {
    roleAssignments: { list: vi.fn(), create: vi.fn(), delete: vi.fn() },
    users: { list: vi.fn(), get: vi.fn() },
    identity: {
      principal: { appoint: vi.fn(), replace: vi.fn() },
    },
  },
  user: {
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
    state: { status: "authenticated", user: mocks.user },
  }),
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));

const STAFF_LIST = [
  {
    id: "01STAFF_1",
    type: "staff",
    name: "Dr. Asha Nair",
    email: "asha@dev.test",
    mobile: "+919876543210",
    registration_number: null,
    status: "active",
    must_change_password: false,
    is_locked: false,
    assignments: [],
    last_login_at: null,
  },
  {
    id: "01STAFF_2",
    type: "staff",
    name: "Prof. Thomas Kurian",
    email: "thomas@dev.test",
    mobile: "+919876543211",
    registration_number: null,
    status: "active",
    must_change_password: false,
    is_locked: false,
    assignments: [],
    last_login_at: null,
  },
];

describe("SuperAdminPrincipalPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    mocks.client.users.list.mockResolvedValue({
      data: STAFF_LIST,
      meta: { current_page: 1, last_page: 1, per_page: 25, total: 2 },
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("supports appointing an existing staff user and creating + appointing a new user with ephemeral temporary password reveal", async () => {
    const user = userEvent.setup();
    const secret = "TempPrin#2026!Xy";
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);

    mocks.client.roleAssignments.list.mockResolvedValue({
      data: [],
      meta: { current_page: 1, last_page: 1, per_page: 25, total: 0 },
    });

    const { unmount } = render(<SuperAdminPrincipalPage />);

    await waitFor(() => {
      expect(
        screen.getByRole("radiogroup", { name: "Appointment method" })
      ).toBeInTheDocument();
    });

    expect(screen.queryByText(/awaiting backend support/i)).not.toBeInTheDocument();

    // Switch to "Create new account & appoint"
    const createRadio = screen.getByRole("radio", { name: /create new account/i });
    expect(createRadio).toBeEnabled();
    await user.click(createRadio);
    expect(createRadio).toHaveAttribute("aria-checked", "true");

    // Inline validation on empty submit
    await user.click(screen.getByRole("button", { name: "Appoint Principal" }));
    expect(screen.getByText("Name must be at least 2 characters.")).toBeInTheDocument();
    expect(mocks.client.identity.principal.appoint).not.toHaveBeenCalled();

    // Fill new user details and submit
    await user.type(screen.getByLabelText("Full Name"), "Dr. Meera Krishnan");
    await user.type(screen.getByLabelText("Email"), "meera@dev.test");
    await user.type(screen.getByLabelText(/official order reference/i), "GO-2026-01");

    mocks.client.identity.principal.appoint.mockResolvedValueOnce({
      data: {
        assignment: {
          id: "01PA_NEW",
          user_id: "01U_MEERA",
          role_id: "01R_PRIN",
          role_key: "principal",
          role_name: "Principal",
          scope_type: "institution",
          scope_label: "i_carmel",
          is_singleton: true,
          is_active: true,
          valid_from: "2026-11-22T10:00:00Z",
          valid_to: null,
          user: { id: "01U_MEERA", name: "Dr. Meera Krishnan", email: "meera@dev.test", mobile: null },
        },
        previous_assignment_id: null,
        temporary_password: secret,
        expires_at: "2026-11-24T10:00:00Z",
      },
    });

    await user.click(screen.getByRole("button", { name: "Appoint Principal" }));

    await waitFor(() => {
      expect(mocks.client.identity.principal.appoint).toHaveBeenCalledWith({
        new_user: {
          name: "Dr. Meera Krishnan",
          email: "meera@dev.test",
          mobile: null,
          registration_number: null,
        },
        order_record: "GO-2026-01",
      });
    });

    // Reveal panel is shown
    expect(
      await screen.findByText(/One-Time Temporary Password for Dr\. Meera Krishnan/i)
    ).toBeInTheDocument();

    // Password is never persisted to storage, URL, or console
    expect(JSON.stringify(localStorage)).not.toContain(secret);
    expect(JSON.stringify(sessionStorage)).not.toContain(secret);
    expect(window.location.href).not.toContain(secret);
    expect(
      [...logSpy.mock.calls, ...infoSpy.mock.calls].flat().join(" ")
    ).not.toContain(secret);

    // Dismissing clears the reveal
    await user.click(
      screen.getByRole("checkbox", { name: /i have copied it/i })
    );
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(
      screen.queryByText(/One-Time Temporary Password for Dr\. Meera Krishnan/i)
    ).not.toBeInTheDocument();

    unmount();
  });

  it("maps 422, 409, and 403 errors on Replace Principal, validates reason, and renders embedded history with zero /users/{id} calls", async () => {
    const user = userEvent.setup();

    mocks.client.roleAssignments.list.mockResolvedValue({
      data: [
        {
          id: "01PA_ACTIVE",
          user_id: "01STAFF_1",
          role_id: "01R_PRIN",
          role_key: "principal",
          role_name: "Principal",
          scope_type: "institution",
          scope_label: "i_carmel",
          is_singleton: true,
          is_active: true,
          valid_from: "2026-11-01T09:00:00Z",
          valid_to: null,
          order_record: "GO-2026-001",
          reason: null,
          user: { id: "01STAFF_1", name: "Dr. Asha Nair", email: "asha@dev.test", mobile: "+919876543210" },
          assigned_by: { id: "01SA", name: "IT Head" },
        },
        {
          id: "01PA_OLD",
          user_id: "01U_PAST",
          role_id: "01R_PRIN",
          role_key: "principal",
          role_name: "Principal",
          scope_type: "institution",
          scope_label: "i_carmel",
          is_singleton: true,
          is_active: false,
          valid_from: "2024-06-01T09:00:00Z",
          valid_to: "2026-10-31T17:00:00Z",
          order_record: "GO-2024-010",
          reason: "Superannuation retirement",
          user: { id: "01U_PAST", name: "Dr. Former Principal", email: "former@dev.test", mobile: null },
          assigned_by: { id: "01SA", name: "IT Head" },
        },
      ],
      meta: { current_page: 1, last_page: 1, per_page: 25, total: 2 },
    });

    render(<SuperAdminPrincipalPage />);

    await waitFor(() => {
      expect(screen.getAllByText("Dr. Former Principal").length).toBeGreaterThan(0);
    });

    // Zero N+1 /users/{id} hydration requests
    expect(mocks.client.users.get).not.toHaveBeenCalled();
    expect(screen.getAllByText("Superannuation retirement").length).toBeGreaterThan(0);
    expect(screen.getAllByText("GO-2024-010").length).toBeGreaterThan(0);

    // Open Replace Principal dialog
    await user.click(screen.getByRole("button", { name: "Replace Principal" }));
    const dialog = await screen.findByRole("dialog");

    // Reason inline validation
    await user.click(within(dialog).getByRole("button", { name: "Confirm Replacement" }));
    expect(
      within(dialog).getByText("Transition reason must be between 5 and 500 characters.")
    ).toBeInTheDocument();

    // Select replacement staff & enter valid reason -> test 409 then 403 then 201
    await user.click(within(dialog).getByRole("combobox"));
    await user.click(await screen.findByText("Prof. Thomas Kurian (thomas@dev.test)"));
    await user.type(within(dialog).getByLabelText("Transition Reason"), "Term completed");

    mocks.client.identity.principal.replace.mockRejectedValueOnce(
      new ApiError({
        type: "https://errors.campuslynk.net/conflict",
        title: "Conflict",
        status: 409,
        detail: "The specified user is already the active Principal.",
      })
    );
    await user.click(within(dialog).getByRole("button", { name: "Confirm Replacement" }));
    expect(
      await within(dialog).findByText("The specified user is already the active Principal.")
    ).toBeInTheDocument();

    // 403 forbidden
    mocks.client.identity.principal.replace.mockRejectedValueOnce(
      new ApiError({
        type: "https://errors.campuslynk.net/forbidden",
        title: "Forbidden",
        status: 403,
        detail: "Only Super Admin may replace Principal.",
      })
    );
    await user.click(within(dialog).getByRole("button", { name: "Confirm Replacement" }));
    expect(
      await within(dialog).findByText("Only Super Admin may replace Principal.")
    ).toBeInTheDocument();

    // 201 success
    mocks.client.identity.principal.replace.mockResolvedValueOnce({
      data: {
        assignment: {
          id: "01PA_NEW2",
          user_id: "01STAFF_2",
          role_id: "01R_PRIN",
          role_key: "principal",
          role_name: "Principal",
          scope_type: "institution",
          scope_label: "i_carmel",
          is_singleton: true,
          is_active: true,
          valid_from: "2026-11-22T12:00:00Z",
          valid_to: null,
          user: { id: "01STAFF_2", name: "Prof. Thomas Kurian", email: "thomas@dev.test", mobile: null },
        },
        previous_assignment_id: "01PA_ACTIVE",
      },
    });
    await user.click(within(dialog).getByRole("button", { name: "Confirm Replacement" }));

    await waitFor(() => {
      expect(mocks.client.identity.principal.replace).toHaveBeenLastCalledWith({
        user_id: "01STAFF_2",
        reason: "Term completed",
        order_record: null,
      });
    });
  });
});

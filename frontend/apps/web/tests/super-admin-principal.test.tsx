import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiError } from "@academic-suite/api-client";
import { SuperAdminPrincipalPage } from "../src/components/super-admin/SuperAdminPrincipalPage";

const mocks = vi.hoisted(() => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  client: {
    roleAssignments: { list: vi.fn(), create: vi.fn(), delete: vi.fn() },
    users: { list: vi.fn(), get: vi.fn() },
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

describe("SuperAdminPrincipalPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("supports appointing an existing staff user, keeps Create New Account disabled, and handles inline + 409/422 errors", async () => {
    const user = userEvent.setup();

    mocks.client.roleAssignments.list.mockResolvedValue({
      data: [],
      meta: { current_page: 1, last_page: 1, per_page: 25, total: 0 },
    });
    mocks.client.users.list.mockResolvedValue({
      data: [
        {
          id: "01STAFF_1",
          type: "staff",
          name: "Dr. Asha Nair",
          email: "asha@dev.test",
          mobile: "+919876543210",
          registration_number: null,
          status: "active",
          must_change_password: false,
          last_login_at: null,
        },
      ],
      meta: { current_page: 1, last_page: 1, per_page: 25, total: 1 },
    });

    render(<SuperAdminPrincipalPage />);

    await waitFor(() => {
      expect(
        screen.getByRole("radiogroup", { name: "Appointment method" })
      ).toBeInTheDocument();
    });

    const existingRadio = screen.getByRole("radio", { name: /appoint existing staff user/i });
    expect(existingRadio).toHaveAttribute("aria-checked", "true");
    expect(existingRadio).toHaveAttribute("data-selected", "true");

    const createRadio = screen.getByRole("radio", { name: /create new account/i });
    expect(createRadio).toBeDisabled();
    expect(createRadio).toHaveTextContent(/awaiting backend support/i);

    // Inline validation when submitting with no staff selected
    await user.click(screen.getByRole("button", { name: "Appoint Principal" }));
    expect(
      screen.getByText("Select a staff member to appoint as Principal.")
    ).toBeInTheDocument();
    expect(mocks.client.roleAssignments.create).not.toHaveBeenCalled();

    // Select staff member via @academic-suite/ui Select
    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByText("Dr. Asha Nair (asha@dev.test)"));

    await user.type(screen.getByLabelText(/official order reference/i), "GO-2026-10");

    // First test 422 inline field error mapping
    mocks.client.roleAssignments.create.mockRejectedValueOnce(
      new ApiError({
        type: "about:blank",
        title: "Unprocessable Content",
        status: 422,
        detail: "Validation error",
        errors: { order_record: ["Order reference format is invalid."] },
      })
    );

    await user.click(screen.getByRole("button", { name: "Appoint Principal" }));
    expect(await screen.findByText("Order reference format is invalid.")).toBeInTheDocument();

    // Then test 201 success
    mocks.client.roleAssignments.create.mockResolvedValueOnce({
      data: {
        id: "01RA_NEW",
        user_id: "01STAFF_1",
        role_key: "principal",
        scope_type: "institution",
        scope_label: "i_carmel",
        is_singleton: true,
        is_active: true,
      },
    });
    mocks.client.roleAssignments.list.mockResolvedValueOnce({
      data: [
        {
          id: "01RA_NEW",
          user_id: "01STAFF_1",
          role_key: "principal",
          scope_type: "institution",
          scope_label: "i_carmel",
          is_singleton: true,
          is_active: true,
          valid_from: "2026-11-22T00:00:00Z",
          valid_to: null,
        },
      ],
      meta: { current_page: 1, last_page: 1, per_page: 25, total: 1 },
    });

    await user.click(screen.getByRole("button", { name: "Appoint Principal" }));

    await waitFor(() => {
      expect(mocks.client.roleAssignments.create).toHaveBeenLastCalledWith({
        user_id: "01STAFF_1",
        role_key: "principal",
        scope_type: "institution",
        scope_label: "i_carmel",
        order_record: "GO-2026-10",
      });
    });

    expect(mocks.toast.success).toHaveBeenCalled();
  });

  it("keeps Replace Principal disabled when active Principal exists and deduplicates GET /users/{id} for history", async () => {
    mocks.client.roleAssignments.list.mockResolvedValue({
      data: [
        {
          id: "01RA_CUR",
          user_id: "01PAST_USER",
          role_key: "principal",
          scope_type: "institution",
          scope_label: "i_carmel",
          is_singleton: true,
          is_active: true,
          valid_from: "2026-06-01T00:00:00Z",
          valid_to: null,
        },
        {
          id: "01RA_OLD_1",
          user_id: "01FORMER",
          role_key: "principal",
          scope_type: "institution",
          scope_label: "i_carmel",
          is_singleton: true,
          is_active: false,
          valid_from: "2024-06-01T00:00:00Z",
          valid_to: "2025-05-31T00:00:00Z",
        },
        {
          id: "01RA_OLD_2",
          user_id: "01FORMER",
          role_key: "principal",
          scope_type: "institution",
          scope_label: "i_carmel",
          is_singleton: true,
          is_active: false,
          valid_from: "2022-06-01T00:00:00Z",
          valid_to: "2024-05-31T00:00:00Z",
        },
      ],
      meta: { current_page: 1, last_page: 1, per_page: 25, total: 3 },
    });

    mocks.client.users.list.mockResolvedValue({
      data: [
        {
          id: "01PAST_USER",
          type: "staff",
          name: "Dr. Current Principal",
          email: "cur@dev.test",
          mobile: null,
          registration_number: null,
          status: "active",
          must_change_password: false,
          last_login_at: null,
        },
      ],
      meta: { current_page: 1, last_page: 1, per_page: 25, total: 1 },
    });

    mocks.client.users.get.mockResolvedValue({
      data: {
        id: "01FORMER",
        type: "staff",
        name: "Dr. Former Principal",
        email: "former@dev.test",
        mobile: null,
        registration_number: null,
        status: "active",
        must_change_password: false,
        last_login_at: null,
      },
    });

    render(<SuperAdminPrincipalPage />);

    await waitFor(() => {
      expect(screen.getAllByText("Dr. Current Principal").length).toBeGreaterThan(0);
    });

    expect(screen.getAllByText("Dr. Former Principal").length).toBeGreaterThan(0);
    // Deduplicated: 01FORMER appears in 2 history rows but GET /users/01FORMER is called only once
    expect(mocks.client.users.get).toHaveBeenCalledTimes(1);
    expect(mocks.client.users.get).toHaveBeenCalledWith("01FORMER");

    const replaceBtn = screen.getByRole("button", { name: "Replace Principal" });
    expect(replaceBtn).toBeDisabled();
    expect(screen.getByText(/awaiting backend support: atomic principal replacement/i)).toBeInTheDocument();
    expect(mocks.client.roleAssignments.delete).not.toHaveBeenCalled();
  });
});


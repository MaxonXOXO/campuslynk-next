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
      update: vi.fn(),
      suspend: vi.fn(),
      reactivate: vi.fn(),
      unlock: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth/session-provider", () => ({
  useApiClient: () => mocks.client,
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));

const SAMPLE_USERS = [
  {
    id: "01U_ACTIVE",
    type: "staff",
    name: "Ananya Menon",
    email: "ananya@dev.test",
    mobile: "+919876543210",
    registration_number: null,
    status: "active",
    must_change_password: true,
    last_login_at: "2026-11-20T09:00:00Z",
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
    last_login_at: null,
  },
];

describe("SuperAdminUsersPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.client.users.list.mockResolvedValue({
      data: SAMPLE_USERS,
      meta: { current_page: 1, last_page: 2, per_page: 25, total: 30 },
    });
    mocks.client.users.update.mockResolvedValue({ data: SAMPLE_USERS[0] });
    mocks.client.users.suspend.mockResolvedValue({ data: { ...SAMPLE_USERS[0], status: "suspended" } });
    mocks.client.users.reactivate.mockResolvedValue({ data: { ...SAMPLE_USERS[1], status: "active" } });
    mocks.client.users.unlock.mockResolvedValue({ data: { message: "Unlocked" } });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders user directory without a Roles column, keeps Create User disabled, and supports filtering & pagination", async () => {
    const user = userEvent.setup();
    render(<SuperAdminUsersPage />);

    await waitFor(() => {
      expect(screen.getAllByText("Ananya Menon").length).toBeGreaterThan(0);
    });

    const createBtn = screen.getByRole("button", { name: /create user/i });
    expect(createBtn).toBeDisabled();
    expect(screen.getByText(/awaiting backend support/i)).toBeInTheDocument();

    const table = screen.getByRole("table");
    const headers = within(table).getAllByRole("columnheader").map((th) => th.textContent);
    expect(headers).toEqual(["Name", "Type", "Contact", "Status", "Last Login", "Actions"]);
    expect(headers).not.toContain("Roles");

    // Search query
    await user.type(screen.getByLabelText("Search users"), "Ananya");
    await user.click(screen.getByRole("button", { name: /search/i }));
    await waitFor(() => {
      expect(mocks.client.users.list).toHaveBeenCalledWith({ page: 1, search: "Ananya" });
    });

    // Type filter using shared Select
    await user.click(screen.getByRole("combobox", { name: /filter by user type/i }));
    await user.click(await screen.findByRole("option", { name: "Staff" }));
    await waitFor(() => {
      expect(mocks.client.users.list).toHaveBeenCalledWith({
        page: 1,
        search: "Ananya",
        type: "staff",
      });
    });

    // Pagination page 2
    await user.click(screen.getByRole("button", { name: "2" }));
    await waitFor(() => {
      expect(mocks.client.users.list).toHaveBeenCalledWith({
        page: 2,
        search: "Ananya",
        type: "staff",
      });
    });
  });

  it("edits a user with inline field validation and executes suspend, reactivate, and unlock actions", async () => {
    const user = userEvent.setup();
    render(<SuperAdminUsersPage />);

    await waitFor(() => {
      expect(screen.getAllByText("Ananya Menon").length).toBeGreaterThan(0);
    });

    // 1. Edit Ananya Menon
    await user.click(screen.getAllByRole("button", { name: "Actions for Ananya Menon" })[0]!);
    await user.click(await screen.findByRole("menuitem", { name: /edit details/i }));

    const dialog = await screen.findByRole("dialog");
    const nameInput = within(dialog).getByLabelText("Full Name");
    await user.clear(nameInput);
    await user.type(nameInput, "A");
    await user.click(within(dialog).getByRole("button", { name: "Save Changes" }));

    expect(
      within(dialog).getByText("Name must be at least 2 characters.")
    ).toBeInTheDocument();
    expect(mocks.client.users.update).not.toHaveBeenCalled();

    // Test server 422 field error mapping
    await user.clear(nameInput);
    await user.type(nameInput, "Ananya K");
    mocks.client.users.update.mockRejectedValueOnce(
      new ApiError({
        type: "about:blank",
        title: "Validation",
        status: 422,
        detail: "Invalid email",
        errors: { email: ["Email is already taken."] },
      })
    );
    await user.click(within(dialog).getByRole("button", { name: "Save Changes" }));
    expect(await within(dialog).findByText("Email is already taken.")).toBeInTheDocument();

    // Successful update
    await user.click(within(dialog).getByRole("button", { name: "Save Changes" }));
    await waitFor(() => {
      expect(mocks.client.users.update).toHaveBeenLastCalledWith("01U_ACTIVE", {
        name: "Ananya K",
        email: "ananya@dev.test",
        mobile: "+919876543210",
        registration_number: null,
      });
    });

    // 2. Suspend Ananya Menon
    await user.click(screen.getAllByRole("button", { name: "Actions for Ananya Menon" })[0]!);
    await user.click(await screen.findByRole("menuitem", { name: /suspend account/i }));
    const suspendDialog = await screen.findByRole("dialog");
    await user.type(within(suspendDialog).getByLabelText(/reason/i), "On sabbatical");
    await user.click(within(suspendDialog).getByRole("button", { name: "Suspend Account" }));
    await waitFor(() => {
      expect(mocks.client.users.suspend).toHaveBeenCalledWith("01U_ACTIVE", "On sabbatical");
    });

    // 3. Reactivate Basil Varghese
    await user.click(screen.getAllByRole("button", { name: "Actions for Basil Varghese" })[0]!);
    await user.click(await screen.findByRole("menuitem", { name: /reactivate account/i }));
    const reactivateDialog = await screen.findByRole("alertdialog");
    await user.click(within(reactivateDialog).getByRole("button", { name: "Reactivate" }));
    await waitFor(() => {
      expect(mocks.client.users.reactivate).toHaveBeenCalledWith("01U_SUSPENDED");
    });

    // 4. Unlock Ananya Menon
    await user.click(screen.getAllByRole("button", { name: "Actions for Ananya Menon" })[0]!);
    await user.click(await screen.findByRole("menuitem", { name: /unlock account/i }));
    const unlockDialog = await screen.findByRole("alertdialog");
    await user.click(within(unlockDialog).getByRole("button", { name: "Unlock Account" }));
    await waitFor(() => {
      expect(mocks.client.users.unlock).toHaveBeenCalledWith("01U_ACTIVE");
    });
  });
});


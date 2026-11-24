import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { renderWithQueryClient } from "./helpers/query-wrapper";
import userEvent from "@testing-library/user-event";
import { ApiError } from "@academic-suite/api-client";
import { PrincipalDepartmentsPage } from "../src/components/principal/PrincipalDepartmentsPage";

const mocks = vi.hoisted(() => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  client: {
    organisation: {
      streams: { list: vi.fn() },
      departments: { list: vi.fn() },
      batches: { list: vi.fn() },
    },
    identity: {
      roleAssignments: { list: vi.fn(), create: vi.fn(), delete: vi.fn() },
      users: { list: vi.fn() },
    },
  },
  user: {
    id: "01PRIN",
    name: "Dr. Principal",
    assignments: [
      { role_key: "principal", scope_type: "institution", scope_label: "i_carmel" },
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

const STREAMS = [
  { id: "s1", code: "AIDED", name: "Aided Stream", scope_label: "s_aided", departments_count: 2 },
];

const DEPARTMENTS = [
  {
    id: "d1",
    code: "CE",
    name: "Civil Engineering",
    stream_id: "s1",
    stream: "AIDED",
    kind: "academic",
    scope_label: "d_ce",
    is_active: true,
  },
  {
    id: "d2",
    code: "ME",
    name: "Mechanical Engineering",
    stream_id: "s1",
    stream: "AIDED",
    kind: "academic",
    scope_label: "d_me",
    is_active: true,
  },
];

const BATCHES = [
  { id: "b1", home_department_id: "d1" },
  { id: "b2", home_department_id: "d1" },
  { id: "b3", home_department_id: "d2" },
];

const STAFF = [
  { id: "u1", name: "Dr. Asha Nair", email: "asha@dev.test", type: "staff", status: "active" },
  { id: "u2", name: "Prof. Thomas", email: "thomas@dev.test", type: "staff", status: "active" },
];

const ASSIGNMENTS = [
  {
    id: "ra1",
    user_id: "u1",
    role_id: "r_hod",
    role_key: "hod",
    role_name: "Head of Department",
    scope_type: "department",
    scope_label: "d_ce",
    is_singleton: true,
    is_active: true,
    user: { id: "u1", name: "Dr. Asha Nair", email: "asha@dev.test" },
  },
];

describe("PrincipalDepartmentsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.client.organisation.streams.list.mockResolvedValue({ data: STREAMS });
    mocks.client.organisation.departments.list.mockResolvedValue({ data: DEPARTMENTS });
    mocks.client.organisation.batches.list.mockResolvedValue({ data: BATCHES });
    mocks.client.identity.roleAssignments.list.mockResolvedValue({ data: ASSIGNMENTS });
    mocks.client.identity.users.list.mockResolvedValue({ data: STAFF });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders view-only departments grouped by stream with batch counts and no CRUD controls", async () => {
    renderWithQueryClient(<PrincipalDepartmentsPage />);

    await waitFor(() => {
      expect(screen.getByText("Civil Engineering")).toBeInTheDocument();
    });

    expect(screen.getByText("Aided Stream")).toBeInTheDocument();
    expect(screen.getByText("Mechanical Engineering")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();

    expect(
      screen.queryByRole("button", { name: /create department|add department|edit|delete/i })
    ).not.toBeInTheDocument();
  });

  it("shows active HOD name when assigned and Vacant warning badge when unassigned", async () => {
    renderWithQueryClient(<PrincipalDepartmentsPage />);

    await waitFor(() => {
      expect(screen.getByText("Dr. Asha Nair")).toBeInTheDocument();
    });

    const vacantBadge = screen.getByText("Vacant");
    expect(vacantBadge).toBeInTheDocument();
    expect(vacantBadge).toHaveAttribute("data-status", "warning");
  });

  it("appoints a leadership role via roleAssignments.create", async () => {
    const user = userEvent.setup();
    mocks.client.identity.roleAssignments.create.mockResolvedValueOnce({
      data: { id: "ra_new" },
    });

    renderWithQueryClient(<PrincipalDepartmentsPage />);

    await waitFor(() => {
      expect(screen.getByText("Mechanical Engineering")).toBeInTheDocument();
    });

    const buttons = screen.getAllByRole("button", { name: /manage leadership/i });
    await user.click(buttons[1]!);

    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText(/official order reference/i), "GO-2026-12");
    await user.click(within(dialog).getByRole("button", { name: "Appoint" }));

    await waitFor(() => {
      expect(mocks.client.identity.roleAssignments.create).toHaveBeenCalledWith({
        user_id: "u1",
        role_key: "hod",
        scope_type: "department",
        scope_label: "d_me",
        order_record: "GO-2026-12",
      });
    });
  });

  it("maps 422, 409, and 403 errors when appointing a leadership role", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<PrincipalDepartmentsPage />);

    await waitFor(() => {
      expect(screen.getByText("Civil Engineering")).toBeInTheDocument();
    });

    const buttons = screen.getAllByRole("button", { name: /manage leadership/i });
    await user.click(buttons[0]!);
    const dialog = await screen.findByRole("dialog");

    // 422
    mocks.client.identity.roleAssignments.create.mockRejectedValueOnce(
      new ApiError({
        type: "about:blank",
        title: "Validation Failed",
        status: 422,
        detail: "The selected user is not eligible.",
      })
    );
    await user.click(within(dialog).getByRole("button", { name: "Appoint" }));
    expect(
      await within(dialog).findByText("The selected user is not eligible.")
    ).toBeInTheDocument();

    // 409
    mocks.client.identity.roleAssignments.create.mockRejectedValueOnce(
      new ApiError({
        type: "about:blank",
        title: "Conflict",
        status: 409,
        detail: "HOD role is already occupied for this department.",
      })
    );
    await user.click(within(dialog).getByRole("button", { name: "Appoint" }));
    expect(
      await within(dialog).findByText("HOD role is already occupied for this department.")
    ).toBeInTheDocument();

    // 403
    mocks.client.identity.roleAssignments.create.mockRejectedValueOnce(
      new ApiError({
        type: "about:blank",
        title: "Forbidden",
        status: 403,
        detail: "You cannot appoint this role.",
      })
    );
    await user.click(within(dialog).getByRole("button", { name: "Appoint" }));
    expect(
      await within(dialog).findByText("You cannot appoint this role.")
    ).toBeInTheDocument();
  });

  it("validates reason and ends an active leadership assignment via roleAssignments.delete", async () => {
    const user = userEvent.setup();
    mocks.client.identity.roleAssignments.delete.mockResolvedValueOnce({
      data: { message: "Revoked" },
    });

    renderWithQueryClient(<PrincipalDepartmentsPage />);

    await waitFor(() => {
      expect(screen.getByText("Civil Engineering")).toBeInTheDocument();
    });

    const buttons = screen.getAllByRole("button", { name: /manage leadership/i });
    await user.click(buttons[0]!);
    const dialog = await screen.findByRole("dialog");

    await user.click(within(dialog).getByRole("button", { name: "End assignment" }));
    await user.click(within(dialog).getByRole("button", { name: "Confirm End Assignment" }));

    expect(
      within(dialog).getByText(/provide a reason/i)
    ).toBeInTheDocument();
    expect(mocks.client.identity.roleAssignments.delete).not.toHaveBeenCalled();

    await user.type(within(dialog).getByLabelText("Reason"), "Tenure completed");
    await user.click(within(dialog).getByRole("button", { name: "Confirm End Assignment" }));

    await waitFor(() => {
      expect(mocks.client.identity.roleAssignments.delete).toHaveBeenCalledWith(
        "ra1",
        "Tenure completed"
      );
    });
  });
});


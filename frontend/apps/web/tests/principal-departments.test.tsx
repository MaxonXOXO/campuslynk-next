import React from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { renderWithQueryClient } from "./helpers/query-wrapper";
import userEvent from "@testing-library/user-event";
import { ApiError } from "@academic-suite/api-client";

beforeAll(() => {
  if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
});

import { PrincipalDepartmentsPage } from "../src/components/principal/PrincipalDepartmentsPage";
import { DepartmentHierarchyPage } from "../src/components/principal/DepartmentHierarchyPage";

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

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
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
  { id: "b1", name: "2024-2027 Batch", scope_label: "b_ce_2024", home_department_id: "d1" },
  { id: "b2", name: "2025-2028 Batch", scope_label: "b_ce_2025", home_department_id: "d1" },
  { id: "b3", name: "2025-2028 Batch", scope_label: "b_me_2025", home_department_id: "d2" },
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
  {
    id: "ra2",
    user_id: "u2",
    role_id: "r_lec",
    role_key: "lecturer",
    role_name: "Lecturer",
    scope_type: "department",
    scope_label: "d_ce",
    is_singleton: false,
    is_active: true,
    user: { id: "u2", name: "Prof. Thomas", email: "thomas@dev.test" },
  },
];

describe("PrincipalDepartmentsPage & DepartmentHierarchyPage", () => {
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

  it("renders view-only departments grouped by stream with Manage leadership links", async () => {
    renderWithQueryClient(<PrincipalDepartmentsPage />);

    await waitFor(() => {
      expect(screen.getByText("Civil Engineering")).toBeInTheDocument();
    });

    expect(screen.getByText("Aided Stream")).toBeInTheDocument();
    expect(screen.getByText("Mechanical Engineering")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();

    const links = screen.getAllByRole("link", { name: /manage leadership/i });
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "/w/principal/departments/d1",
      "/w/principal/departments/d2",
    ]);

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

  it("renders tiered department hierarchy and appoints a role with searchable staff picker", async () => {
    const user = userEvent.setup();
    mocks.client.identity.roleAssignments.create.mockResolvedValueOnce({
      data: { id: "ra_new" },
    });

    renderWithQueryClient(<DepartmentHierarchyPage departmentId="d2" />);

    await waitFor(() => {
      expect(screen.getByText("Mechanical Engineering (ME)")).toBeInTheDocument();
    });

    expect(screen.getByText(/Tier 1 · Department & Stream Leadership/i)).toBeInTheDocument();
    expect(screen.getByText(/Tier 2 · Batch Tutors & Mentors/i)).toBeInTheDocument();
    expect(screen.getByText(/Tier 3 · Teaching & Lab Staff/i)).toBeInTheDocument();

    // Open searchable staff picker and choose Prof. Thomas
    await user.click(screen.getByRole("combobox", { name: /select staff member/i }));
    const searchInput = await screen.findByPlaceholderText(/search by name or email/i);
    await user.type(searchInput, "Thomas");
    await user.click(await screen.findByText("Prof. Thomas"));

    await user.type(screen.getByLabelText(/official order reference/i), "GO-2026-12");
    await user.click(screen.getByRole("button", { name: "Appoint" }));

    await waitFor(() => {
      expect(mocks.client.identity.roleAssignments.create).toHaveBeenCalledWith({
        user_id: "u2",
        role_key: "hod",
        scope_type: "department",
        scope_label: "d_me",
        order_record: "GO-2026-12",
      });
    });
  });

  it("maps 422, 409, and 403 errors when appointing in DepartmentHierarchyPage", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<DepartmentHierarchyPage departmentId="d1" />);

    await waitFor(() => {
      expect(screen.getByText("Civil Engineering (CE)")).toBeInTheDocument();
    });

    // 422
    mocks.client.identity.roleAssignments.create.mockRejectedValueOnce(
      new ApiError({
        type: "about:blank",
        title: "Validation Failed",
        status: 422,
        detail: "The selected user is not eligible.",
      })
    );
    await user.click(screen.getByRole("button", { name: "Appoint" }));
    expect(
      await screen.findByText("The selected user is not eligible.")
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
    await user.click(screen.getByRole("button", { name: "Appoint" }));
    expect(
      await screen.findByText("HOD role is already occupied for this department.")
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
    await user.click(screen.getByRole("button", { name: "Appoint" }));
    expect(
      await screen.findByText("You cannot appoint this role.")
    ).toBeInTheDocument();
  });

  it("validates reason and ends an active leadership assignment via roleAssignments.delete", async () => {
    const user = userEvent.setup();
    mocks.client.identity.roleAssignments.delete.mockResolvedValueOnce({
      data: { message: "Revoked" },
    });

    renderWithQueryClient(<DepartmentHierarchyPage departmentId="d1" />);

    await waitFor(() => {
      expect(screen.getByText("Civil Engineering (CE)")).toBeInTheDocument();
    });

    const endButtons = screen.getAllByRole("button", { name: "End assignment" });
    await user.click(endButtons[0]!);
    const dialog = await screen.findByRole("dialog");

    await user.click(within(dialog).getByRole("button", { name: "Confirm End Assignment" }));
    expect(within(dialog).getByText(/provide a reason/i)).toBeInTheDocument();
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

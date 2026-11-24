import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PrincipalOverview } from "../src/components/principal/PrincipalOverview";
import { renderWithQueryClient } from "./helpers/query-wrapper";

const mocks = vi.hoisted(() => ({
  client: {
    identity: {
      users: { list: vi.fn() },
      roleAssignments: { list: vi.fn() },
    },
    organisation: {
      departments: { list: vi.fn() },
      batches: { list: vi.fn() },
    },
  },
}));

vi.mock("@/lib/auth/session-provider", () => ({
  useApiClient: () => mocks.client,
  useSession: () => ({
    state: { status: "authenticated", user: { id: "01PR", assignments: [] } },
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

vi.mock("next/dynamic", () => ({
  default: () => {
    return function MockChart({ data }: { data: Array<{ type: string; count: number }> }) {
      return (
        <div data-testid="mock-users-chart">
          {data.map((d) => `${d.type}:${d.count}`).join(",")}
        </div>
      );
    };
  },
}));

function mockOverviewSuccess({
  staff = 14,
  student = 320,
  parent = 290,
  pending = 4,
  departments = [
    { id: "d1", scope_label: "d_ce" },
    { id: "d2", scope_label: "d_me" },
  ],
  hodAssignments = [{ id: "a1", role_key: "hod", scope_label: "d_ce", is_active: true }],
  batchesTotal = 12,
}: {
  staff?: number;
  student?: number;
  parent?: number;
  pending?: number;
  departments?: Array<{ id: string; scope_label: string }>;
  hodAssignments?: Array<{ id: string; role_key: string; scope_label: string; is_active: boolean }>;
  batchesTotal?: number;
} = {}) {
  mocks.client.identity.users.list.mockImplementation(
    async (query?: Record<string, unknown>) => {
      if (query?.type === "staff") return { data: [], meta: { total: staff } };
      if (query?.type === "student") return { data: [], meta: { total: student } };
      if (query?.type === "parent") return { data: [], meta: { total: parent } };
      if (query?.status === "pending") return { data: [], meta: { total: pending } };
      return { data: [], meta: { total: 0 } };
    }
  );
  mocks.client.organisation.departments.list.mockResolvedValue({
    data: departments,
    meta: { total: departments.length },
  });
  mocks.client.identity.roleAssignments.list.mockResolvedValue({
    data: hodAssignments,
    meta: { total: hodAssignments.length },
  });
  mocks.client.organisation.batches.list.mockResolvedValue({
    data: [],
    meta: { total: batchesTotal },
  });
}

describe("PrincipalOverview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders loading skeletons while fetching overview metrics", () => {
    mocks.client.identity.users.list.mockReturnValue(new Promise(() => undefined));
    mocks.client.organisation.departments.list.mockReturnValue(new Promise(() => undefined));
    mocks.client.identity.roleAssignments.list.mockReturnValue(new Promise(() => undefined));
    mocks.client.organisation.batches.list.mockReturnValue(new Promise(() => undefined));

    const { container } = renderWithQueryClient(<PrincipalOverview />);
    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
  });

  it("renders real KPI cards from list endpoints and includes zero setup-wizard links", async () => {
    mockOverviewSuccess();
    renderWithQueryClient(<PrincipalOverview />);

    await waitFor(() => {
      expect(screen.getByText("14")).toBeInTheDocument();
    });

    expect(screen.getByText("320")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("1/2")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();

    const links = screen.getAllByRole("link");
    for (const link of links) {
      expect(link.getAttribute("href")).not.toMatch(/^\/setup/);
    }
  });

  it("renders a retryable error alert when loading fails and recovers on Retry", async () => {
    const user = userEvent.setup();
    mocks.client.identity.users.list.mockRejectedValueOnce(
      new Error("Service unavailable")
    );
    mocks.client.organisation.departments.list.mockResolvedValue({ data: [] });
    mocks.client.identity.roleAssignments.list.mockResolvedValue({ data: [] });
    mocks.client.organisation.batches.list.mockResolvedValue({ data: [], meta: { total: 0 } });

    renderWithQueryClient(<PrincipalOverview />);

    expect(await screen.findByText("Unable to load overview")).toBeInTheDocument();
    expect(screen.getByText("Service unavailable")).toBeInTheDocument();

    mockOverviewSuccess({ staff: 8, student: 100, parent: 90, pending: 0, batchesTotal: 3 });
    await user.click(screen.getByRole("button", { name: /retry/i }));

    await waitFor(() => {
      expect(screen.getByText("8")).toBeInTheDocument();
    });
    expect(screen.getByText("100")).toBeInTheDocument();
  });

  it("renders empty state when there are zero users and zero departments", async () => {
    mockOverviewSuccess({
      staff: 0,
      student: 0,
      parent: 0,
      pending: 0,
      departments: [],
      hodAssignments: [],
      batchesTotal: 0,
    });

    renderWithQueryClient(<PrincipalOverview />);

    expect(
      await screen.findByText(/no user accounts found yet/i)
    ).toBeInTheDocument();
    expect(screen.getByText("No departments configured")).toBeInTheDocument();
  });

  it("provides an accessible data table alternative for the chart", async () => {
    const user = userEvent.setup();
    mockOverviewSuccess({ staff: 15, student: 200, parent: 180 });

    renderWithQueryClient(<PrincipalOverview />);

    expect(await screen.findByTestId("mock-users-chart")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /show data table/i }));

    const table = await screen.findByRole("table", {
      name: /user accounts by type data table/i,
    });
    expect(within(table).getByText("Staff")).toBeInTheDocument();
    expect(within(table).getByText("15")).toBeInTheDocument();
    expect(within(table).getByText("Students")).toBeInTheDocument();
    expect(within(table).getByText("200")).toBeInTheDocument();
    expect(within(table).getByText("Parents")).toBeInTheDocument();
    expect(within(table).getByText("180")).toBeInTheDocument();
  });
});


import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SuperAdminOverview } from "../src/components/super-admin/SuperAdminOverview";
import { renderWithQueryClient } from "./helpers/query-wrapper";

const mocks = vi.hoisted(() => ({
  client: {
    setup: { status: vi.fn() },
    roleAssignments: { list: vi.fn() },
    users: { list: vi.fn(), get: vi.fn() },
  },
}));

vi.mock("@/lib/auth/session-provider", () => ({
  useApiClient: () => mocks.client,
  useSession: () => ({
    state: { status: "authenticated", user: { id: "01SA", assignments: [] } },
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

describe("SuperAdminOverview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders setup status, hydrated active Principal, total users, and zero academic links", async () => {
    mocks.client.setup.status.mockResolvedValue({
      data: { completed_at: "2026-11-10T10:00:00Z", is_completed: true },
    });
    mocks.client.roleAssignments.list.mockResolvedValue({
      data: [
        {
          id: "01RA_PRINCIPAL",
          user_id: "01USER_PRINCIPAL",
          role_id: "01R_PRIN",
          role_key: "principal",
          scope_type: "institution",
          scope_label: "i_dev",
          is_singleton: true,
          is_active: true,
          valid_from: "2026-11-11T09:00:00Z",
          valid_to: null,
          user: {
            id: "01USER_PRINCIPAL",
            name: "Dr. Meera Menon",
            email: "principal@dev.test",
            mobile: "+919876543210",
          },
        },
      ],
      meta: { current_page: 1, last_page: 1, per_page: 25, total: 1 },
    });
    mocks.client.users.list.mockResolvedValue({
      data: [],
      meta: { current_page: 1, last_page: 2, per_page: 25, total: 32 },
    });

    renderWithQueryClient(<SuperAdminOverview />);

    await waitFor(() => {
      expect(screen.getByText("Dr. Meera Menon")).toBeInTheDocument();
    });

    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.getByText("32 total")).toBeInTheDocument();
    expect(mocks.client.users.get).not.toHaveBeenCalled();

    const links = screen.getAllByRole("link");
    expect(links.map((el) => el.getAttribute("href"))).toEqual([
      "/setup",
      "/w/super-admin/principal",
      "/w/super-admin/users",
    ]);
  });

  it("renders vacant Principal prompt and retry state on error", async () => {
    const user = userEvent.setup();
    mocks.client.setup.status.mockRejectedValueOnce(new Error("Network error"));
    mocks.client.roleAssignments.list.mockResolvedValueOnce({ data: [], meta: { total: 0 } });
    mocks.client.users.list.mockResolvedValueOnce({ data: [], meta: { total: 0 } });

    renderWithQueryClient(<SuperAdminOverview />);

    await waitFor(() => {
      expect(screen.getByText("Unable to load overview")).toBeInTheDocument();
    });

    mocks.client.setup.status.mockResolvedValueOnce({
      data: { completed_at: null, is_completed: false },
    });
    mocks.client.roleAssignments.list.mockResolvedValueOnce({ data: [], meta: { total: 0 } });
    mocks.client.users.list.mockResolvedValueOnce({ data: [], meta: { total: 4 } });

    await user.click(screen.getByRole("button", { name: /retry/i }));

    await waitFor(() => {
      expect(screen.getByText("Vacant")).toBeInTheDocument();
    });
    expect(screen.getByText("In Progress")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /appoint principal/i })).toHaveAttribute(
      "href",
      "/w/super-admin/principal"
    );
  });
});


import * as React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithQueryClient } from "./helpers/query-wrapper";
import { ControlPanelPage } from "../src/components/super-admin/ControlPanelPage";
import { WORKSPACE_NAV } from "../src/lib/workspaces/navigation";

const mocks = vi.hoisted(() => ({
  replaceMock: vi.fn(),
  statusMock: vi.fn(),
  user: {
    id: "01SA",
    name: "IT Head",
    email: "it@college.edu",
    tenant_slug: "college",
    roles: ["super_admin"],
    capabilities: [],
  },
}));

let currentCategoryParam: string | null = null;

vi.mock("next/navigation", () => ({
  usePathname: () => "/w/super-admin/settings",
  useRouter: () => ({
    replace: mocks.replaceMock,
    push: vi.fn(),
  }),
  useSearchParams: () =>
    new URLSearchParams(currentCategoryParam ? `category=${currentCategoryParam}` : ""),
}));

vi.mock("@/lib/auth/session-provider", () => ({
  useSession: () => ({
    state: {
      status: "authenticated",
      user: mocks.user,
      tenant: "college",
    },
  }),
  useApiClient: () => ({
    organisation: {
      setup: {
        status: mocks.statusMock,
      },
    },
  }),
}));

describe("ControlPanelPage shell (Slice 2)", () => {
  beforeEach(() => {
    mocks.replaceMock.mockReset();
    currentCategoryParam = null;
    mocks.statusMock.mockResolvedValue({
      data: {
        is_completed: false,
        completed_at: null,
        is_locked: false,
        unlocked_sections: [],
        completed_steps: ["institution_profile"],
        current_step: "calendar_basics",
        steps: {
          institution_profile: {},
          calendar_basics: {},
          organisation_basics: {},
          signup_policy: {},
        },
      },
    });
  });

  it("replaces Institution Setup with Control Panel in super-admin sidebar nav", () => {
    const items = WORKSPACE_NAV["super-admin"];
    expect(items.some((i) => i.label === "Control Panel" && i.href === "/w/super-admin/settings")).toBe(true);
    expect(items.some((i) => i.label === "Institution Setup")).toBe(false);
  });

  it("shows Continue setup banner when setup is incomplete and renders Roadmap card", async () => {
    renderWithQueryClient(<ControlPanelPage />);

    expect(
      await screen.findByText("Initial institution setup is in progress")
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Continue setup/i })).toHaveAttribute(
      "href",
      "/setup"
    );
    expect(screen.getByText("Roadmap")).toBeInTheDocument();
  });

  it("falls back to Home when category query param is unknown", async () => {
    currentCategoryParam = "non_existent_category";
    renderWithQueryClient(<ControlPanelPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Home" })).toHaveAttribute(
        "aria-current",
        "page"
      );
    });
    expect(screen.getByText("Roadmap")).toBeInTheDocument();
  });

  it("filters categories with Find a setting search and navigates on click", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<ControlPanelPage />);

    const search = screen.getByLabelText("Find a setting");
    await user.type(search, "Audit");

    expect(
      screen.getByRole("button", { name: "Audit & Security" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "API Access" })
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Audit & Security" }));
    expect(mocks.replaceMock).toHaveBeenCalledWith(
      "/w/super-admin/settings?category=audit",
      { scroll: false }
    );
  });
});

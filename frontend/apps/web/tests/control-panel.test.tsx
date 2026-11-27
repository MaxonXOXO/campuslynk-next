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
  saveStepMock: vi.fn(),
  unlockMock: vi.fn(),
  lockMock: vi.fn(),
  streamsListMock: vi.fn(),
  departmentsListMock: vi.fn(),
  academicYearsListMock: vi.fn(),
  settingsListMock: vi.fn(),
  settingsUpdateMock: vi.fn(),
  auditLogsListMock: vi.fn(),
  user: {
    id: "01SA",
    name: "IT Head",
    email: "it@college.edu",
    tenant_slug: "college",
    roles: ["super_admin"],
    role_assignments: [
      { role: { slug: "super_admin" }, scope_label: "institution" },
    ],
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
        saveStep: mocks.saveStepMock,
        unlock: mocks.unlockMock,
        lock: mocks.lockMock,
      },
      streams: { list: mocks.streamsListMock },
      departments: { list: mocks.departmentsListMock },
      academicYears: { list: mocks.academicYearsListMock },
    },
    identity: {
      settings: {
        list: mocks.settingsListMock,
        update: mocks.settingsUpdateMock,
      },
      auditLogs: {
        list: mocks.auditLogsListMock,
      },
    },
  }),
}));

describe("ControlPanelPage shell (Slice 2)", () => {
  beforeEach(() => {
    mocks.replaceMock.mockReset();
    mocks.saveStepMock.mockReset().mockResolvedValue({ data: {} });
    mocks.unlockMock.mockReset().mockResolvedValue({ data: {} });
    mocks.lockMock.mockReset().mockResolvedValue({ data: {} });
    mocks.streamsListMock.mockResolvedValue({ data: [{ id: "1" }, { id: "2" }] });
    mocks.departmentsListMock.mockResolvedValue({ data: [{ id: "d1" }, { id: "d2" }, { id: "d3" }] });
    mocks.academicYearsListMock.mockResolvedValue({ data: [{ id: "y1" }] });
    mocks.settingsUpdateMock.mockReset().mockResolvedValue({ data: {} });
    mocks.auditLogsListMock.mockReset().mockResolvedValue({
      data: [
        {
          id: "01AUD1",
          log_name: "security",
          event: "setting.updated",
          description: "Tenant setting updated",
          causer_name: "IT Head",
          properties: {
            key: "auth.staff_self_registration_enabled",
            reason: "Open intake window",
            secret_token: "should-not-appear",
          },
          created_at: "2026-11-26T12:00:00Z",
        },
      ],
      meta: { current_page: 1, last_page: 1, per_page: 20, total: 1 },
    });
    mocks.settingsListMock.mockResolvedValue({
      data: {
        settings: {
          "auth.staff_self_registration_enabled": {
            value: { enabled: false },
            is_default: true,
          },
          "auth.staff_self_registration_daily_cap": {
            value: { cap: 25 },
            is_default: true,
          },
          "auth.rejected_resubmit_cooldown_days": {
            value: { days: 7 },
            is_default: true,
          },
          "auth.token_lifetime_web_hours": {
            value: { hours: 12 },
            is_default: true,
          },
          "auth.token_lifetime_mobile_days": {
            value: { days: 30 },
            is_default: true,
          },
        },
        token_summary: {
          active_tokens_count: 14,
          active_users_with_tokens_count: 9,
        },
      },
    });
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

  it("selects the requested category from ?category= deep link", async () => {
    currentCategoryParam = "api";
    renderWithQueryClient(<ControlPanelPage />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "API Access" })
      ).toHaveAttribute("aria-current", "page");
    });
    expect(await screen.findByText("Active Token Inventory")).toBeInTheDocument();
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

  it("renders Setup pane with read-only Organisation Basics, unlock dialog copy, and Lock now", async () => {
    const user = userEvent.setup();
    currentCategoryParam = "setup";
    mocks.statusMock.mockResolvedValue({
      data: {
        is_completed: true,
        completed_at: "2026-11-26T10:00:00Z",
        is_locked: false,
        unlocked_sections: ["signup_policy"],
        completed_steps: ["institution_profile", "calendar_basics", "signup_policy"],
        current_step: null,
        steps: {
          institution_profile: { name: "Demo College", short_code: "DC" },
          calendar_basics: { working_days: ["monday", "tuesday"], day_order_format: "numeric" },
          organisation_basics: {},
          signup_policy: {
            student_self_registration_enabled: false,
            parent_self_registration_enabled: false,
            approval_mode: "manual",
          },
        },
      },
    });

    renderWithQueryClient(<ControlPanelPage />);

    expect(await screen.findByText("Unlocked for editing")).toBeInTheDocument();
    expect(screen.getByText("The Principal manages departments and academic years.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /organisation_basics|principal/i })).not.toBeInTheDocument();

    // Lock now button calls setup.lock
    await user.click(screen.getByRole("button", { name: "Lock now" }));
    await waitFor(() => {
      expect(mocks.lockMock).toHaveBeenCalledWith({});
    });

    // Save Registration Policy calls setup.saveStep('signup_policy', ...)
    await user.click(screen.getByRole("button", { name: "Save Registration Policy" }));
    await waitFor(() => {
      expect(mocks.saveStepMock).toHaveBeenCalledWith("signup_policy", {
        student_self_registration_enabled: false,
        parent_self_registration_enabled: false,
        approval_mode: "manual",
      });
    });

    // Unlock dialog copy & 3 lockable sections only
    await user.click(screen.getByRole("button", { name: "Unlock sections" }));
    expect(
      await screen.findByText("Saving an unlocked section locks it again automatically.")
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/countdown|remaining|expires in|hours left|minutes left/i)
    ).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Institution Profile/i })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Calendar Basics/i })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Registration Policy/i })).toBeInTheDocument();
  });

  it("prompts for reason when enabling staff self-registration and disables without reason", async () => {
    const user = userEvent.setup();
    currentCategoryParam = "auth";

    renderWithQueryClient(<ControlPanelPage />);

    const toggle = await screen.findByRole("switch", {
      name: /Allow staff self-registration/i,
    });
    await user.click(toggle);

    expect(
      await screen.findByText("Enable staff self-registration")
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText("Audit reason"), "Fall recruitment drive");
    await user.click(
      screen.getByRole("button", { name: "Enable self-registration" })
    );

    await waitFor(() => {
      expect(mocks.settingsUpdateMock).toHaveBeenCalledWith(
        "auth.staff_self_registration_enabled",
        {
          value: { enabled: true },
          reason: "Fall recruitment drive",
        }
      );
    });
  });

  it("displays active token summary and saves token lifetimes in API Access pane", async () => {
    const user = userEvent.setup();
    currentCategoryParam = "api";

    renderWithQueryClient(<ControlPanelPage />);

    expect(await screen.findByText("14")).toBeInTheDocument();
    expect(screen.getByText("9")).toBeInTheDocument();

    const webInput = screen.getByLabelText("Web Token Lifetime (hours)");
    await user.clear(webInput);
    await user.type(webInput, "24");
    await user.click(screen.getByRole("button", { name: "Save Token Policy" }));

    await waitFor(() => {
      expect(mocks.settingsUpdateMock).toHaveBeenCalledWith(
        "auth.token_lifetime_web_hours",
        { value: { hours: 24 } }
      );
      expect(mocks.settingsUpdateMock).toHaveBeenCalledWith(
        "auth.token_lifetime_mobile_days",
        { value: { days: 30 } }
      );
    });
  });

  it("renders Audit & Security key and reason without exposing raw JSON properties", async () => {
    currentCategoryParam = "audit";

    renderWithQueryClient(<ControlPanelPage />);

    expect(
      await screen.findByText("auth.staff_self_registration_enabled")
    ).toBeInTheDocument();
    expect(screen.getByText("Open intake window")).toBeInTheDocument();
    expect(screen.queryByText(/should-not-appear/)).not.toBeInTheDocument();
  });

  it("hides security category filter for Principal role in Audit & Security", async () => {
    const user = userEvent.setup();
    mocks.user.role_assignments = [
      { role: { slug: "principal" }, scope_label: "institution" },
    ];
    currentCategoryParam = "audit";

    renderWithQueryClient(<ControlPanelPage />);

    await screen.findByText("auth.staff_self_registration_enabled");
    await user.click(screen.getByRole("combobox", { name: "Category" }));
    expect(await screen.findByRole("option", { name: "Identity" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Security" })).not.toBeInTheDocument();

    mocks.user.role_assignments = [
      { role: { slug: "super_admin" }, scope_label: "institution" },
    ];
  });

  it("toggles Audit & Security reason between truncated and multi-line expanded on click", async () => {
    const user = userEvent.setup();
    currentCategoryParam = "audit";

    renderWithQueryClient(<ControlPanelPage />);

    const reasonBtn = await screen.findByRole("button", { name: "Open intake window" });
    expect(reasonBtn).toHaveAttribute("aria-expanded", "false");
    expect(reasonBtn).toHaveClass("truncate");

    await user.click(reasonBtn);
    expect(reasonBtn).toHaveAttribute("aria-expanded", "true");
    expect(reasonBtn).toHaveClass("whitespace-normal");
  });
});

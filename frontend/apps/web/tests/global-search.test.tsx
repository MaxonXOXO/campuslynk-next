import * as React from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

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

import { renderWithQueryClient } from "./helpers/query-wrapper";
import { GlobalSearchCommand } from "../src/components/shell/GlobalSearchCommand";
import {
  buildControlPanelSettingHref,
  searchControlPanelSettings,
} from "../src/lib/search/search-registry";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  usersList: vi.fn(),
  departmentsList: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
  usePathname: () => "/w/super-admin",
  useSearchParams: () => new URLSearchParams(""),
}));

vi.mock("@/lib/auth/session-provider", () => ({
  useApiClient: () => ({
    identity: {
      users: {
        list: mocks.usersList,
      },
    },
    organisation: {
      departments: {
        list: mocks.departmentsList,
      },
    },
  }),
  useSession: () => ({
    state: {
      status: "authenticated",
      tenant: "dev",
      user: {
        id: "01SA",
        name: "IT Head",
        email: "it@dev.test",
        assignments: [
          { role_key: "super_admin", scope_type: "institution", scope_label: "i_dev" },
        ],
      },
    },
  }),
}));

describe("Global Search & Deep Settings Registry", () => {
  beforeEach(() => {
    mocks.push.mockReset();
    mocks.replace.mockReset();
    mocks.usersList.mockReset().mockResolvedValue({ data: [] });
    mocks.departmentsList.mockReset().mockResolvedValue({ data: [] });
  });

  afterEach(() => {
    cleanup();
  });

  it("matches deep Control Panel settings by setting key, description, and keywords", () => {
    const byKey = searchControlPanelSettings("auth.token_lifetime_web_hours");
    expect(byKey).toHaveLength(1);
    expect(byKey[0]?.id).toBe("web-token-lifetime");
    expect(buildControlPanelSettingHref(byKey[0]!)).toBe(
      "/w/super-admin/settings?category=api&focus=cp-web-token-hours"
    );

    const byKeyword = searchControlPanelSettings("day order");
    expect(byKeyword.some((item) => item.id === "calendar-day-order")).toBe(true);
  });

  it("opens dropdown below search box via Ctrl+K, navigates on select, and closes on Escape or outside click", async () => {
    const user = userEvent.setup();

    renderWithQueryClient(
      <div>
        <GlobalSearchCommand activeSlug="super-admin" workspaces={["super-admin"]} />
        <button type="button">Outside target</button>
      </div>
    );

    const searchInput = screen.getByRole("searchbox", { name: "Search" });

    // Open via Ctrl+K
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(await screen.findByRole("region", { name: "Search results" })).toBeInTheDocument();

    // Close via Escape and ensure it stays closed
    fireEvent.keyDown(searchInput, { key: "Escape" });
    expect(screen.queryByRole("region", { name: "Search results" })).not.toBeInTheDocument();

    // Re-open by clicking input, then close by clicking outside
    await user.click(searchInput);
    expect(await screen.findByRole("region", { name: "Search results" })).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole("button", { name: "Outside target" }));
    expect(screen.queryByRole("region", { name: "Search results" })).not.toBeInTheDocument();

    // Re-open, type deep setting keyword, and select
    await user.click(searchInput);
    await user.type(searchInput, "cooldown");

    const settingOption = await screen.findByText("Rejected Resubmit Cooldown (Days)");
    await user.click(settingOption);

    expect(mocks.push).toHaveBeenCalledWith(
      "/w/super-admin/settings?category=auth&focus=cp-cooldown-days"
    );
    expect(screen.queryByRole("region", { name: "Search results" })).not.toBeInTheDocument();
  });

  it("fetches debounced live users from apiClient in the dropdown and navigates on select", async () => {
    const user = userEvent.setup();
    mocks.usersList.mockResolvedValue({
      data: [
        {
          id: "01USR1",
          name: "Ananya Nair",
          email: "ananya@college.edu",
          status: "active",
        },
      ],
    });

    renderWithQueryClient(
      <GlobalSearchCommand activeSlug="super-admin" workspaces={["super-admin"]} />
    );

    const searchInput = screen.getByRole("searchbox", { name: "Search" });
    await user.click(searchInput);
    await user.type(searchInput, "Ananya");

    await waitFor(() => {
      expect(mocks.usersList).toHaveBeenCalledWith({ search: "Ananya", limit: 5 });
    });

    const userResult = await screen.findByText("Ananya Nair");
    await user.click(userResult);

    expect(mocks.push).toHaveBeenCalledWith("/w/super-admin/users?search=Ananya%20Nair");
  });
});

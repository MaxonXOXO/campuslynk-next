import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  WorkspaceBreadcrumbs,
  buildBreadcrumbTrail,
} from "../src/components/shell/WorkspaceBreadcrumbs";

const mocks = vi.hoisted(() => ({
  pathname: "/w/super-admin",
  search: "",
  push: vi.fn(),
  back: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useSearchParams: () => new URLSearchParams(mocks.search),
  useRouter: () => ({ push: mocks.push, back: mocks.back }),
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

describe("WorkspaceBreadcrumbs", () => {
  beforeEach(() => {
    mocks.pathname = "/w/super-admin";
    mocks.search = "";
    mocks.push.mockReset();
    mocks.back.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("builds expected trails for overview, nested routes, and Control Panel categories", () => {
    expect(buildBreadcrumbTrail("super-admin", "/w/super-admin")).toEqual([
      { label: "Super Admin", href: "/w/super-admin" },
      { label: "Overview" },
    ]);

    expect(
      buildBreadcrumbTrail("super-admin", "/w/super-admin/users/import")
    ).toEqual([
      { label: "Super Admin", href: "/w/super-admin" },
      { label: "Users", href: "/w/super-admin/users" },
      { label: "Import Staff" },
    ]);

    expect(
      buildBreadcrumbTrail("super-admin", "/w/super-admin/settings", "auth")
    ).toEqual([
      { label: "Super Admin", href: "/w/super-admin" },
      { label: "Control Panel", href: "/w/super-admin/settings" },
      { label: "Authentication & Onboarding" },
    ]);
  });

  it("hides Back button on root overview and navigates back on sub-pages", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<WorkspaceBreadcrumbs activeSlug="super-admin" />);

    expect(screen.queryByRole("button", { name: "Go back" })).not.toBeInTheDocument();
    expect(screen.getByText("Overview")).toHaveAttribute("aria-current", "page");

    mocks.pathname = "/w/super-admin/users/import";
    rerender(<WorkspaceBreadcrumbs activeSlug="super-admin" />);

    const backBtn = screen.getByRole("button", { name: "Go back" });
    expect(backBtn).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Super Admin" })).toHaveAttribute(
      "href",
      "/w/super-admin"
    );
    expect(screen.getByRole("link", { name: "Users" })).toHaveAttribute(
      "href",
      "/w/super-admin/users"
    );
    expect(screen.getByText("Import Staff")).toHaveAttribute("aria-current", "page");

    await user.click(backBtn);
    expect(mocks.back.mock.calls.length + mocks.push.mock.calls.length).toBeGreaterThan(0);
  });
});


import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import {
  DashboardGreetingHeader,
  formatGreetingTitle,
  getTimeOfDayGreeting,
} from "../src/components/shell/DashboardGreetingHeader";

const mocks = vi.hoisted(() => ({
  user: { id: "01SA", name: "Dev Admin", assignments: [] } as {
    id: string;
    name?: string;
    assignments: unknown[];
  } | null,
}));

vi.mock("@/lib/auth/session-provider", () => ({
  useSession: () => ({
    state: { status: "authenticated", user: mocks.user },
  }),
}));

describe("DashboardGreetingHeader", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("maps hours to the expected time-of-day greetings", () => {
    expect(getTimeOfDayGreeting(8)).toBe("Good morning");
    expect(getTimeOfDayGreeting(14)).toBe("Good afternoon");
    expect(getTimeOfDayGreeting(19)).toBe("Good evening");
    expect(getTimeOfDayGreeting(23)).toBe("Welcome back");
    expect(getTimeOfDayGreeting(2)).toBe("Welcome back");
  });

  it("formats greeting title using full user.name without splitting", () => {
    expect(formatGreetingTitle("Good morning", "Dr. Meera Menon")).toBe(
      "Good morning, Dr. Meera Menon"
    );
    expect(formatGreetingTitle("Good afternoon", "   ")).toBe("Good afternoon");
    expect(formatGreetingTitle("Good evening", undefined)).toBe("Good evening");
  });

  it("renders time-of-day greeting with user name and description", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-27T09:30:00"));
    mocks.user = { id: "01SA", name: "Dev Admin", assignments: [] };

    render(
      <DashboardGreetingHeader description="Manage institutional configuration." />
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "Good morning, Dev Admin" })
    ).toBeInTheDocument();
    expect(
      screen.getByText("Manage institutional configuration.")
    ).toBeInTheDocument();
  });
});


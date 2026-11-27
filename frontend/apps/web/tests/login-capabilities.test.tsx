import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import {
  fetchCapabilitiesFlow,
  resolveEdgeForwardedFor,
} from "../src/lib/server/capabilities";
import LoginPage from "../src/app/login/page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/auth/session-provider", () => ({
  useSession: () => ({
    controller: { enterApp: vi.fn() },
    state: { status: "unauthenticated", user: null },
  }),
}));

describe("capabilities BFF & /login Request access visibility", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("never forwards client-supplied X-Forwarded-For when untrusted", async () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.99" });
    expect(resolveEdgeForwardedFor(headers, false)).toBeUndefined();

    const fetchFn = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ data: { staff_self_registration_enabled: true } }),
        { status: 200 }
      )
    );

    await fetchCapabilitiesFlow({
      config: {
        backendBaseUrl: "http://api:8000",
        tenant: "dev",
        allowedOrigins: [],
        deviceName: "web",
        isProduction: false,
      },
      fetchFn,
      requestHeaders: headers,
      trustEdgeProxy: false,
    });

    const passedHeaders = fetchFn.mock.calls[0]?.[1]?.headers as Headers;
    expect(passedHeaders.get("X-Forwarded-For")).toBeNull();
    expect(passedHeaders.get("X-Tenant")).toBe("dev");
  });

  it("forwards only the edge-appended IP when behind a trusted proxy", () => {
    const headers = new Headers({
      "x-forwarded-for": "198.51.100.1, 10.0.0.5",
    });
    expect(resolveEdgeForwardedFor(headers, true)).toBe("10.0.0.5");

    const realIpHeaders = new Headers({
      "x-real-ip": "192.0.2.42",
      "x-forwarded-for": "198.51.100.1",
    });
    expect(resolveEdgeForwardedFor(realIpHeaders, true)).toBe("192.0.2.42");
  });

  it("hides Request access while loading and when capabilities explicitly returns false", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ data: { staff_self_registration_enabled: false } }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<LoginPage />);

    expect(
      screen.queryByRole("link", { name: "Request access" })
    ).not.toBeInTheDocument();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    expect(
      screen.queryByRole("link", { name: "Request access" })
    ).not.toBeInTheDocument();
  });

  it("shows Request access when capabilities returns true or fails open on error", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("Network error"));
    vi.stubGlobal("fetch", fetchMock);

    render(<LoginPage />);

    expect(
      await screen.findByRole("link", { name: "Request access" })
    ).toBeInTheDocument();
  });

  it("fails open and shows Request access after 1.5s timeout", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(() => new Promise<Response>(() => {}));
    vi.stubGlobal("fetch", fetchMock);

    render(<LoginPage />);
    expect(
      screen.queryByRole("link", { name: "Request access" })
    ).not.toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(1500);
    });

    expect(
      screen.getByRole("link", { name: "Request access" })
    ).toBeInTheDocument();
  });
});


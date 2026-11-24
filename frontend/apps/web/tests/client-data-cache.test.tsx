import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import {
  createAppQueryClient,
  shouldRetryApiError,
  useApiMutation,
  useApiQuery,
} from "../src/lib/query/api-query";
import { SessionProvider, useSession } from "../src/lib/auth/session-provider";

const mocks = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn() },
  fetchMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => mocks.router,
  usePathname: () => "/w/super-admin",
}));

describe("Client Data Cache (TanStack Query)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    window.sessionStorage.clear();
    globalThis.fetch = mocks.fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    cleanup();
  });

  it("shows cached data on revisit without a skeleton and refetches in the background", async () => {
    const queryClient = createAppQueryClient();
    let callCount = 0;

    function OverviewProbe() {
      const { state } = useSession();
      const { data, isPending, isRefreshing } = useApiQuery<{ total: number }>({
        queryKey: ["probe", "overview"],
        enabled: state.status === "authenticated",
        staleTime: 0,
        queryFn: async () => {
          callCount += 1;
          return { total: callCount * 10 };
        },
      });
      if (isPending) return <div>Skeleton Loading</div>;
      return (
        <div>
          <span>Total: {data?.total}</span>
          {isRefreshing ? <span>Refreshing</span> : null}
        </div>
      );
    }

    const Wrapper = ({ show }: { show: boolean }) => (
      <SessionProvider>
        <QueryClientProvider client={queryClient}>
          {show ? <OverviewProbe /> : <div>Other Page</div>}
        </QueryClientProvider>
      </SessionProvider>
    );

    mocks.fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ data: { id: "01U1", assignments: [] } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const { rerender } = render(<Wrapper show />);
    expect(await screen.findByText("Total: 10")).toBeInTheDocument();

    rerender(<Wrapper show={false} />);
    expect(screen.getByText("Other Page")).toBeInTheDocument();

    rerender(<Wrapper show />);
    expect(screen.queryByText("Skeleton Loading")).not.toBeInTheDocument();
    expect(screen.getByText(/Total:/)).toBeInTheDocument();
    await waitFor(() => expect(callCount).toBe(2));
  });

  it("clears the QueryClient cache on logout", async () => {
    const user = userEvent.setup();
    const activeUser = { id: "01U1", name: "User One", assignments: [] };

    mocks.fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/session/logout")) {
        return new Response(null, { status: 204 });
      }
      return new Response(JSON.stringify({ data: activeUser }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    function CacheProbe() {
      const { state, controller } = useSession();
      const qc = useQueryClient();
      const { data } = useApiQuery<{ secret: string }>({
        queryKey: ["probe", "secret"],
        enabled: state.status === "authenticated",
        queryFn: async () => ({ secret: `data-for-${state.user?.id}` }),
      });

      return (
        <div>
          <span>Status: {state.status}</span>
          <span>Data: {data?.secret ?? "none"}</span>
          <span>CacheSize: {qc.getQueryCache().getAll().length}</span>
          <button type="button" onClick={() => void controller.logout()}>
            Logout
          </button>
        </div>
      );
    }

    render(
      <SessionProvider>
        <CacheProbe />
      </SessionProvider>
    );

    expect(await screen.findByText("Data: data-for-01U1")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Logout" }));

    await waitFor(() => {
      expect(screen.getByText("Status: unauthenticated")).toBeInTheDocument();
      expect(screen.getByText("Data: none")).toBeInTheDocument();
    });
  });

  it("does not retry 401/403/422 errors and retries network errors up to 2 times", () => {
    expect(shouldRetryApiError(0, { status: 401 })).toBe(false);
    expect(shouldRetryApiError(0, { status: 403 })).toBe(false);
    expect(shouldRetryApiError(0, { status: 422 })).toBe(false);
    expect(shouldRetryApiError(0, new TypeError("Failed to fetch"))).toBe(true);
    expect(shouldRetryApiError(1, new TypeError("Failed to fetch"))).toBe(true);
    expect(shouldRetryApiError(2, new TypeError("Failed to fetch"))).toBe(false);
  });

  it("invalidates affected queries on mutation so newly created items appear", async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const items = ["Alice"];

    mocks.fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ data: { id: "01U1", assignments: [] } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    function DirectoryProbe() {
      const { data } = useApiQuery<string[]>({
        queryKey: ["users", "directory"],
        queryFn: async () => [...items],
      });
      const createMutation = useApiMutation<void, string>({
        mutationFn: async (_client, name) => {
          items.push(name);
        },
        invalidateKeys: [["users", "directory"]],
      });

      return (
        <div>
          <span>Users: {(data ?? []).join(",")}</span>
          <button type="button" onClick={() => createMutation.mutate("Bob")}>
            Create Bob
          </button>
        </div>
      );
    }

    render(
      <SessionProvider>
        <QueryClientProvider client={queryClient}>
          <DirectoryProbe />
        </QueryClientProvider>
      </SessionProvider>
    );

    expect(await screen.findByText("Users: Alice")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Create Bob" }));
    expect(await screen.findByText("Users: Alice,Bob")).toBeInTheDocument();
  });

  it("never writes cache data or secrets to localStorage or sessionStorage", async () => {
    const setItemLocal = vi.spyOn(Storage.prototype, "setItem");

    mocks.fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ data: { id: "01U1", assignments: [] } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    function StorageProbe() {
      const { data } = useApiQuery<{ ok: boolean }>({
        queryKey: ["probe", "storage"],
        queryFn: async () => ({ ok: true }),
      });
      return <span>Loaded: {String(data?.ok ?? false)}</span>;
    }

    render(
      <SessionProvider>
        <StorageProbe />
      </SessionProvider>
    );

    expect(await screen.findByText("Loaded: true")).toBeInTheDocument();
    expect(setItemLocal).not.toHaveBeenCalled();
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    setItemLocal.mockRestore();
  });
});

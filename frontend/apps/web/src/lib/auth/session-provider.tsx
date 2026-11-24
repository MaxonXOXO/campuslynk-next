"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { createAppQueryClient } from "../query/api-query";
import { createBrowserApiClient } from "./browser-client";
import { createBrowserSessionApi } from "./browser-session-api";
import { SessionController, type SessionState } from "./session-core";

interface SessionContextValue {
  controller: SessionController;
  state: SessionState;
}

const SessionContext = React.createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const routerRef = React.useRef(router);
  routerRef.current = router;

  const [controller] = React.useState(
    () =>
      new SessionController({
        api: createBrowserSessionApi(typeof window === "undefined" ? "http://localhost" : window.location.origin),
        navigate: (to) => routerRef.current.replace(to),
        currentLocation: () => `${window.location.pathname}${window.location.search}`,
      })
  );

  const [queryClient] = React.useState(() => createAppQueryClient());
  const state = React.useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
  const prevUserIdRef = React.useRef<string | undefined>(undefined);

  React.useEffect(() => {
    void controller.bootstrap();
  }, [controller]);

  React.useEffect(() => {
    const currentUserId = state.user?.id;
    if (state.status === "unauthenticated") {
      queryClient.clear();
      prevUserIdRef.current = undefined;
      return;
    }
    if (
      prevUserIdRef.current !== undefined &&
      currentUserId !== undefined &&
      prevUserIdRef.current !== currentUserId
    ) {
      queryClient.clear();
    }
    if (currentUserId !== undefined) {
      prevUserIdRef.current = currentUserId;
    }
  }, [queryClient, state.status, state.user?.id]);

  const value = React.useMemo(() => ({ controller, state }), [controller, state]);
  return (
    <SessionContext.Provider value={value}>
      <QueryClientProvider client={queryClient}>
        {children}
        {process.env.NODE_ENV === "development" ? (
          <ReactQueryDevtools initialIsOpen={false} />
        ) : null}
      </QueryClientProvider>
    </SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const ctx = React.useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}

/** Typed API client for authenticated calls; 401 clears the session, forced-change 403 reroutes. */
export function useApiClient() {
  const { controller } = useSession();

  return React.useMemo(
    () =>
      createBrowserApiClient({
        origin: window.location.origin,
        hooks: {
          onUnauthorized: () => controller.handleUnauthorized(),
          onPasswordChangeRequired: () => controller.handlePasswordChangeRequired(),
        },
      }),
    [controller]
  );
}


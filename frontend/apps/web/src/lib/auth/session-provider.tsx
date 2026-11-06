"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
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

  const state = React.useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);

  React.useEffect(() => {
    void controller.bootstrap();
  }, [controller]);

  const value = React.useMemo(() => ({ controller, state }), [controller, state]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
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


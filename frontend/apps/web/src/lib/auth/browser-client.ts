import { createApiClient } from "@academic-suite/api-client";
import { isPasswordChangeRequired } from "./problem";

export interface BrowserClientHooks {
  onUnauthorized?: () => void;
  onPasswordChangeRequired?: () => void;
}

export interface BrowserClientOptions {
  origin: string;
  hooks?: BrowserClientHooks;
  fetchFn?: typeof fetch;
}

/**
 * Typed API client that talks only to the same-origin proxy. No token is held in JS:
 * the httpOnly cookie is attached by the browser and exchanged for a Bearer by the proxy.
 */
export function createBrowserApiClient({ origin, hooks, fetchFn }: BrowserClientOptions) {
  const baseFetch = fetchFn ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));

  const wrapped: typeof fetch = async (input, init) => {
    const response = await baseFetch(input, { ...init, credentials: "same-origin" });

    if (hooks?.onUnauthorized && response.status === 401) {
      hooks.onUnauthorized();
    } else if (hooks?.onPasswordChangeRequired && response.status === 403) {
      try {
        const body: unknown = await response.clone().json();
        if (isPasswordChangeRequired({ status: 403, ...(body as object) })) {
          hooks.onPasswordChangeRequired();
        }
      } catch {
        // Non-JSON 403: not the password-change problem.
      }
    }

    return response;
  };

  return createApiClient({ baseUrl: `${origin}/api/proxy/api/v1`, fetchFn: wrapped });
}


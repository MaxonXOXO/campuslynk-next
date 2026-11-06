import { createBrowserApiClient } from "./browser-client";
import {
  SessionHttpError,
  type LoginResponse,
  type PasswordChangeResponse,
  type SessionApi,
  type SessionUser,
} from "./session-core";
import type { SetupStatusCheck } from "../../app/setup/logic/role-routing";

async function postSession<T>(path: string, body: unknown, fetchFn: typeof fetch): Promise<T> {
  let response: Response;

  try {
    response = await fetchFn(path, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new SessionHttpError({ network: true });
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    json = undefined;
  }

  if (!response.ok) throw new SessionHttpError({ status: response.status, body: json });
  return json as T;
}

/** Session API for the browser: own /api/session/* handlers plus the typed client over the proxy. */
export function createBrowserSessionApi(origin: string, fetchFn?: typeof fetch): SessionApi {
  const doFetch: typeof fetch = fetchFn ?? ((input, init) => fetch(input, init));
  // No hooks: the session controller interprets 401/403 itself during bootstrap and login.
  const client = createBrowserApiClient({ origin, fetchFn: doFetch });

  return {
    login: (identifier, password) =>
      postSession<LoginResponse>("/api/session/login", { identifier, password }, doFetch),
    logout: async () => {
      await postSession<unknown>("/api/session/logout", undefined, doFetch);
    },
    changePassword: (current_password, new_password) =>
      postSession<PasswordChangeResponse>("/api/session/password", { current_password, new_password }, doFetch),
    fetchMe: async () => ((await client.me.get()) as unknown as { data: SessionUser }).data,
    fetchSetupStatus: async () => ((await client.setup.status()) as unknown as { data: SetupStatusCheck }).data,
  };
}

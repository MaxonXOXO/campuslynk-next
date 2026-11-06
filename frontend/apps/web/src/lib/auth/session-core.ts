import type { SetupStatusCheck, UserWithAssignments } from "../../app/setup/logic/role-routing";
import {
  classifyLoginFailure,
  classifyPasswordFailure,
  isPasswordChangeRequired,
  isUnauthorized,
  type LoginFailure,
  type PasswordErrorMap,
} from "./problem";
import {
  HOME_PATH,
  LOGIN_PATH,
  buildLoginUrl,
  resolvePostLoginRoute,
  type SessionStatus,
} from "./redirect";
import { isSuperAdminAtInstitutionScope } from "../../app/setup/logic/role-routing";

export interface SessionUser extends UserWithAssignments {
  id?: string;
  name?: string;
  email?: string | null;
  must_change_password?: boolean;
  capabilities?: string[];
}

export interface SessionState {
  status: SessionStatus;
  user: SessionUser | null;
}

/** Thrown by the session API for non-2xx responses from our own /api/session/* handlers. */
export class SessionHttpError extends Error {
  readonly status?: number;
  readonly body?: unknown;
  readonly network: boolean;

  constructor(options: { status?: number; body?: unknown; network?: boolean }) {
    super("Session request failed");
    this.name = "SessionHttpError";
    this.status = options.status;
    this.body = options.body;
    this.network = options.network === true;
  }
}

export interface LoginResponse {
  must_change_password: boolean;
  user: SessionUser | null;
}

export interface PasswordChangeResponse {
  relogin_required?: boolean;
  must_change_password?: boolean;
  user?: SessionUser | null;
}

export interface SessionApi {
  login(identifier: string, password: string): Promise<LoginResponse>;
  logout(): Promise<void>;
  changePassword(currentPassword: string, newPassword: string): Promise<PasswordChangeResponse>;
  fetchMe(): Promise<SessionUser>;
  fetchSetupStatus(): Promise<SetupStatusCheck>;
}

export interface SessionControllerOptions {
  api: SessionApi;
  navigate: (to: string) => void;
  currentLocation: () => string;
}

export type LoginOutcome = { ok: true; route: string } | { ok: false; failure: LoginFailure };
export type PasswordOutcome = { ok: true; route: string } | { ok: false; error: PasswordErrorMap };

const INITIAL: SessionState = { status: "loading", user: null };

/** Framework-free session state machine so guard, 401 and flow behaviour are unit-testable. */
export class SessionController {
  private state: SessionState = INITIAL;
  private listeners = new Set<() => void>();

  constructor(private readonly options: SessionControllerOptions) {}

  getState = (): SessionState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(state: SessionState): void {
    this.state = state;
    this.listeners.forEach((l) => l());
  }

  /** Load the session from GET /me (cookie-backed). Never throws. */
  async bootstrap(): Promise<void> {
    try {
      const user = await this.options.api.fetchMe();
      this.set({
        status: user.must_change_password === true ? "must_change_password" : "authenticated",
        user,
      });
    } catch (error) {
      if (isPasswordChangeRequired(error)) {
        this.set({ status: "must_change_password", user: null });
      } else if (isUnauthorized(error)) {
        this.set({ status: "unauthenticated", user: null });
      } else {
        this.set({ status: "error", user: null });
      }
    }
  }

  async login(identifier: string, password: string, returnTo?: string | null): Promise<LoginOutcome> {
    let response: LoginResponse;

    try {
      response = await this.options.api.login(identifier, password);
    } catch (error) {
      const http = error instanceof SessionHttpError ? error : null;
      return {
        ok: false,
        failure: classifyLoginFailure({ status: http?.status, body: http?.body, network: http ? http.network : true }),
      };
    }

    // The login response decides the immediate redirect for a forced password change.
    if (response.must_change_password) {
      this.set({ status: "must_change_password", user: response.user });
      return { ok: true, route: resolvePostLoginRoute({ mustChangePassword: true, user: response.user, setupStatus: null }) };
    }

    return this.enterApp(returnTo);
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<PasswordOutcome> {
    let response: PasswordChangeResponse;

    try {
      response = await this.options.api.changePassword(currentPassword, newPassword);
    } catch (error) {
      const http = error instanceof SessionHttpError ? error : null;
      const mapped = classifyPasswordFailure({ status: http?.status, body: http?.body, network: http ? http.network : true });
      if (mapped.kind === "unauthenticated") {
        this.set({ status: "unauthenticated", user: null });
      }
      return { ok: false, error: mapped };
    }

    if (response.relogin_required) {
      this.set({ status: "unauthenticated", user: null });
      return { ok: true, route: LOGIN_PATH };
    }

    const outcome = await this.enterApp(null);
    return outcome.ok ? outcome : { ok: true, route: HOME_PATH };
  }

  async logout(): Promise<void> {
    try {
      await this.options.api.logout();
    } catch {
      // The local session is cleared regardless.
    }
    this.set({ status: "unauthenticated", user: null });
    this.options.navigate(LOGIN_PATH);
  }

  /** Called when any API call returns 401: clear the session and return to /login with a return URL. */
  handleUnauthorized(): void {
    if (this.state.status === "unauthenticated") return;

    this.set({ status: "unauthenticated", user: null });
    void this.options.api.logout().catch(() => undefined);

    const location = this.options.currentLocation();
    if (location.split(/[?#]/)[0] === LOGIN_PATH) return;
    this.options.navigate(buildLoginUrl(location));
  }

  /** Called when any API call returns the password-change-required problem type. */
  handlePasswordChangeRequired(): void {
    if (this.state.status === "must_change_password") return;
    this.set({ status: "must_change_password", user: this.state.user });
  }

  /** Resolve the post-authentication route for an existing session (used after login or on /login revisit). */
  async enterApp(returnTo: string | null | undefined): Promise<LoginOutcome> {
    try {
      const user = await this.options.api.fetchMe();

      let setupStatus: SetupStatusCheck | null = null;
      if (isSuperAdminAtInstitutionScope(user)) {
        setupStatus = await this.options.api.fetchSetupStatus();
      }

      this.set({ status: "authenticated", user });
      return { ok: true, route: resolvePostLoginRoute({ mustChangePassword: false, user, setupStatus, returnTo }) };
    } catch (error) {
      if (isPasswordChangeRequired(error)) {
        this.set({ status: "must_change_password", user: null });
        return { ok: true, route: resolvePostLoginRoute({ mustChangePassword: true, user: null, setupStatus: null }) };
      }
      this.set({ status: "error", user: null });
      return { ok: false, failure: { kind: "unavailable" } };
    }
  }
}

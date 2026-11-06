/**
 * Pure helpers that classify backend/session problems. Machine-readable problem types
 * and HTTP status are used; human-readable titles/details are never string-matched.
 */

export interface ProblemShape {
  status?: number;
  type?: string;
  errors?: Record<string, string[] | string>;
  retry_after?: number | null;
  problem?: ProblemShape;
}

export function problemStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const e = error as ProblemShape;
  return e.status ?? e.problem?.status;
}

export function problemType(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  const e = error as ProblemShape;
  return e.type ?? e.problem?.type ?? "";
}

export function isPasswordChangeRequired(error: unknown): boolean {
  return problemStatus(error) === 403 && problemType(error).endsWith("/password-change-required");
}

export function isUnauthorized(error: unknown): boolean {
  return problemStatus(error) === 401;
}

export type LoginFailureKind = "invalid" | "throttled" | "unavailable" | "network" | "validation" | "unknown";

export interface LoginFailure {
  kind: LoginFailureKind;
  retryAfterSeconds?: number;
}

/** Map a login attempt outcome to a user-facing category. 401 is always the generic "invalid". */
export function classifyLoginFailure(input: { status?: number; body?: unknown; network?: boolean }): LoginFailure {
  if (input.network) return { kind: "network" };

  const status = input.status;
  if (status === 401 || status === 403) return { kind: "invalid" };
  if (status === 422) return { kind: "validation" };

  if (status === 429) {
    const retry = (input.body as ProblemShape | undefined)?.retry_after;
    return { kind: "throttled", retryAfterSeconds: typeof retry === "number" && retry > 0 ? retry : undefined };
  }

  if (status !== undefined && status >= 500) return { kind: "unavailable" };
  return { kind: "unknown" };
}

export interface PasswordErrorMap {
  fields: Partial<Record<"current_password" | "new_password", string>>;
  general?: string;
  kind: "fields" | "wrong_current" | "throttled" | "network" | "unavailable" | "unauthenticated" | "unknown";
}

/** Map a password change failure to field errors. Laravel validation errors are keyed by field. */
export function classifyPasswordFailure(input: { status?: number; body?: unknown; network?: boolean }): PasswordErrorMap {
  if (input.network) return { fields: {}, kind: "network" };

  const status = input.status;
  if (status === 401) return { fields: {}, kind: "unauthenticated" };
  if (status === 429) return { fields: {}, kind: "throttled" };
  if (status !== undefined && status >= 500) return { fields: {}, kind: "unavailable" };

  const errors = (input.body as ProblemShape | undefined)?.errors;
  const fields: PasswordErrorMap["fields"] = {};

  if (errors && typeof errors === "object" && !Array.isArray(errors)) {
    for (const key of ["current_password", "new_password"] as const) {
      const value = errors[key];
      const message = Array.isArray(value) ? value[0] : value;
      if (typeof message === "string" && message) fields[key] = message;
    }
  }

  if (Object.keys(fields).length > 0) return { fields, kind: "fields" };

  // The backend rejects a wrong current password with an authentication error (no field map).
  if (status === 422 || status === 403 || status === 400) return { fields: {}, kind: "wrong_current" };

  return { fields: {}, kind: "unknown" };
}


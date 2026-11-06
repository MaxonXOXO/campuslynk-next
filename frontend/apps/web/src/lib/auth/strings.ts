import type { LoginFailure, PasswordErrorMap } from "./problem";

/** User-facing copy for the auth shell (English; no institution or brand names). */
export const authStrings = {
  login: {
    title: "Sign in",
    description: "Use your email, mobile number, or registration/admission number.",
    identifierLabel: "Email, mobile, or registration number",
    passwordLabel: "Password",
    showPassword: "Show password",
    hidePassword: "Hide password",
    submit: "Sign in",
    submitting: "Signing in…",
    validationRequired: "Enter your identifier and password.",
  },
  changePassword: {
    titleForced: "Choose a new password",
    titleVoluntary: "Change password",
    descriptionForced: "You must set a new password before you can continue.",
    descriptionVoluntary: "Enter your current password and choose a new one.",
    currentLabel: "Current password",
    newLabel: "New password",
    confirmLabel: "Confirm new password",
    submit: "Update password",
    submitting: "Updating…",
    mismatch: "The two passwords do not match.",
    requiredCurrent: "Enter your current password.",
    policyHeading: "Password requirements",
    policy: [
      "At least 8 characters (maximum 128).",
      "Not a single repeated character.",
      "Not a common or breached password.",
      "Not based on your institution's name or short code.",
    ],
    logout: "Sign out",
  },
  home: {
    title: "Welcome",
    description: "Your role-specific workspace is not available yet.",
    openSetup: "Open institution setup",
    logout: "Sign out",
  },
  guard: {
    loading: "Checking your session…",
    errorTitle: "Cannot reach the service",
    errorDescription: "We could not verify your session. Check your connection and try again.",
    retry: "Try again",
  },
} as const;

export function loginFailureMessage(failure: LoginFailure): string {
  switch (failure.kind) {
    case "invalid":
      return "The identifier or password is incorrect.";
    case "throttled":
      return failure.retryAfterSeconds
        ? `Too many attempts. Try again in ${failure.retryAfterSeconds} seconds.`
        : "Too many attempts. Please wait a moment and try again.";
    case "network":
      return "Cannot reach the server. Check your connection and try again.";
    case "unavailable":
      return "The service is temporarily unavailable. Please try again shortly.";
    case "validation":
      return authStrings.login.validationRequired;
    default:
      return "Something went wrong. Please try again.";
  }
}

export function passwordFailureMessage(error: PasswordErrorMap): string | null {
  switch (error.kind) {
    case "wrong_current":
      return "Your current password is incorrect.";
    case "throttled":
      return "Too many attempts. Please wait a moment and try again.";
    case "network":
      return "Cannot reach the server. Check your connection and try again.";
    case "unavailable":
      return "The service is temporarily unavailable. Please try again shortly.";
    case "unauthenticated":
      return "Your session has expired. Please sign in again.";
    case "unknown":
      return "Something went wrong. Please try again.";
    default:
      return null;
  }
}


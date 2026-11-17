"use client";

import * as React from "react";
import type { SetupStatusData } from "../logic/step-derivation";
import {
  DEFAULT_REGISTRATION_PREFERENCES,
  type RegistrationPreferences,
} from "../logic/registration-preferences";

interface RegistrationPreferencesSummaryProps {
  status: SetupStatusData | null;
}

export function RegistrationPreferencesSummary({ status }: RegistrationPreferencesSummaryProps) {
  const headingId = React.useId();
  const storedValues = status?.steps.signup_policy.values;
  const defaultsPending = storedValues == null && !status?.is_completed;
  const values = (storedValues ?? (defaultsPending ? DEFAULT_REGISTRATION_PREFERENCES : null)) as RegistrationPreferences | null;
  const label = defaultsPending
    ? "Defaults will be applied when you finish setup"
    : storedValues == null
      ? "Registration preferences from setup status"
      : status?.is_completed ? "Persisted registration preferences" : "Saved registration preferences";
  const registrationLabel = (enabled: boolean | undefined) =>
    enabled === undefined ? "—" : enabled ? "On" : "Off";

  return (
    <section aria-labelledby={headingId} className="border border-border rounded-xl p-5 bg-card space-y-3">
      <div className="border-b border-border pb-3">
        <h3 id={headingId} className="text-sm font-semibold text-foreground">Registration preferences</h3>
        <p className="text-xs text-muted-foreground mt-1">{label}</p>
      </div>
      <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
        <div>
          <dt className="text-muted-foreground">Student self-registration</dt>
          <dd className="font-medium text-foreground mt-1">{registrationLabel(values?.student_self_registration_enabled)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Parent self-registration</dt>
          <dd className="font-medium text-foreground mt-1">{registrationLabel(values?.parent_self_registration_enabled)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Approval mode</dt>
          <dd className="font-medium text-foreground mt-1">
            {values?.approval_mode === "manual" ? "Manual" : values?.approval_mode === "auto" ? "Automatic" : "—"}
          </dd>
        </div>
      </dl>
      <p className="text-xs text-muted-foreground">
        These preferences take effect when the Self-Registration module ships and can be changed then.
      </p>
    </section>
  );
}

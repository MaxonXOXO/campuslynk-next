import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import signupPolicySchema from "../../../../contracts/json-schemas/signup-policy.schema.json";
import { ReviewFinishStep } from "../src/app/setup/components/ReviewFinishStep";
import { CompletedSummary } from "../src/app/setup/components/CompletedSummary";
import {
  DEFAULT_REGISTRATION_PREFERENCES,
  type RegistrationPreferences,
} from "../src/app/setup/logic/registration-preferences";
import type { SetupStatusData } from "../src/app/setup/logic/step-derivation";

const defaultsPendingLabel = "Defaults will be applied when you finish setup";
const futureModuleNote = "These preferences take effect when the Self-Registration module ships and can be changed then.";

function createStatus(values: RegistrationPreferences | null, completed = false): SetupStatusData {
  const saved = { is_completed: true, completed_at: "2026-11-15T12:00:00Z", settings_exist: true };
  return {
    is_completed: completed,
    completed_at: completed ? "2026-11-15T12:30:00Z" : null,
    steps: {
      institution_profile: saved,
      calendar_basics: saved,
      signup_policy: {
        is_completed: values !== null,
        completed_at: values !== null ? "2026-11-15T12:00:00Z" : null,
        settings_exist: values !== null,
        values: values === null ? null : { ...values },
      },
    },
    prerequisites: { streams_count: 1, departments_count: 1, academic_years_count: 1 },
  };
}

function renderReview(status: SetupStatusData) {
  return render(
    <ReviewFinishStep
      status={status}
      onEditStep={vi.fn()}
      onBack={vi.fn()}
      onFinish={async () => undefined}
    />
  );
}

function expectPreferences(student: string, parent: string, approval: string) {
  const preferences = screen.getByRole("region", { name: "Registration preferences" });
  for (const [label, value] of [
    ["Student self-registration", student],
    ["Parent self-registration", parent],
    ["Approval mode", approval],
  ] as const) {
    expect(within(preferences).getByText(label, { selector: "dt" }).nextElementSibling).toHaveTextContent(value);
  }
  expect(within(preferences).getByText(futureModuleNote)).toBeInTheDocument();
  expect(within(preferences).queryByRole("button")).not.toBeInTheDocument();
  expect(within(preferences).queryByRole("link")).not.toBeInTheDocument();
  expect(within(preferences).queryByRole("checkbox")).not.toBeInTheDocument();
  expect(within(preferences).queryByRole("textbox")).not.toBeInTheDocument();
  return within(preferences);
}

afterEach(cleanup);

describe("Read-only registration preferences from setup status", () => {
  it("keeps the single UI defaults definition equal to every policy schema default", () => {
    const schemaDefaults = Object.fromEntries(
      Object.entries(signupPolicySchema.properties).map(([key, property]) => [key, property.default])
    );
    expect(DEFAULT_REGISTRATION_PREFERENCES).toEqual(schemaDefaults);
  });

  it("previews defaults for null unsaved values without blocking Finish or initializing settings", () => {
    const status = createStatus(null);
    renderReview(status);

    const preferences = expectPreferences("Off", "Off", "Manual");
    expect(preferences.getByText(defaultsPendingLabel)).toBeInTheDocument();
    expect(preferences.queryByText("Saved registration preferences")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Complete First-Run Setup" })).toBeEnabled();
    expect(status.steps.signup_policy.values).toBeNull();
    expect(status.steps.signup_policy.settings_exist).toBe(false);
  });

  it.each([
    { name: "student enabled with automatic approval", values: { student_self_registration_enabled: true, parent_self_registration_enabled: false, approval_mode: "auto" }, student: "On", parent: "Off", approval: "Automatic" },
    { name: "parent enabled with manual approval", values: { student_self_registration_enabled: false, parent_self_registration_enabled: true, approval_mode: "manual" }, student: "Off", parent: "On", approval: "Manual" },
    { name: "saved values equal to defaults", values: DEFAULT_REGISTRATION_PREFERENCES, student: "Off", parent: "Off", approval: "Manual" },
  ] as const)("shows $name as saved preferences before completion", ({ values, student, parent, approval }) => {
    renderReview(createStatus(values));

    const preferences = expectPreferences(student, parent, approval);
    expect(preferences.getByText("Saved registration preferences")).toBeInTheDocument();
    expect(preferences.queryByText(defaultsPendingLabel)).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Edit" })).toHaveLength(3);
  });

  it.each([
    { name: "persisted defaults", values: DEFAULT_REGISTRATION_PREFERENCES, student: "Off", parent: "Off", approval: "Manual" },
    { name: "persisted custom values", values: { student_self_registration_enabled: true, parent_self_registration_enabled: true, approval_mode: "auto" }, student: "On", parent: "On", approval: "Automatic" },
  ] as const)("uses $name from the completed status without a policy edit link", ({ values, student, parent, approval }) => {
    render(<CompletedSummary status={createStatus(values, true)} onEditStep={vi.fn()} />);

    const preferences = expectPreferences(student, parent, approval);
    expect(preferences.getByText("Persisted registration preferences")).toBeInTheDocument();
    expect(preferences.queryByText(defaultsPendingLabel)).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Edit" })).toHaveLength(3);
  });

  it("does not invent defaults when an already-completed tenant has no policy values", () => {
    render(<CompletedSummary status={createStatus(null, true)} onEditStep={vi.fn()} />);

    const preferences = expectPreferences("—", "—", "—");
    expect(preferences.queryByText(defaultsPendingLabel)).not.toBeInTheDocument();
    expect(preferences.queryByText("Persisted registration preferences")).not.toBeInTheDocument();
  });
});

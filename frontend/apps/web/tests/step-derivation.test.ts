import { describe, it, expect } from "vitest";
import {
  deriveCurrentStep,
  deriveStepStates,
  isFinishEnabled,
  getPrerequisiteChecklist,
  type SetupStatusData,
} from "../src/app/setup/logic/step-derivation";

describe("Step Derivation & Completion Logic", () => {
  const baseStatus: SetupStatusData = {
    completed_at: null,
    is_completed: false,
    steps: {
      institution_profile: { completed_at: null, is_completed: false, settings_exist: false },
      calendar_basics: { completed_at: null, is_completed: false, settings_exist: false },
      signup_policy: { completed_at: null, is_completed: false, settings_exist: false },
    },
    prerequisites: {
      streams_count: 0,
      departments_count: 0,
      academic_years_count: 0,
    },
  };

  it("derives Step 1 (institution_profile) when profile is incomplete", () => {
    const step = deriveCurrentStep(baseStatus);
    expect(step).toBe("institution_profile");
  });

  it("derives Step 2 (organisation_basics) when profile is done but prerequisites are missing", () => {
    const status: SetupStatusData = {
      ...baseStatus,
      steps: {
        ...baseStatus.steps,
        institution_profile: { completed_at: "2026-11-05T12:00:00Z", is_completed: true, settings_exist: true },
      },
      prerequisites: {
        streams_count: 1,
        departments_count: 0, // Missing
        academic_years_count: 1,
      },
    };

    expect(deriveCurrentStep(status)).toBe("organisation_basics");
  });

  it("derives Step 3 (calendar_basics) when profile and organisation prerequisites are satisfied", () => {
    const status: SetupStatusData = {
      ...baseStatus,
      steps: {
        ...baseStatus.steps,
        institution_profile: { completed_at: "2026-11-05T12:00:00Z", is_completed: true, settings_exist: true },
      },
      prerequisites: {
        streams_count: 1,
        departments_count: 2,
        academic_years_count: 1,
      },
    };

    expect(deriveCurrentStep(status)).toBe("calendar_basics");
  });

  it("derives Step 4 (signup_policy) when calendar is also complete", () => {
    const status: SetupStatusData = {
      ...baseStatus,
      steps: {
        ...baseStatus.steps,
        institution_profile: { completed_at: "2026-11-05T12:00:00Z", is_completed: true, settings_exist: true },
        calendar_basics: { completed_at: "2026-11-05T12:05:00Z", is_completed: true, settings_exist: true },
      },
      prerequisites: {
        streams_count: 1,
        departments_count: 2,
        academic_years_count: 1,
      },
    };

    expect(deriveCurrentStep(status)).toBe("signup_policy");
  });

  it("derives Step 5 (review_finish) when all steps and prerequisites are satisfied", () => {
    const status: SetupStatusData = {
      ...baseStatus,
      steps: {
        institution_profile: { completed_at: "2026-11-05T12:00:00Z", is_completed: true, settings_exist: true },
        calendar_basics: { completed_at: "2026-11-05T12:05:00Z", is_completed: true, settings_exist: true },
        signup_policy: { completed_at: "2026-11-05T12:10:00Z", is_completed: true, settings_exist: true },
      },
      prerequisites: {
        streams_count: 2,
        departments_count: 3,
        academic_years_count: 1,
      },
    };

    expect(deriveCurrentStep(status)).toBe("review_finish");
  });

  it("respects explicit requestedStep in URL query", () => {
    expect(deriveCurrentStep(baseStatus, "calendar_basics")).toBe("calendar_basics");
    expect(deriveCurrentStep(baseStatus, "signup_policy")).toBe("signup_policy");
    expect(deriveCurrentStep(baseStatus, "invalid_step")).toBe("institution_profile");
  });

  it("derives accurate step states (not_started, saved, current)", () => {
    const status: SetupStatusData = {
      ...baseStatus,
      steps: {
        ...baseStatus.steps,
        institution_profile: { completed_at: "2026-11-05T12:00:00Z", is_completed: true, settings_exist: true },
      },
      prerequisites: {
        streams_count: 1,
        departments_count: 1,
        academic_years_count: 1,
      },
    };

    const states = deriveStepStates(status, "calendar_basics");
    expect(states.institution_profile).toBe("saved");
    expect(states.organisation_basics).toBe("saved");
    expect(states.calendar_basics).toBe("current");
    expect(states.signup_policy).toBe("not_started");
    expect(states.review_finish).toBe("not_started");
  });

  it("enables Finish button strictly when all steps and prerequisite counts are satisfied", () => {
    expect(isFinishEnabled(baseStatus)).toBe(false);

    const completeStatus: SetupStatusData = {
      completed_at: null,
      is_completed: false,
      steps: {
        institution_profile: { completed_at: "2026-11-05T12:00:00Z", is_completed: true, settings_exist: true },
        calendar_basics: { completed_at: "2026-11-05T12:05:00Z", is_completed: true, settings_exist: true },
        signup_policy: { completed_at: "2026-11-05T12:10:00Z", is_completed: true, settings_exist: true },
      },
      prerequisites: {
        streams_count: 1,
        departments_count: 1,
        academic_years_count: 1,
      },
    };

    expect(isFinishEnabled(completeStatus)).toBe(true);

    // If any count drops to 0, finish is disabled
    const missingYears = {
      ...completeStatus,
      prerequisites: { ...completeStatus.prerequisites, academic_years_count: 0 },
    };
    expect(isFinishEnabled(missingYears)).toBe(false);
  });

  it("returns checklist reflecting active progress", () => {
    const checklist = getPrerequisiteChecklist(baseStatus);
    expect(checklist.length).toBe(6);
    expect(checklist.every((c) => !c.satisfied)).toBe(true);
  });
});


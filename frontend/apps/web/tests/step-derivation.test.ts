import { describe, it, expect } from "vitest";
import {
  deriveCurrentStep,
  deriveStepStates,
  deriveSetupProgress,
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

  describe("Prerequisite progress and explicit finalization state", () => {
    it.each([
      { ready: 0, percentage: 0 },
      { ready: 1, percentage: 25 },
      { ready: 2, percentage: 50 },
      { ready: 3, percentage: 75 },
      { ready: 4, percentage: 100 },
    ])("reports $percentage% for $ready of four ready prerequisite steps", ({ ready, percentage }) => {
      const saved = { is_completed: true, completed_at: "2026-11-05T12:00:00Z", settings_exist: true };
      const status: SetupStatusData = {
        ...baseStatus,
        steps: {
          institution_profile: ready >= 1 ? saved : baseStatus.steps.institution_profile,
          calendar_basics: ready >= 3 ? saved : baseStatus.steps.calendar_basics,
          signup_policy: ready >= 4 ? saved : baseStatus.steps.signup_policy,
        },
        prerequisites: ready >= 2
          ? { streams_count: 1, departments_count: 1, academic_years_count: 1 }
          : baseStatus.prerequisites,
      };

      expect(deriveSetupProgress(status)).toEqual({
        completedRequirements: ready,
        totalRequirements: 4,
        percentage,
        completionState: ready === 4 ? "ready_to_finalize" : "in_progress",
      });
      const finalized = deriveSetupProgress({ ...status, is_completed: true, completed_at: "2026-11-05T13:00:00Z" });
      expect(finalized.percentage).toBe(percentage);
      expect(finalized.completedRequirements).toBe(ready);
      expect(finalized.completionState).toBe("completed");
    });

    it.each(["streams_count", "departments_count", "academic_years_count"] as const)(
      "requires %s before counting organisation as ready",
      (missing) => {
        const saved = { is_completed: true, completed_at: "2026-11-05T12:00:00Z", settings_exist: true };
        const progress = deriveSetupProgress({
          ...baseStatus,
          steps: { institution_profile: saved, calendar_basics: saved, signup_policy: saved },
          prerequisites: { streams_count: 2, departments_count: 3, academic_years_count: 1, [missing]: 0 },
        });
        expect(progress.percentage).toBe(75);
        expect(progress.completionState).toBe("in_progress");
      }
    );

    it("reports zero prerequisites while status is unavailable", () => {
      expect(deriveSetupProgress(null)).toEqual({
        completedRequirements: 0, totalRequirements: 4, percentage: 0, completionState: "in_progress",
      });
    });
  });
});

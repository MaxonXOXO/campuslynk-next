import { describe, it, expect } from "vitest";
import {
  WIZARD_STEPS,
  deriveCurrentStep,
  deriveStepStates,
  deriveSetupProgress,
  isValidStepId,
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
      signup_policy: { completed_at: null, is_completed: false, settings_exist: false, values: null },
    },
    prerequisites: {
      streams_count: 0,
      departments_count: 0,
      academic_years_count: 0,
    },
  };

  const readyStatus: SetupStatusData = {
    ...baseStatus,
    steps: {
      ...baseStatus.steps,
      institution_profile: { completed_at: "2026-11-05T12:00:00Z", is_completed: true, settings_exist: true },
      calendar_basics: { completed_at: "2026-11-05T12:05:00Z", is_completed: true, settings_exist: true },
    },
    prerequisites: { streams_count: 1, departments_count: 1, academic_years_count: 1 },
  };

  it("defines exactly four ordered wizard steps, with Review and Finish as step 4", () => {
    expect(WIZARD_STEPS.map(({ id, title, stepNumber }) => ({ id, title, stepNumber }))).toEqual([
      { id: "institution_profile", title: "Institution Profile", stepNumber: 1 },
      { id: "organisation_basics", title: "Organisation Basics", stepNumber: 2 },
      { id: "calendar_basics", title: "Academic Calendar", stepNumber: 3 },
      { id: "review_finish", title: "Review and Finish", stepNumber: 4 },
    ]);
    expect(isValidStepId("signup_policy")).toBe(false);
  });

  it("derives Step 1 (institution_profile) when profile is incomplete", () => {
    const step = deriveCurrentStep(baseStatus);
    expect(step).toBe("institution_profile");
    expect(deriveCurrentStep(baseStatus, "signup_policy")).toBe(step);
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
    expect(deriveCurrentStep(status, "signup_policy")).toBe("organisation_basics");
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
    expect(deriveCurrentStep(status, "signup_policy")).toBe("calendar_basics");
  });

  it("derives Step 4 (review_finish) when the five readiness items are satisfied without a policy", () => {
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

    expect(deriveCurrentStep(status)).toBe("review_finish");
    expect(deriveCurrentStep(status, "signup_policy")).toBe("review_finish");
    expect(status.steps.signup_policy.values).toBeNull();
  });

  it("does not add a wizard step when optional registration preferences were previously saved", () => {
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
    expect(deriveCurrentStep(baseStatus, "review_finish")).toBe("review_finish");
    expect(deriveCurrentStep(baseStatus, "signup_policy")).toBe("institution_profile");
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
    expect(states.review_finish).toBe("not_started");
    expect(Object.keys(states)).toEqual(WIZARD_STEPS.map(({ id }) => id));
  });

  it("enables Finish for the five readiness items without a saved registration policy", () => {
    expect(isFinishEnabled(baseStatus)).toBe(false);
    expect(isFinishEnabled(null)).toBe(false);
    expect(isFinishEnabled(readyStatus)).toBe(true);
    expect(getPrerequisiteChecklist(readyStatus).every(({ satisfied }) => satisfied)).toBe(true);
  });

  it.each(["institution_profile", "calendar_basics"] as const)(
    "blocks Finish when %s is not saved even if its setting row exists",
    (step) => {
      const status: SetupStatusData = {
        ...readyStatus,
        steps: {
          ...readyStatus.steps,
          [step]: { completed_at: null, is_completed: false, settings_exist: true },
        },
      };
      expect(isFinishEnabled(status)).toBe(false);
      expect(getPrerequisiteChecklist(status).filter(({ satisfied }) => !satisfied)).toHaveLength(1);
    }
  );

  it.each(["streams_count", "departments_count", "academic_years_count"] as const)(
    "blocks Finish independently when %s is zero",
    (missing) => {
      const status = {
        ...readyStatus,
        prerequisites: { ...readyStatus.prerequisites, [missing]: 0 },
      };
      expect(isFinishEnabled(status)).toBe(false);
      expect(getPrerequisiteChecklist(status).filter(({ satisfied }) => !satisfied)).toHaveLength(1);
    }
  );

  it("returns checklist reflecting active progress", () => {
    const checklist = getPrerequisiteChecklist(baseStatus);
    expect(checklist.map(({ id }) => id)).toEqual(["profile", "streams", "departments", "academic_years", "calendar"]);
    expect(checklist).toHaveLength(5);
    expect(checklist.every((c) => !c.satisfied)).toBe(true);
  });

  describe("Prerequisite progress and explicit finalization state", () => {
    it.each([
      { ready: 0, percentage: 0 },
      { ready: 1, percentage: 33 },
      { ready: 2, percentage: 67 },
      { ready: 3, percentage: 100 },
    ])("reports $percentage% for $ready of three ready prerequisite groups", ({ ready, percentage }) => {
      const saved = { is_completed: true, completed_at: "2026-11-05T12:00:00Z", settings_exist: true };
      const status: SetupStatusData = {
        ...baseStatus,
        steps: {
          institution_profile: ready >= 1 ? saved : baseStatus.steps.institution_profile,
          calendar_basics: ready >= 3 ? saved : baseStatus.steps.calendar_basics,
          signup_policy: baseStatus.steps.signup_policy,
        },
        prerequisites: ready >= 2
          ? { streams_count: 1, departments_count: 1, academic_years_count: 1 }
          : baseStatus.prerequisites,
      };

      expect(deriveSetupProgress(status)).toEqual({
        completedRequirements: ready,
        totalRequirements: 3,
        percentage,
        completionState: ready === 3 ? "ready_to_finalize" : "in_progress",
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
          steps: { institution_profile: saved, calendar_basics: saved, signup_policy: baseStatus.steps.signup_policy },
          prerequisites: { streams_count: 2, departments_count: 3, academic_years_count: 1, [missing]: 0 },
        });
        expect(progress.percentage).toBe(67);
        expect(progress.completionState).toBe("in_progress");
      }
    );

    it("reports zero prerequisites while status is unavailable", () => {
      expect(deriveSetupProgress(null)).toEqual({
        completedRequirements: 0, totalRequirements: 3, percentage: 0, completionState: "in_progress",
      });
    });
  });
});

import { describe, it, expect, vi } from "vitest";
import {
  isFinishEnabled,
  deriveCurrentStep,
  deriveStepStates,
  deriveSetupProgress,
  getPrerequisiteChecklist,
} from "../src/app/setup/logic/step-derivation";
import { isSetupAlreadyCompletedError } from "../src/app/setup/logic/role-routing";
import { DEFAULT_REGISTRATION_PREFERENCES } from "../src/app/setup/logic/registration-preferences";

interface MockSetupStep {
  is_completed: boolean;
  completed_at: string | null;
  settings_exist: boolean;
  values: Record<string, unknown> | null;
}

interface MockSetupState {
  completed_at: string | null;
  is_completed: boolean;
  steps: {
    institution_profile: MockSetupStep;
    calendar_basics: MockSetupStep;
    signup_policy: MockSetupStep;
  };
  prerequisites: {
    streams_count: number;
    departments_count: number;
    academic_years_count: number;
  };
  streams: Array<{ id: string; code: string; name: string; departments_count: number }>;
  departments: Array<{ id: string; stream_id: string; code: string; name: string; kind: string }>;
  academicYears: Array<{ id: string; label: string; start_date: string; end_date: string }>;
}

function createMockApiClient(state: MockSetupState) {
  return {
    setup: {
      getStatus: vi.fn(async () => ({
        data: {
          completed_at: state.completed_at,
          is_completed: state.is_completed,
          steps: { ...state.steps },
          prerequisites: { ...state.prerequisites },
        },
      })),
      saveStep: vi.fn(async (step: "institution_profile" | "calendar_basics" | "signup_policy", data: Record<string, unknown>) => {
        state.steps[step] = {
          is_completed: true,
          completed_at: new Date().toISOString(),
          settings_exist: true,
          values: { ...data },
        };
        return {
          data: {
            completed_at: state.completed_at,
            is_completed: state.is_completed,
            steps: { ...state.steps },
            prerequisites: { ...state.prerequisites },
          },
        };
      }),
      complete: vi.fn(async () => {
        // Enforce backend completion rules
        const missing: string[] = [];
        for (const step of ["institution_profile", "calendar_basics"] as const) {
          if (!state.steps[step].is_completed || !state.steps[step].settings_exist || !state.steps[step].completed_at) {
            missing.push(step);
          }
        }
        if (state.prerequisites.streams_count < 1) missing.push("streams");
        if (state.prerequisites.departments_count < 1) missing.push("departments");
        if (state.prerequisites.academic_years_count < 1) missing.push("academic_years");

        if (missing.length > 0) {

          const err = new Error("Prerequisites missing");
          Object.assign(err, {
            status: 422,
            type: "https://errors.campuslynk.net/setup-prerequisites-missing",
            errors: { missing },
          });
          throw err;
        }

        if (state.is_completed) {
          const err = new Error("Setup already completed");
          Object.assign(err, {
            status: 409,
            type: "https://errors.campuslynk.net/setup-already-completed",
          });
          throw err;
        }

        state.completed_at = new Date().toISOString();
        state.is_completed = true;
        if (!state.steps.signup_policy.settings_exist) {
          state.steps.signup_policy = {
            is_completed: true,
            completed_at: state.completed_at,
            settings_exist: true,
            values: { ...DEFAULT_REGISTRATION_PREFERENCES },
          };
        }

        return {
          data: {
            completed_at: state.completed_at,
            is_completed: true,
            steps: { ...state.steps },
            prerequisites: { ...state.prerequisites },
          },
        };
      }),
    },
    organisation: {
      streams: {
        create: vi.fn(async (data: { code: string; name: string }) => {
          const newStream = { id: `stream-${Date.now()}`, ...data, departments_count: 0 };
          state.streams.push(newStream);
          state.prerequisites.streams_count = state.streams.length;
          return { data: newStream };
        }),
      },
      departments: {
        create: vi.fn(
          async (data: { stream_id: string; code: string; name: string; kind: string }) => {
            const newDept = { id: `dept-${Date.now()}`, ...data };
            state.departments.push(newDept);
            state.prerequisites.departments_count = state.departments.length;
            const targetStream = state.streams.find((s) => s.id === data.stream_id);
            if (targetStream) {
              targetStream.departments_count += 1;
            }
            return { data: newDept };
          }
        ),
      },
      academicYears: {
        create: vi.fn(
          async (data: { label: string; start_date: string; end_date: string }) => {
            const newYear = { id: `year-${Date.now()}`, ...data };
            state.academicYears.push(newYear);
            state.prerequisites.academic_years_count = state.academicYears.length;
            return { data: newYear };
          }
        ),
      },
    },
  };
}

describe("End-to-End Setup Wizard Happy Path", () => {
  it("executes the four-step flow and receives persisted defaults without saving a signup policy", async () => {
    const state: MockSetupState = {
      completed_at: null,
      is_completed: false,
      steps: {
        institution_profile: { is_completed: false, completed_at: null, settings_exist: false, values: null },
        calendar_basics: { is_completed: false, completed_at: null, settings_exist: false, values: null },
        signup_policy: { is_completed: false, completed_at: null, settings_exist: false, values: null },
      },
      prerequisites: {
        streams_count: 0,
        departments_count: 0,
        academic_years_count: 0,
      },
      streams: [],
      departments: [],
      academicYears: [],
    };

    const client = createMockApiClient(state);

    // Initial status check
    const initialStatus = await client.setup.getStatus();
    expect(initialStatus.data.is_completed).toBe(false);
    expect(isFinishEnabled(initialStatus.data)).toBe(false);
    expect(deriveSetupProgress(initialStatus.data).percentage).toBe(0);
    expect(initialStatus.data.steps.signup_policy.values).toBeNull();
    expect(initialStatus.data.steps.signup_policy.settings_exist).toBe(false);

    // Initial progression derives step 1 "institution_profile"
    const step1 = deriveCurrentStep(initialStatus.data);
    expect(step1).toBe("institution_profile");
    const initialStates = deriveStepStates(initialStatus.data, step1);
    expect(initialStates.institution_profile).toBe("current");
    expect(initialStates.organisation_basics).toBe("not_started");
    expect(initialStates.calendar_basics).toBe("not_started");
    expect(initialStates.review_finish).toBe("not_started");

    // 1. Save Institution Profile (Step 1)
    await client.setup.saveStep("institution_profile", {
      name: "Apex University of Engineering",
      short_code: "AUE",
      contact_email: "admin@apex.edu",
      contact_phone: "+91 9876543210",
      city: "Kochi",
      state: "Kerala", // Note: mock server payload data only, not hardcoded in UI component
    });

    // Step now derives step 2 "organisation_basics"
    const afterProfileStatus = await client.setup.getStatus();
    expect(deriveCurrentStep(afterProfileStatus.data)).toBe("organisation_basics");
    expect(deriveSetupProgress(afterProfileStatus.data).percentage).toBe(33);

    // 2. Organisation Basics (Step 2 Domain Endpoints)
    const streamRes = await client.organisation.streams.create({
      code: "ENG",
      name: "Faculty of Engineering",
    });
    expect(state.prerequisites.streams_count).toBe(1);

    await client.organisation.departments.create({
      stream_id: streamRes.data.id,
      code: "CSE",
      name: "Computer Science & Engineering",
      kind: "academic",
    });
    expect(state.prerequisites.departments_count).toBe(1);

    await client.organisation.academicYears.create({
      label: "2026-2027",
      start_date: "2026-06-01",
      end_date: "2027-05-31",
    });
    expect(state.prerequisites.academic_years_count).toBe(1);

    // After org basics, step derives calendar_basics
    const afterOrgStatus = await client.setup.getStatus();
    expect(deriveCurrentStep(afterOrgStatus.data)).toBe("calendar_basics");
    expect(deriveSetupProgress(afterOrgStatus.data).percentage).toBe(67);

    // 3. Save Calendar Basics (Step 3)
    await client.setup.saveStep("calendar_basics", {
      working_days: ["monday", "tuesday", "wednesday", "thursday", "friday"],
      periods_per_day: 4,
      periods: [
        { index: 1, start: "09:00", end: "10:00" },
        { index: 2, start: "10:15", end: "11:15" },
        { index: 3, start: "11:30", end: "12:30" },
        { index: 4, start: "13:30", end: "14:30" },
      ],
      day_order_format: "roman",
    });

    // Calendar proceeds directly to Review and Finish (Step 4).
    const afterCalStatus = await client.setup.getStatus();
    expect(deriveCurrentStep(afterCalStatus.data)).toBe("review_finish");
    expect(deriveSetupProgress(afterCalStatus.data)).toMatchObject({ percentage: 100, completionState: "ready_to_finalize" });
    expect(afterCalStatus.data.steps.signup_policy.values).toBeNull();
    expect(afterCalStatus.data.steps.signup_policy.settings_exist).toBe(false);

    // 4. Review and Finish
    const updatedStatus = await client.setup.getStatus();
    const finalStep = deriveCurrentStep(updatedStatus.data);
    expect(finalStep).toBe("review_finish");

    const finalStates = deriveStepStates(updatedStatus.data, finalStep);
    expect(finalStates.institution_profile).toBe("saved");
    expect(finalStates.organisation_basics).toBe("saved");
    expect(finalStates.calendar_basics).toBe("saved");
    expect(finalStates.review_finish).toBe("current");

    const checklist = getPrerequisiteChecklist(updatedStatus.data);
    expect(checklist).toHaveLength(5);
    expect(checklist.every((item) => item.satisfied)).toBe(true);
    expect(isFinishEnabled(updatedStatus.data)).toBe(true);

    // Call Complete
    const completeRes = await client.setup.complete();
    expect(completeRes.data.is_completed).toBe(true);
    expect(completeRes.data.completed_at).not.toBeNull();
    expect(completeRes.data.steps.signup_policy.values).toEqual(DEFAULT_REGISTRATION_PREFERENCES);
    expect(completeRes.data.steps.signup_policy.settings_exist).toBe(true);
    expect(deriveSetupProgress(completeRes.data).completionState).toBe("completed");
    expect(client.setup.saveStep.mock.calls.map(([step]) => step)).toEqual(["institution_profile", "calendar_basics"]);

    // Verify 409 handling if complete is called again
    try {
      await client.setup.complete();
      expect.fail("Should have thrown 409 conflict error");
    } catch (err: unknown) {
      expect(isSetupAlreadyCompletedError(err)).toBe(true);
    }
  });

  it("fails completion with 422 if prerequisites are missing", async () => {
    const state: MockSetupState = {
      completed_at: null,
      is_completed: false,
      steps: {
        institution_profile: { is_completed: true, completed_at: "2026-11-05", settings_exist: true, values: {} },
        calendar_basics: { is_completed: true, completed_at: "2026-11-05", settings_exist: true, values: {} },
        signup_policy: { is_completed: false, completed_at: null, settings_exist: false, values: null },
      },
      prerequisites: {
        streams_count: 0,
        departments_count: 0,
        academic_years_count: 0,
      },
      streams: [],
      departments: [],
      academicYears: [],
    };

    const client = createMockApiClient(state);

    try {
      await client.setup.complete();
      expect.fail("Should have thrown 422 error");
    } catch (err: unknown) {
      const error = err as { status: number; errors: { missing: string[] } };
      expect(error.status).toBe(422);
      expect(error.errors.missing).toEqual(["streams", "departments", "academic_years"]);
    }
  });
});

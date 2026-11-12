import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiError } from "@academic-suite/api-client";
import SetupWizardPage from "../src/app/setup/page";
import type { SetupStatusData, StepId } from "../src/app/setup/logic/step-derivation";
import type {
  StreamItem,
  DepartmentItem,
  AcademicYearItem,
} from "../src/app/setup/components/OrganisationBasicsStep";

const mocks = vi.hoisted(() => ({
  requestedStep: "review_finish",
  router: { push: vi.fn() },
  toast: { success: vi.fn(), info: vi.fn(), error: vi.fn() },
  client: {
    setup: { status: vi.fn(), complete: vi.fn(), saveStep: vi.fn() },
    organisation: {
      streams: { list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
      departments: { list: vi.fn(), create: vi.fn(), delete: vi.fn() },
      academicYears: { list: vi.fn(), create: vi.fn() },
    },
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => mocks.router,
  useSearchParams: () => {
    const [search, setSearch] = React.useState(window.location.search);
    React.useEffect(() => {
      const updateSearch = () => setSearch(window.location.search);
      window.addEventListener("popstate", updateSearch);
      window.addEventListener("test-next-history-change", updateSearch);
      return () => {
        window.removeEventListener("popstate", updateSearch);
        window.removeEventListener("test-next-history-change", updateSearch);
      };
    }, []);
    return new URLSearchParams(search);
  },
}));
vi.mock("@/lib/auth/auth-guard", () => ({
  AuthGuard: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/lib/auth/session-provider", () => ({
  useApiClient: () => mocks.client,
}));
vi.mock("sonner", () => ({ toast: mocks.toast }));

function createStatus(overrides: Partial<SetupStatusData> = {}): SetupStatusData {
  const savedStep = {
    is_completed: true,
    completed_at: "2026-11-01T09:00:00Z",
    settings_exist: true,
  };
  return {
    completed_at: null,
    is_completed: false,
    steps: {
      institution_profile: {
        ...savedStep,
        values: { name: "Test College", short_code: "TC" },
      },
      calendar_basics: {
        ...savedStep,
        values: {
          working_days: ["monday"],
          periods_per_day: 1,
          periods: [{ index: 1, start: "09:00", end: "10:00" }],
          day_order_format: "roman",
        },
      },
      signup_policy: {
        ...savedStep,
        values: {
          student_self_registration_enabled: false,
          parent_self_registration_enabled: false,
          approval_mode: "manual",
        },
      },
    },
    prerequisites: { streams_count: 1, departments_count: 1, academic_years_count: 1 },
    ...overrides,
  };
}

function createCompletedStatus(): SetupStatusData {
  const status = createStatus({
    completed_at: "2026-11-11T12:34:56Z",
    is_completed: true,
    prerequisites: { streams_count: 2, departments_count: 3, academic_years_count: 4 },
  });
  status.steps.institution_profile.values = { name: "Updated College", short_code: "UC" };
  return status;
}

function alreadyCompletedError() {
  return new ApiError({
    status: 409,
    type: "https://errors.campuslynk.net/setup-already-completed",
    title: "Conflict",
    detail: "First-run setup has already been completed.",
  });
}

function deferred<T>() {
  let resolve: (value: T) => void = () => { throw new Error("Promise not initialized"); };
  let reject: (reason: unknown) => void = () => { throw new Error("Promise not initialized"); };
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const organisationCases = [
  { key: "streams", title: "1. Streams", label: "Streams", row: "Government Aided", freshRow: "Updated Stream" },
  { key: "departments", title: "2. Departments", label: "Departments", row: "Computer Science", freshRow: "Updated Department" },
  { key: "academicYears", title: "3. Academic Years", label: "Academic Years", row: "2026-2027", freshRow: "2027-2028" },
] as const;

const initialRows = {
  streams: [{ id: "s1", code: "AIDED", name: "Government Aided", departments_count: 1 }],
  departments: [{
    id: "d1", code: "CSE", name: "Computer Science", stream_id: "s1", kind: "academic",
    stream: { id: "s1", name: "Government Aided", code: "AIDED" },
  }],
  academicYears: [{ id: "y1", label: "2026-2027", start_date: "2026-06-01", end_date: "2027-03-31", is_current: true }],
} satisfies { streams: StreamItem[]; departments: DepartmentItem[]; academicYears: AcademicYearItem[] };

const updatedRows = {
  streams: [{ ...initialRows.streams[0], name: "Updated Stream" }],
  departments: [{ ...initialRows.departments[0], name: "Updated Department" }],
  academicYears: [{ ...initialRows.academicYears[0], label: "2027-2028" }],
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  mocks.requestedStep = "review_finish";
  mocks.client.setup.status.mockResolvedValue({ data: createStatus() });
  mocks.client.setup.complete.mockResolvedValue({ data: createCompletedStatus() });
  mocks.client.setup.saveStep.mockImplementation(async (step: keyof SetupStatusData["steps"], values: Record<string, unknown>) => {
    const status = createStatus();
    status.steps[step].values = values;
    return { data: status };
  });
  for (const { key } of organisationCases) {
    mocks.client.organisation[key].list.mockResolvedValue({ data: initialRows[key] });
  }
  mocks.client.organisation.streams.update.mockResolvedValue({ data: updatedRows.streams[0] });
  mocks.client.organisation.streams.create.mockResolvedValue({ data: initialRows.streams[0] });
  mocks.client.organisation.streams.delete.mockResolvedValue(undefined);
  mocks.client.organisation.departments.create.mockResolvedValue({ data: initialRows.departments[0] });
  mocks.client.organisation.departments.delete.mockResolvedValue(undefined);
  mocks.client.organisation.academicYears.create.mockResolvedValue({ data: initialRows.academicYears[0] });

  const nativePush = window.history.pushState.bind(window.history);
  const nativeReplace = window.history.replaceState.bind(window.history);
  vi.spyOn(window.history, "pushState").mockImplementation((data, unused, url) => {
    nativePush({ ...window.history.state, ...data }, unused, url);
    window.dispatchEvent(new Event("test-next-history-change"));
  });
  vi.spyOn(window.history, "replaceState").mockImplementation((data, unused, url) => {
    nativeReplace(data, unused, url);
    if (url) window.dispatchEvent(new Event("test-next-history-change"));
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderWizardPage() {
  const query = mocks.requestedStep ? `?step=${mocks.requestedStep}` : "";
  window.history.replaceState({ __NA: true }, "", `/setup${query}`);
  return render(<SetupWizardPage />);
}

async function renderReview() {
  renderWizardPage();
  return screen.findByRole("button", { name: "Complete First-Run Setup" });
}

describe("Setup completion conflicts and completed navigation", () => {
  it("refetches status before opening an already-completed summary", async () => {
    const user = userEvent.setup();
    const refreshed = deferred<{ data: SetupStatusData }>();
    mocks.client.setup.status
      .mockResolvedValueOnce({ data: createStatus() })
      .mockReturnValueOnce(refreshed.promise);
    mocks.client.setup.complete.mockRejectedValueOnce(alreadyCompletedError());

    await user.click(await renderReview());

    expect(mocks.client.setup.status).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("heading", { name: "First-Run Setup Completed" })).not.toBeInTheDocument();
    expect(mocks.toast.info).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Finalizing Setup..." })).toBeDisabled();

    const completedStatus = createCompletedStatus();
    await act(async () => { refreshed.resolve({ data: completedStatus }); });

    expect(await screen.findByRole("heading", { name: "First-Run Setup Completed" })).toBeInTheDocument();
    expect(screen.getByText("Updated College")).toBeInTheDocument();
    expect(screen.getByText(new Date(completedStatus.completed_at ?? "").toLocaleString())).toBeInTheDocument();
    expect(mocks.toast.info).toHaveBeenCalledWith("Setup was already finalized.");
  });

  it.each(["about:blank", "https://errors.example.test/other-conflict"])(
    "shows a retryable error for an unrelated 409 (%s)",
    async (type) => {
      const user = userEvent.setup();
      mocks.client.setup.complete.mockRejectedValueOnce(new ApiError({
        status: 409,
        type,
        title: "Conflict",
        detail: "Setup could not be finalized because of a conflict.",
      }));

      await user.click(await renderReview());

      expect(await screen.findByText("Setup could not be finalized because of a conflict.")).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "First-Run Setup Completed" })).not.toBeInTheDocument();
      expect(mocks.client.setup.status).toHaveBeenCalledTimes(1);

      await user.click(screen.getByRole("button", { name: "Retry Finalization" }));

      expect(await screen.findByRole("heading", { name: "First-Run Setup Completed" })).toBeInTheDocument();
      expect(mocks.client.setup.complete).toHaveBeenCalledTimes(2);
      expect(mocks.client.setup.status).toHaveBeenCalledTimes(1);
    }
  );

  it("provides an error and retry even when a conflict has an empty detail", async () => {
    const user = userEvent.setup();
    mocks.client.setup.complete.mockRejectedValueOnce(new ApiError({
      status: 409,
      type: "about:blank",
      title: "Conflict",
      detail: "",
    }));

    await user.click(await renderReview());

    expect(await screen.findByText("Setup could not be finalized because of a conflict. Please retry.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry Finalization" })).toBeEnabled();
    expect(screen.queryByRole("heading", { name: "First-Run Setup Completed" })).not.toBeInTheDocument();
  });

  it("keeps the review open after a failed status refresh and retries only the GET", async () => {
    const user = userEvent.setup();
    mocks.client.setup.status
      .mockResolvedValueOnce({ data: createStatus() })
      .mockRejectedValueOnce(new Error("Could not refresh completed setup status."))
      .mockResolvedValueOnce({ data: createCompletedStatus() });
    mocks.client.setup.complete.mockRejectedValueOnce(alreadyCompletedError());

    await user.click(await renderReview());

    expect(await screen.findByText("Could not refresh completed setup status.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "First-Run Setup Completed" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry Finalization" }));

    expect(await screen.findByRole("heading", { name: "First-Run Setup Completed" })).toBeInTheDocument();
    expect(screen.getByText("Updated College")).toBeInTheDocument();
    expect(mocks.client.setup.complete).toHaveBeenCalledTimes(1);
    expect(mocks.client.setup.status).toHaveBeenCalledTimes(3);
  });

  it("does not open a completed summary when refreshed status cannot confirm completion", async () => {
    const user = userEvent.setup();
    mocks.client.setup.complete.mockRejectedValueOnce(alreadyCompletedError());

    await user.click(await renderReview());

    expect(mocks.client.setup.status).toHaveBeenCalledTimes(2);
    expect(await screen.findByText("Setup completion could not be confirmed. Please retry.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "First-Run Setup Completed" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry Finalization" })).toBeEnabled();
  });

  it("takes Go to Portal Home to the authenticated /home route", async () => {
    const user = userEvent.setup();
    mocks.requestedStep = "";
    mocks.client.setup.status.mockResolvedValue({ data: createCompletedStatus() });
    renderWizardPage();

    await screen.findByRole("heading", { name: "First-Run Setup Completed" });
    await user.click(screen.getByRole("button", { name: "Go to Portal Home" }));

    expect(mocks.router.push).toHaveBeenCalledWith("/home");
    expect(mocks.router.push).not.toHaveBeenCalledWith("/");
  });
});

describe("Independent organisation collection loading", () => {
  it.each(organisationCases)(
    "shows $label failures instead of an empty table, with an independent retry",
    async (failed) => {
      const user = userEvent.setup();
      mocks.requestedStep = "organisation_basics";
      const errorMessage = `Could not load ${failed.label}.`;
      mocks.client.organisation[failed.key].list.mockRejectedValueOnce(new Error(errorMessage));
      renderWizardPage();

      const failedSection = await screen.findByRole("region", { name: failed.title });
      expect(await within(failedSection).findByText(errorMessage)).toBeInTheDocument();
      expect(within(failedSection).queryByRole("table")).not.toBeInTheDocument();
      expect(within(failedSection).queryByText(/No .* created yet/)).not.toBeInTheDocument();
      expect(screen.getByText("Unable to Verify")).toBeInTheDocument();
      expect(screen.getByText("Unavailable")).toBeInTheDocument();
      if (failed.key === "streams") {
        expect(screen.getByRole("button", { name: "Add Department" })).toBeDisabled();
      }
      for (const successful of organisationCases.filter(({ key }) => key !== failed.key)) {
        const section = screen.getByRole("region", { name: successful.title });
        expect(await within(section).findByText(successful.row)).toBeInTheDocument();
      }

      await user.click(within(failedSection).getByRole("button", { name: `Retry ${failed.label}` }));

      expect(await within(failedSection).findByText(failed.row)).toBeInTheDocument();
      expect(within(failedSection).queryByRole("alert")).not.toBeInTheDocument();
      expect(screen.getByText("Prerequisites Met")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Add Department" })).toBeEnabled();
      expect(mocks.client.organisation[failed.key].list).toHaveBeenCalledTimes(2);
      for (const { key } of organisationCases.filter(({ key }) => key !== failed.key)) {
        expect(mocks.client.organisation[key].list).toHaveBeenCalledTimes(1);
      }
      expect(mocks.client.setup.status).toHaveBeenCalledTimes(1);
    }
  );

  it.each(organisationCases)(
    "keeps $label loading independently while the other sections render",
    async (loading) => {
      mocks.requestedStep = "organisation_basics";
      const pending = deferred<{ data: Array<StreamItem | DepartmentItem | AcademicYearItem> }>();
      mocks.client.organisation[loading.key].list.mockReturnValueOnce(pending.promise);
      renderWizardPage();

      const loadingSection = await screen.findByRole("region", { name: loading.title });
      expect(within(loadingSection).getByRole("status")).toHaveTextContent(`Loading ${loading.label}...`);
      expect(within(loadingSection).queryByRole("table")).not.toBeInTheDocument();
      expect(within(loadingSection).queryByText(/No .* created yet/)).not.toBeInTheDocument();
      expect(loadingSection).toHaveAttribute("aria-busy", "true");
      expect(screen.getByText("Loading Prerequisites")).toBeInTheDocument();
      if (loading.key === "streams") {
        expect(screen.getByRole("button", { name: "Add Department" })).toBeDisabled();
      }
      for (const successful of organisationCases.filter(({ key }) => key !== loading.key)) {
        const section = screen.getByRole("region", { name: successful.title });
        expect(await within(section).findByText(successful.row)).toBeInTheDocument();
      }

      await act(async () => { pending.resolve({ data: initialRows[loading.key] }); });

      expect(await within(loadingSection).findByText(loading.row)).toBeInTheDocument();
      expect(within(loadingSection).queryByRole("status")).not.toBeInTheDocument();
      expect(loadingSection).toHaveAttribute("aria-busy", "false");
      expect(screen.getByRole("button", { name: "Add Department" })).toBeEnabled();
    }
  );

  it.each(organisationCases)(
    "hides stale $label data after a failed refresh while the other tables update",
    async (failed) => {
      const user = userEvent.setup();
      mocks.requestedStep = "organisation_basics";
      for (const { key } of organisationCases) {
        mocks.client.organisation[key].list
          .mockResolvedValueOnce({ data: initialRows[key] })
          .mockResolvedValue({ data: updatedRows[key] });
      }
      const errorMessage = `Could not refresh ${failed.label}.`;
      mocks.client.organisation[failed.key].list.mockRejectedValueOnce(new Error(errorMessage));
      renderWizardPage();

      const streamsSection = await screen.findByRole("region", { name: "1. Streams" });
      await within(streamsSection).findByText("Government Aided");
      await user.click(within(streamsSection).getByRole("button", { name: "Rename" }));
      const renameInput = screen.getByLabelText("Stream Name");
      await user.clear(renameInput);
      await user.type(renameInput, "Updated Stream");
      await user.click(screen.getByRole("button", { name: "Save Changes" }));

      const failedSection = screen.getByRole("region", { name: failed.title });
      expect(await within(failedSection).findByText(errorMessage)).toBeInTheDocument();
      expect(within(failedSection).queryByRole("table")).not.toBeInTheDocument();
      expect(within(failedSection).queryByText(failed.row)).not.toBeInTheDocument();
      expect(within(failedSection).queryByText(/No .* created yet/)).not.toBeInTheDocument();
      for (const successful of organisationCases.filter(({ key }) => key !== failed.key)) {
        const section = screen.getByRole("region", { name: successful.title });
        expect(await within(section).findByText(successful.freshRow)).toBeInTheDocument();
        expect(within(section).queryByText(successful.row)).not.toBeInTheDocument();
      }

      await user.click(within(failedSection).getByRole("button", { name: `Retry ${failed.label}` }));

      expect(await within(failedSection).findByText(failed.freshRow)).toBeInTheDocument();
      expect(mocks.client.organisation[failed.key].list).toHaveBeenCalledTimes(3);
      for (const { key } of organisationCases.filter(({ key }) => key !== failed.key)) {
        expect(mocks.client.organisation[key].list).toHaveBeenCalledTimes(2);
      }
    }
  );

  it.each(["success", "failure"])(
    "ignores an older department request's %s after a newer refresh succeeds",
    async (result) => {
      const user = userEvent.setup();
      mocks.requestedStep = "organisation_basics";
      const pending = deferred<{ data: DepartmentItem[] }>();
      for (const { key } of organisationCases) {
        mocks.client.organisation[key].list
          .mockResolvedValueOnce({ data: initialRows[key] })
          .mockResolvedValue({ data: updatedRows[key] });
      }
      mocks.client.organisation.departments.list
        .mockReset()
        .mockReturnValueOnce(pending.promise)
        .mockResolvedValue({ data: updatedRows.departments });
      renderWizardPage();

      const streamsSection = await screen.findByRole("region", { name: "1. Streams" });
      await within(streamsSection).findByText("Government Aided");
      await user.click(within(streamsSection).getByRole("button", { name: "Rename" }));
      const renameInput = screen.getByLabelText("Stream Name");
      await user.clear(renameInput);
      await user.type(renameInput, "Updated Stream");
      await user.click(screen.getByRole("button", { name: "Save Changes" }));

      const departmentsSection = screen.getByRole("region", { name: "2. Departments" });
      expect(await within(departmentsSection).findByText("Updated Department")).toBeInTheDocument();

      await act(async () => {
        if (result === "success") pending.resolve({ data: initialRows.departments });
        else pending.reject(new Error("The older department request failed."));
      });

      expect(within(departmentsSection).getByText("Updated Department")).toBeInTheDocument();
      expect(within(departmentsSection).queryByText("Computer Science")).not.toBeInTheDocument();
      expect(within(departmentsSection).queryByRole("alert")).not.toBeInTheDocument();
      expect(within(departmentsSection).queryByRole("status")).not.toBeInTheDocument();
      expect(mocks.client.organisation.departments.list).toHaveBeenCalledTimes(2);
    }
  );

  it("shows genuine empty states only after successful empty list responses", async () => {
    mocks.requestedStep = "organisation_basics";
    mocks.client.setup.status.mockResolvedValue({
      data: createStatus({ prerequisites: { streams_count: 0, departments_count: 0, academic_years_count: 0 } }),
    });
    for (const { key } of organisationCases) {
      mocks.client.organisation[key].list.mockResolvedValue({ data: [] });
    }
    renderWizardPage();

    for (const { title } of organisationCases) {
      const section = await screen.findByRole("region", { name: title });
      expect(await within(section).findByText(/No .* created yet/)).toBeInTheDocument();
      expect(within(section).queryByRole("alert")).not.toBeInTheDocument();
      expect(within(section).queryByRole("status")).not.toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "Add Department" })).toBeDisabled();
  });
});

const stepHeadings: Record<StepId, string> = {
  institution_profile: "Institution Profile",
  organisation_basics: "Organisation Basics",
  calendar_basics: "Academic Calendar Basics",
  signup_policy: "Sign-up & Registration Policy",
  review_finish: "Review Configuration & Finalize Setup",
};
const sidebarTitles: Record<StepId, string> = {
  institution_profile: "Institution Profile",
  organisation_basics: "Organisation Basics",
  calendar_basics: "Academic Calendar",
  signup_policy: "Sign-up Policy",
  review_finish: "Review and Finish",
};
const saveableSteps = [
  {
    step: "institution_profile", next: "organisation_basics", errorField: "name",
    expected: { name: "Edited College" },
    edit: () => fireEvent.change(screen.getByLabelText(/^Institution Name/), { target: { value: "Edited College" } }),
  },
  {
    step: "calendar_basics", next: "signup_policy", errorField: "working_days",
    expected: { working_days: ["monday", "tuesday"] },
    edit: () => fireEvent.click(screen.getByRole("button", { name: "tuesday" })),
  },
  {
    step: "signup_policy", next: "review_finish", errorField: "approval_mode",
    expected: { approval_mode: "auto" },
    edit: () => fireEvent.click(screen.getByRole("button", { name: /^Automatic Provisioning/ })),
  },
] as const;

function sidebarButtons() {
  const sidebar = document.querySelector<HTMLElement>('nav[aria-label="First-Run Setup Progress"]');
  if (!sidebar) throw new Error("Setup stepper not found");
  return within(sidebar).getAllByRole("button", { hidden: true });
}

function wizardFooterButton(name: string | RegExp) {
  return screen.getByRole("button", { name, hidden: true });
}

function sidebarStepButton(step: StepId) {
  const nav = screen.getByRole("navigation", { name: "First-Run Setup Progress" });
  return within(nav).getByRole("button", { name: new RegExp(sidebarTitles[step]) });
}

function documentExitEvent() {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event;
}

describe("Save & Continue page integration", () => {
  it.each(saveableSteps)("continues from unchanged $step without a save request", async ({ step, next }) => {
    const user = userEvent.setup();
    mocks.requestedStep = step;
    renderWizardPage();
    await screen.findByRole("heading", { name: stepHeadings[step] });

    expect(screen.queryByText("Unsaved edits")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("heading", { name: stepHeadings[next] })).toBeInTheDocument();
    expect(new URLSearchParams(window.location.search).get("step")).toBe(next);
    expect(mocks.client.setup.saveStep).not.toHaveBeenCalled();
  });

  it.each(saveableSteps)("locks navigation until $step is saved, then advances exactly once", async (testCase) => {
    const user = userEvent.setup();
    const pending = deferred<{ data: SetupStatusData }>();
    mocks.requestedStep = testCase.step;
    mocks.client.setup.saveStep.mockReturnValueOnce(pending.promise);
    renderWizardPage();
    await screen.findByRole("heading", { name: stepHeadings[testCase.step] });
    testCase.edit();

    await user.click(screen.getByRole("button", { name: "Save & Continue" }));
    expect(mocks.client.setup.saveStep).toHaveBeenCalledWith(testCase.step, expect.objectContaining(testCase.expected));
    for (const button of sidebarButtons()) expect(button).toBeDisabled();
    expect(screen.getByRole("button", { name: "Saving..." })).toBeDisabled();
    const back = screen.queryByRole("button", { name: /Back to/ });
    if (back) expect(back).toBeDisabled();
    expect(documentExitEvent().defaultPrevented).toBe(true);

    const form = screen.getByRole("button", { name: "Saving..." }).closest("form");
    if (!form) throw new Error("Active step form not found");
    fireEvent.submit(form);
    await user.click(sidebarButtons()[0]!);
    expect(mocks.client.setup.saveStep).toHaveBeenCalledOnce();
    expect(new URLSearchParams(window.location.search).get("step")).toBe(testCase.step);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(window.scrollTo).not.toHaveBeenCalled();

    const saved = createStatus();
    saved.steps[testCase.step].values = mocks.client.setup.saveStep.mock.calls[0]![1];
    await act(async () => { pending.resolve({ data: saved }); });

    expect(await screen.findByRole("heading", { name: stepHeadings[testCase.next] })).toBeInTheDocument();
    expect(new URLSearchParams(window.location.search).get("step")).toBe(testCase.next);
    expect(mocks.client.setup.saveStep).toHaveBeenCalledOnce();
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "auto" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    for (const button of sidebarButtons()) expect(button).toBeEnabled();
    expect(documentExitEvent().defaultPrevented).toBe(false);
  });

  it.each(saveableSteps)("keeps $step dirty on validation errors and advances only after a successful retry", async (testCase) => {
    const user = userEvent.setup();
    const message = `Server rejected ${testCase.errorField}.`;
    mocks.requestedStep = testCase.step;
    mocks.client.setup.saveStep.mockRejectedValueOnce(new ApiError({
      status: 422, title: "Validation Error", type: "about:blank",
      errors: { [testCase.errorField]: [message] },
    }));
    renderWizardPage();
    await screen.findByRole("heading", { name: stepHeadings[testCase.step] });
    testCase.edit();
    await user.click(screen.getByRole("button", { name: "Save & Continue" }));

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: stepHeadings[testCase.step] })).toBeInTheDocument();
    expect(new URLSearchParams(window.location.search).get("step")).toBe(testCase.step);
    expect(screen.getByText("Unsaved edits")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save & Continue" })).toBeEnabled();
    for (const button of sidebarButtons()) expect(button).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Save & Continue" }));
    expect(await screen.findByRole("heading", { name: stepHeadings[testCase.next] })).toBeInTheDocument();
    expect(mocks.client.setup.saveStep).toHaveBeenCalledTimes(2);
    expect(mocks.client.setup.saveStep.mock.calls[1]![1]).toEqual(expect.objectContaining(testCase.expected));
  });

  it.each(saveableSteps)("stays on $step and displays a general error when its save fails", async (testCase) => {
    const user = userEvent.setup();
    mocks.requestedStep = testCase.step;
    mocks.client.setup.saveStep.mockRejectedValueOnce(new Error("Save could not reach the server."));
    renderWizardPage();
    await screen.findByRole("heading", { name: stepHeadings[testCase.step] });
    testCase.edit();
    await user.click(screen.getByRole("button", { name: "Save & Continue" }));

    expect(await screen.findByText("Save could not reach the server.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: stepHeadings[testCase.step] })).toBeInTheDocument();
    expect(new URLSearchParams(window.location.search).get("step")).toBe(testCase.step);
    expect(screen.getByRole("button", { name: "Save & Continue" })).toBeEnabled();
    expect(documentExitEvent().defaultPrevented).toBe(true);
  });

  it.each(saveableSteps)("retains Stay/Discard behavior for dirty $step and restores saved values on revisit", async (testCase) => {
    const user = userEvent.setup();
    mocks.requestedStep = testCase.step;
    renderWizardPage();
    await screen.findByRole("heading", { name: stepHeadings[testCase.step] });
    testCase.edit();
    const target = testCase.next;
    const targetButton = () => sidebarStepButton(target);

    await user.click(targetButton());
    expect(screen.getByRole("dialog", { name: "Unsaved Changes" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Stay on Step" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(new URLSearchParams(window.location.search).get("step")).toBe(testCase.step);
    expect(screen.getByRole("button", { name: "Save & Continue" })).toBeInTheDocument();

    await user.click(targetButton());
    await user.click(screen.getByRole("button", { name: "Discard & Leave" }));
    await screen.findByRole("heading", { name: stepHeadings[target] });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await user.click(sidebarStepButton(testCase.step));
    await screen.findByRole("heading", { name: stepHeadings[testCase.step] });
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
    expect(screen.queryByText("Unsaved edits")).not.toBeInTheDocument();
    expect(mocks.client.setup.saveStep).not.toHaveBeenCalled();
    if (testCase.step === "institution_profile") expect(screen.getByLabelText(/^Institution Name/)).toHaveValue("Test College");
    if (testCase.step === "calendar_basics") expect(screen.queryByText(/^Day II$/)).not.toBeInTheDocument();
    if (testCase.step === "signup_policy") {
      expect(screen.getByRole("button", { name: /^Manual Verification/ })).toHaveAttribute("aria-pressed", "true");
    }
  });

  it("keeps a dirty calendar mounted when browser Back is canceled, then guards Forward", async () => {
    const user = userEvent.setup();
    mocks.requestedStep = "organisation_basics";
    renderWizardPage();
    await screen.findByRole("heading", { name: stepHeadings.organisation_basics });
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("heading", { name: stepHeadings.calendar_basics });
    const start = screen.getByLabelText("Period 1 start time");
    fireEvent.change(start, { target: { value: "09:15" } });

    await act(async () => { window.history.back(); });
    await screen.findByRole("dialog", { name: "Unsaved Changes" });
    expect(new URLSearchParams(window.location.search).get("step")).toBe("calendar_basics");
    expect(screen.getByLabelText("Period 1 start time")).toBe(start);
    expect(start).toHaveValue("09:15");
    await user.click(screen.getByRole("button", { name: "Stay on Step" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await act(async () => { window.history.back(); });
    await screen.findByRole("dialog", { name: "Unsaved Changes" });
    await user.click(screen.getByRole("button", { name: "Discard & Leave" }));
    await screen.findByRole("heading", { name: stepHeadings.organisation_basics });
    const streamsSection = screen.getByRole("region", { name: "1. Streams" });
    await within(streamsSection).findByText("Government Aided");
    await user.click(within(streamsSection).getByRole("button", { name: "Rename" }));
    fireEvent.change(screen.getByLabelText("Stream Name"), { target: { value: "Unsaved rename" } });

    await act(async () => { window.history.forward(); });
    await screen.findByRole("dialog", { name: "Unsaved Changes" });
    expect(new URLSearchParams(window.location.search).get("step")).toBe("organisation_basics");
    await user.click(screen.getByRole("button", { name: "Discard & Leave" }));
    await screen.findByRole("heading", { name: stepHeadings.calendar_basics });
    expect(screen.getByLabelText("Period 1 start time")).toHaveValue("09:00");
    expect(mocks.client.setup.saveStep).not.toHaveBeenCalled();
    expect(mocks.client.organisation.streams.update).not.toHaveBeenCalled();
  });

  it("uses first-unmet resume without rewriting the URL and requires a first save for defaults", async () => {
    mocks.requestedStep = "";
    const status = createStatus();
    status.steps.calendar_basics = { is_completed: false, completed_at: null, settings_exist: false };
    mocks.client.setup.status.mockResolvedValue({ data: status });
    renderWizardPage();

    expect(await screen.findByRole("heading", { name: stepHeadings.calendar_basics })).toBeInTheDocument();
    expect(window.location.search).toBe("");
    expect(screen.getByRole("button", { name: "Save & Continue" })).toBeInTheDocument();
    expect(mocks.client.setup.saveStep).not.toHaveBeenCalled();
  });

  it.each(Object.keys(stepHeadings) as StepId[])("preserves explicit ?step=%s resume", async (step) => {
    mocks.requestedStep = step;
    renderWizardPage();
    expect(await screen.findByRole("heading", { name: stepHeadings[step] })).toBeInTheDocument();
    expect(new URLSearchParams(window.location.search).get("step")).toBe(step);
  });

  it("keeps a Back-selected resume target when the initial status GET finishes later", async () => {
    const pending = deferred<{ data: SetupStatusData }>();
    mocks.requestedStep = "calendar_basics";
    mocks.client.setup.status.mockReturnValueOnce(pending.promise);
    window.history.replaceState({ __NA: true }, "", "/setup?step=institution_profile");
    window.history.pushState({ __NA: true }, "", "/setup?step=calendar_basics");
    renderWizardPage();

    await act(async () => { window.history.back(); });
    await waitFor(() => expect(new URLSearchParams(window.location.search).get("step")).toBe("institution_profile"));
    await act(async () => { pending.resolve({ data: createStatus() }); });
    expect(await screen.findByRole("heading", { name: stepHeadings.institution_profile })).toBeInTheDocument();
    expect(new URLSearchParams(window.location.search).get("step")).toBe("institution_profile");
  });

  it("shows all prerequisites ready as 100%, with finalization as a separate state", async () => {
    const user = userEvent.setup();
    const finish = await renderReview();
    expect(screen.getByRole("progressbar", { name: "Setup prerequisite progress" })).toHaveAttribute("aria-valuenow", "100");
    expect(screen.getByText("4 of 4 prerequisite steps (100%)")).toBeInTheDocument();
    expect(screen.queryByText(/80%/)).not.toBeInTheDocument();
    expect(screen.queryByText("Setup Complete")).not.toBeInTheDocument();

    await user.click(finish);
    await screen.findByRole("heading", { name: "First-Run Setup Completed" });
    expect(screen.getByText("Setup Complete")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Setup prerequisite progress" })).toHaveAttribute("aria-valuenow", "100");
  });

  it("locks the summary toggle, review edits, footer and sidebar while finalization status is refreshing", async () => {
    const user = userEvent.setup();
    const refreshed = deferred<{ data: SetupStatusData }>();
    mocks.client.setup.status.mockResolvedValueOnce({ data: createCompletedStatus() }).mockReturnValueOnce(refreshed.promise);
    mocks.client.setup.complete.mockRejectedValueOnce(alreadyCompletedError());
    await user.click(await renderReview());

    expect(screen.getByRole("button", { name: "View Read-only Summary" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Back to Sign-up Policy/ })).toBeDisabled();
    for (const button of screen.getAllByRole("button", { name: "Edit" })) expect(button).toBeDisabled();
    for (const button of sidebarButtons()) expect(button).toBeDisabled();
    await act(async () => { refreshed.resolve({ data: createCompletedStatus() }); });
    await screen.findByRole("heading", { name: "First-Run Setup Completed" });
    expect(screen.getByRole("button", { name: "Open Wizard Steps" })).toBeEnabled();
  });

  it("guards opening the summary from a dirty saved step and restores its persisted form on return", async () => {
    const user = userEvent.setup();
    mocks.requestedStep = "institution_profile";
    mocks.client.setup.status.mockResolvedValue({ data: createCompletedStatus() });
    renderWizardPage();
    await screen.findByRole("heading", { name: stepHeadings.institution_profile });
    fireEvent.change(screen.getByLabelText(/^Institution Name/), { target: { value: "Unsaved College" } });
    await user.click(screen.getByRole("button", { name: "View Read-only Summary" }));
    expect(screen.getByRole("dialog", { name: "Unsaved Changes" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Discard & Leave" }));
    await screen.findByRole("heading", { name: "First-Run Setup Completed" });
    await user.click(screen.getByRole("button", { name: "Open Wizard Steps" }));
    await screen.findByRole("heading", { name: stepHeadings.institution_profile });
    expect(screen.getByLabelText(/^Institution Name/)).toHaveValue("Updated College");
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
    expect(mocks.client.setup.saveStep).not.toHaveBeenCalled();
  });

  it("uses the returned persisted settings as the clean baseline when a saved step is revisited", async () => {
    const user = userEvent.setup();
    const saved = createStatus();
    saved.steps.institution_profile.values = { name: "Edited College", short_code: "TC" };
    mocks.requestedStep = "institution_profile";
    mocks.client.setup.saveStep.mockResolvedValueOnce({ data: saved });
    renderWizardPage();
    await screen.findByRole("heading", { name: stepHeadings.institution_profile });
    fireEvent.change(screen.getByLabelText(/^Institution Name/), { target: { value: " Edited College " } });
    await user.click(screen.getByRole("button", { name: "Save & Continue" }));
    await screen.findByRole("heading", { name: stepHeadings.organisation_basics });
    await user.click(sidebarStepButton("institution_profile"));
    await screen.findByRole("heading", { name: stepHeadings.institution_profile });
    expect(screen.getByLabelText(/^Institution Name/)).toHaveValue("Edited College");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(mocks.client.setup.saveStep).toHaveBeenCalledOnce();
  });

  it("displays backend calendar-level validation errors while retaining the dirty step", async () => {
    const user = userEvent.setup();
    mocks.requestedStep = "calendar_basics";
    const message = "The given data was invalid: Calendar settings were rejected.";
    mocks.client.setup.saveStep.mockRejectedValueOnce(new ApiError({
      status: 422, title: "Unprocessable Content", type: "about:blank", detail: message,
      errors: { calendar_basics: ["Calendar settings were rejected."] },
    }));
    renderWizardPage();
    await screen.findByRole("heading", { name: stepHeadings.calendar_basics });
    fireEvent.click(screen.getByRole("button", { name: "tuesday" }));
    await user.click(screen.getByRole("button", { name: "Save & Continue" }));
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: stepHeadings.calendar_basics })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save & Continue" })).toBeEnabled();
  });

  it("shows a fallback save error when the API problem has an empty detail", async () => {
    const user = userEvent.setup();
    mocks.requestedStep = "institution_profile";
    mocks.client.setup.saveStep.mockRejectedValueOnce(new ApiError({
      status: 500, title: "Error", type: "about:blank", detail: "",
    }));
    renderWizardPage();
    await screen.findByRole("heading", { name: stepHeadings.institution_profile });
    fireEvent.change(screen.getByLabelText(/^Institution Name/), { target: { value: "Edited College" } });
    await user.click(screen.getByRole("button", { name: "Save & Continue" }));
    expect(await screen.findByText("Failed to save institution profile.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save & Continue" })).toBeEnabled();
  });
});

const unassignedStream = { id: "s2", code: "EXTRA", name: "Unassigned Stream", departments_count: 0 };
const organisationMutationCases = [
  { operation: "stream creation", request: () => mocks.client.organisation.streams.create },
  { operation: "stream rename", request: () => mocks.client.organisation.streams.update },
  { operation: "stream deletion", request: () => mocks.client.organisation.streams.delete },
  { operation: "department creation", request: () => mocks.client.organisation.departments.create },
  { operation: "department deletion", request: () => mocks.client.organisation.departments.delete },
  { operation: "academic-year creation", request: () => mocks.client.organisation.academicYears.create },
] as const;

async function startOrganisationMutation(operation: typeof organisationMutationCases[number]["operation"], user: ReturnType<typeof userEvent.setup>) {
  if (operation === "stream creation") {
    await user.click(screen.getByRole("button", { name: "Add Stream" }));
    await user.click(screen.getByRole("button", { name: "Aided" }));
    await user.click(screen.getByRole("button", { name: "Create Stream" }));
  } else if (operation === "stream rename") {
    const region = screen.getByRole("region", { name: "1. Streams" });
    await user.click(within(region).getAllByRole("button", { name: "Rename" })[0]!);
    fireEvent.change(screen.getByLabelText("Stream Name"), { target: { value: "Updated Stream" } });
    await user.click(screen.getByRole("button", { name: "Save Changes" }));
  } else if (operation === "stream deletion") {
    const row = screen.getByRole("row", { name: /Unassigned Stream/ });
    await user.click(within(row).getByRole("button", { name: "Delete" }));
  } else if (operation === "department creation") {
    await user.click(screen.getByRole("button", { name: "Add Department" }));
    fireEvent.change(screen.getByLabelText("Department Code"), { target: { value: "CIV" } });
    fireEvent.change(screen.getByLabelText("Department Name"), { target: { value: "Civil Engineering" } });
    await user.click(screen.getByRole("button", { name: "Create Department" }));
  } else if (operation === "department deletion") {
    await user.click(screen.getByTitle("Delete department Computer Science"));
  } else {
    await user.click(screen.getByRole("button", { name: "Add Academic Year" }));
    fireEvent.change(screen.getByLabelText("Session Label"), { target: { value: "2027-2028" } });
    fireEvent.change(screen.getByLabelText("Start Date"), { target: { value: "2027-06-01" } });
    fireEvent.change(screen.getByLabelText("End Date"), { target: { value: "2028-03-31" } });
    await user.click(screen.getByRole("button", { name: "Create Academic Year" }));
  }
}

describe("Organisation immediate saves and wizard navigation lock", () => {
  it.each(organisationMutationCases)("blocks navigation through $operation and its collection refresh, then uses plain Continue", async (testCase) => {
    const user = userEvent.setup();
    const writing = deferred<unknown>();
    const refreshing = deferred<{ data: StreamItem[] }>();
    const streamRows = [...initialRows.streams, unassignedStream];
    mocks.requestedStep = "organisation_basics";
    const operation = testCase.request();
    operation.mockReturnValueOnce(writing.promise);
    mocks.client.organisation.streams.list.mockResolvedValueOnce({ data: streamRows }).mockReturnValueOnce(refreshing.promise);
    renderWizardPage();
    await screen.findByRole("heading", { name: stepHeadings.organisation_basics });
    await screen.findByRole("row", { name: /Unassigned Stream/ });
    await startOrganisationMutation(testCase.operation, user);

    expect(operation).toHaveBeenCalledOnce();
    expect(wizardFooterButton("Continue")).toBeDisabled();
    expect(wizardFooterButton(/Back to Profile/)).toBeDisabled();
    for (const button of sidebarButtons()) expect(button).toBeDisabled();
    expect(documentExitEvent().defaultPrevented).toBe(true);

    await act(async () => { writing.resolve(undefined); });
    await screen.findByText("Loading Streams...");
    expect(wizardFooterButton("Continue")).toBeDisabled();
    for (const button of sidebarButtons()) expect(button).toBeDisabled();
    await act(async () => { refreshing.resolve({ data: streamRows }); });
    await waitFor(() => expect(wizardFooterButton("Continue")).toBeEnabled());
    expect(mocks.client.setup.saveStep).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("heading", { name: stepHeadings.calendar_basics })).toBeInTheDocument();
    expect(mocks.client.setup.saveStep).not.toHaveBeenCalled();
  });

  it("keeps navigation locked until every concurrent organisation write has settled", async () => {
    const user = userEvent.setup();
    const streamDelete = deferred<unknown>();
    const departmentDelete = deferred<unknown>();
    mocks.requestedStep = "organisation_basics";
    mocks.client.organisation.streams.list.mockResolvedValue({ data: [...initialRows.streams, unassignedStream] });
    mocks.client.organisation.streams.delete.mockReturnValueOnce(streamDelete.promise);
    mocks.client.organisation.departments.delete.mockReturnValueOnce(departmentDelete.promise);
    renderWizardPage();
    await screen.findByRole("row", { name: /Unassigned Stream/ });
    await startOrganisationMutation("stream deletion", user);
    await startOrganisationMutation("department deletion", user);

    await act(async () => { streamDelete.resolve(undefined); });
    await waitFor(() => expect(mocks.client.setup.status).toHaveBeenCalledTimes(2));
    expect(wizardFooterButton("Continue")).toBeDisabled();
    for (const button of sidebarButtons()) expect(button).toBeDisabled();
    await act(async () => { departmentDelete.resolve(undefined); });
    await waitFor(() => expect(wizardFooterButton("Continue")).toBeEnabled());
    for (const button of sidebarButtons()) expect(button).toBeEnabled();
  });

  it("unlocks navigation after a failed record save while protecting the remaining dialog draft", async () => {
    const user = userEvent.setup();
    mocks.requestedStep = "organisation_basics";
    mocks.client.organisation.streams.create.mockRejectedValueOnce(new Error("Stream could not be saved."));
    renderWizardPage();
    await screen.findByRole("region", { name: "1. Streams" });
    expect(documentExitEvent().defaultPrevented).toBe(false);
    await startOrganisationMutation("stream creation", user);

    expect(mocks.toast.error).toHaveBeenCalledWith("Stream could not be saved.");
    expect(screen.getByRole("dialog", { name: "Create Institutional Stream" })).toBeInTheDocument();
    expect(wizardFooterButton("Continue")).toBeEnabled();
    for (const button of sidebarButtons()) expect(button).toBeEnabled();
    expect(documentExitEvent().defaultPrevented).toBe(true);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(documentExitEvent().defaultPrevented).toBe(false);
  });
});

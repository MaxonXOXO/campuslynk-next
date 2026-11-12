import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InstitutionProfileStep } from "../src/app/setup/components/InstitutionProfileStep";
import { CalendarStep } from "../src/app/setup/components/CalendarStep";
import { SignupPolicyStep } from "../src/app/setup/components/SignupPolicyStep";
import { OrganisationBasicsStep } from "../src/app/setup/components/OrganisationBasicsStep";
import type { CalendarFormValues } from "../src/app/setup/components/CalendarStep";
import type { InstitutionProfileFormValues, SignupPolicyFormValues } from "../src/app/setup/logic/validation";

afterEach(cleanup);

const profileFields = [
  { key: "name", label: /^Institution Name/, error: "Institution name is required." },
  { key: "short_code", label: /^Short Code/, error: "Short code is required." },
  { key: "board", label: "Board / Regulatory Authority", error: "Board / affiliation cannot exceed 255 characters." },
  { key: "board_code", label: "Board Code", error: "Board code cannot exceed 64 characters." },
  { key: "affiliation", label: "Affiliation Body", error: "Affiliation cannot exceed 255 characters." },
  { key: "affiliation_code", label: "Affiliation Code", error: "Affiliation code cannot exceed 64 characters." },
  { key: "contact_email", label: "Official Email", error: "Invalid contact email format." },
  { key: "contact_phone", label: "Contact Phone", error: "Contact phone cannot exceed 32 characters." },
  { key: "address_line1", label: "Address Line 1", error: "Address line 1 cannot exceed 255 characters." },
  { key: "address_line2", label: "Address Line 2", error: "Address line 2 cannot exceed 255 characters." },
  { key: "city", label: "City", error: "City cannot exceed 100 characters." },
  { key: "state", label: "State / Province", error: "State cannot exceed 100 characters." },
  { key: "postal_code", label: "Postal Code", error: "Postal code cannot exceed 20 characters." },
  { key: "website", label: "Website URL", error: "Website must be a valid URL starting with http:// or https://." },
] satisfies Array<{ key: keyof InstitutionProfileFormValues; label: string | RegExp; error: string }>;

describe("Institution profile inline validation", () => {
  it("renders and associates server errors for all 14 fields", () => {
    const serverErrors = Object.fromEntries(
      profileFields.map(({ key }) => [key, `Server rejected ${key}.`])
    );

    render(
      <InstitutionProfileStep
        serverErrors={serverErrors}
        onSave={vi.fn().mockResolvedValue(true)}
        onNext={vi.fn()}
      />
    );

    for (const { key, label } of profileFields) {
      const input = screen.getByLabelText(label);
      const error = screen.getByText(`Server rejected ${key}.`);
      expect(error).toHaveAttribute("role", "alert");
      expect(error.id).not.toBe("");
      expect(input).toHaveAttribute("aria-invalid", "true");
      expect(input).toHaveAttribute("aria-describedby", error.id);
      expect(input).toHaveAccessibleDescription(`Server rejected ${key}.`);
    }
  });

  it("shows all client validation failures inline and prevents saving", () => {
    const onSave = vi.fn().mockResolvedValue(true);
    render(
      <InstitutionProfileStep
        initialValues={{
          name: "",
          short_code: "",
          board: "B".repeat(256),
          board_code: "B".repeat(65),
          affiliation: "A".repeat(256),
          affiliation_code: "A".repeat(65),
          contact_email: "invalid-email",
          contact_phone: "1".repeat(33),
          address_line1: "A".repeat(256),
          address_line2: "B".repeat(256),
          city: "C".repeat(101),
          state: "S".repeat(101),
          postal_code: "1".repeat(21),
          website: "invalid-url",
        }}
        onSave={onSave}
        onNext={vi.fn()}
      />
    );

    // Exercise the submit handler directly, including its email validation.
    const form = screen.getByRole("button", { name: "Save & Continue" }).closest("form");
    if (!form) throw new Error("Profile form not found");
    fireEvent.submit(form);

    expect(onSave).not.toHaveBeenCalled();
    for (const { label, error } of profileFields) {
      const input = screen.getByLabelText(label);
      const message = screen.getByText(error);
      expect(input).toHaveAttribute("aria-invalid", "true");
      expect(input).toHaveAttribute("aria-describedby", message.id);
      expect(input).toHaveAccessibleDescription(error);
    }
  });

  it("removes stale error associations when server errors are cleared", () => {
    const props = {
      initialValues: { name: "Test College", short_code: "TC" },
      onSave: vi.fn().mockResolvedValue(true),
      onNext: vi.fn(),
    };
    const serverErrors = Object.fromEntries(
      profileFields.map(({ key }) => [key, `Server rejected ${key}.`])
    );
    const view = render(<InstitutionProfileStep {...props} serverErrors={serverErrors} />);

    view.rerender(<InstitutionProfileStep {...props} serverErrors={{}} />);

    for (const { label } of profileFields) {
      const input = screen.getByLabelText(label);
      expect(input).toHaveAttribute("aria-invalid", "false");
      expect(input).not.toHaveAttribute("aria-describedby");
    }
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("Calendar chronological row validation", () => {
  it.each([
    {
      scenario: "backwards non-overlapping periods",
      nextPeriod: { index: 2, start: "09:00", end: "10:00" },
      errorMessage: "Period 2 must start at or after Period 1 ends (12:00).",
    },
    {
      scenario: "overlapping periods",
      nextPeriod: { index: 2, start: "11:30", end: "12:30" },
      errorMessage: "Periods overlap: Period 1 (11:00–12:00) overlaps with Period 2 (11:30–12:30).",
    },
  ])("shows $scenario errors on the offending row and saves after correction", async ({ nextPeriod, errorMessage }) => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(true);
    render(
      <CalendarStep
        initialValues={{
          working_days: ["monday"],
          periods_per_day: 2,
          periods: [
            { index: 1, start: "11:00", end: "12:00" },
            nextPeriod,
          ],
          day_order_format: "roman",
        }}
        onSave={onSave}
        onNext={vi.fn()}
        onBack={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Save & Continue" }));

    expect(onSave).not.toHaveBeenCalled();
    const start = screen.getByRole("textbox", { name: "Period 2 start time" });
    const row = start.closest("tr");
    if (!row) throw new Error("Period row not found");
    const error = within(row).getByRole("alert");
    expect(error).toHaveTextContent(errorMessage);
    expect(start).toHaveAttribute("aria-invalid", "true");
    expect(start).toHaveAttribute("aria-describedby", error.id);
    expect(start).toHaveAccessibleDescription(errorMessage);
    expect(screen.getByRole("textbox", { name: "Period 1 start time" })).toHaveAttribute("aria-invalid", "false");

    await user.clear(start);
    await user.type(start, "12:00");
    const end = screen.getByRole("textbox", { name: "Period 2 end time" });
    await user.clear(end);
    await user.type(end, "13:00");
    await user.click(screen.getByRole("button", { name: "Save & Continue" }));

    expect(onSave).toHaveBeenCalledWith({
      working_days: ["monday"],
      periods_per_day: 2,
      periods: [
        { index: 1, start: "11:00", end: "12:00" },
        { index: 2, start: "12:00", end: "13:00" },
      ],
      day_order_format: "roman",
    });
    expect(within(row).queryByRole("alert")).not.toBeInTheDocument();
    expect(start).toHaveAttribute("aria-invalid", "false");
    expect(start).not.toHaveAttribute("aria-describedby");
  });
});

interface FormTestProps {
  isPersisted: boolean;
  isSaving?: boolean;
  navigationDisabled?: boolean;
  onSave: (values: InstitutionProfileFormValues | CalendarFormValues | SignupPolicyFormValues) => Promise<boolean>;
  onNext: () => void;
  onBack: () => void;
  onDirtyChange: (dirty: boolean) => void;
}

const savedProfile = { name: "Test College", short_code: "TC", city: "Saved City" };
const formCases = [
  {
    step: "profile",
    render: (props: FormTestProps) => <InstitutionProfileStep {...props} initialValues={savedProfile} />,
    edit: () => fireEvent.change(screen.getByLabelText("City"), { target: { value: "Edited City" } }),
    revert: () => fireEvent.change(screen.getByLabelText("City"), { target: { value: "Saved City" } }),
  },
  {
    step: "calendar",
    render: (props: FormTestProps) => <CalendarStep {...props} initialValues={{
      working_days: ["monday", "tuesday"], periods_per_day: 1,
      periods: [{ index: 1, start: "09:00", end: "10:00" }], day_order_format: "roman",
    }} />,
    edit: () => fireEvent.change(screen.getByLabelText("Period 1 start time"), { target: { value: "09:15" } }),
    revert: () => fireEvent.change(screen.getByLabelText("Period 1 start time"), { target: { value: "09:00" } }),
  },
  {
    step: "policy",
    render: (props: FormTestProps) => <SignupPolicyStep {...props} initialValues={{
      student_self_registration_enabled: false, parent_self_registration_enabled: false, approval_mode: "manual",
    }} />,
    edit: () => fireEvent.click(screen.getByRole("switch", { name: "Student Self-Registration" })),
    revert: () => fireEvent.click(screen.getByRole("switch", { name: "Student Self-Registration" })),
  },
];

function formTestProps(overrides: Partial<FormTestProps> = {}) {
  return {
    isPersisted: true,
    onSave: vi.fn().mockResolvedValue(true),
    onNext: vi.fn(),
    onBack: vi.fn(),
    onDirtyChange: vi.fn(),
    ...overrides,
  };
}

describe("Single Save & Continue flow and persisted dirty snapshots", () => {
  it.each(formCases)("uses Continue without saving an unchanged $step", async (testCase) => {
    const user = userEvent.setup();
    const props = formTestProps();
    render(testCase.render(props));

    expect(props.onDirtyChange).toHaveBeenLastCalledWith(false);
    expect(screen.queryByRole("button", { name: /Save Profile|Save Calendar|Save Policy|Next Step/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(props.onSave).not.toHaveBeenCalled();
    expect(props.onNext).toHaveBeenCalledOnce();
  });

  it.each(formCases)("detects edits and clears dirty state when $step changes are reverted", (testCase) => {
    const props = formTestProps();
    render(testCase.render(props));

    testCase.edit();
    expect(props.onDirtyChange).toHaveBeenLastCalledWith(true);
    expect(screen.getByRole("button", { name: "Save & Continue" })).toBeInTheDocument();

    testCase.revert();
    expect(props.onDirtyChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
  });

  it.each(formCases)("awaits a successful $step save, preserves dirty state on failure, and advances once", async (testCase) => {
    const user = userEvent.setup();
    let finishSave: (success: boolean) => void = () => { throw new Error("Save not initialized"); };
    const pending = new Promise<boolean>((resolve) => { finishSave = resolve; });
    const onSave = vi.fn().mockReturnValueOnce(pending).mockResolvedValue(true);
    const props = formTestProps({ onSave });
    render(testCase.render(props));
    testCase.edit();

    const button = screen.getByRole("button", { name: "Save & Continue" });
    await user.click(button);
    const form = button.closest("form");
    if (!form) throw new Error("Step form not found");
    fireEvent.submit(form);
    expect(onSave).toHaveBeenCalledOnce();
    expect(props.onNext).not.toHaveBeenCalled();

    await act(async () => { finishSave(false); });
    expect(props.onNext).not.toHaveBeenCalled();
    expect(props.onDirtyChange).toHaveBeenLastCalledWith(true);

    await user.click(screen.getByRole("button", { name: "Save & Continue" }));
    expect(onSave).toHaveBeenCalledTimes(2);
    expect(props.onNext).toHaveBeenCalledOnce();
    expect(props.onDirtyChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();

    // A successful save replaces the original baseline, not just the dirty flag.
    testCase.revert();
    expect(props.onDirtyChange).toHaveBeenLastCalledWith(true);
    testCase.edit();
    expect(props.onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it.each(formCases)("saves an unpersisted $step configuration even before it is edited", async (testCase) => {
    const user = userEvent.setup();
    const props = formTestProps({ isPersisted: false });
    render(testCase.render(props));

    expect(props.onDirtyChange).toHaveBeenLastCalledWith(true);
    await user.click(screen.getByRole("button", { name: "Save & Continue" }));

    expect(props.onSave).toHaveBeenCalledOnce();
    expect(props.onNext).toHaveBeenCalledOnce();
    expect(props.onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it.each(formCases)("disables $step footer actions and ignores submission while saving", async (testCase) => {
    const user = userEvent.setup();
    const props = formTestProps({ isSaving: true });
    render(testCase.render(props));

    const button = screen.getByRole("button", { name: "Saving..." });
    const form = button.closest("form");
    if (!form) throw new Error("Step form not found");
    for (const action of within(form).getAllByRole("button")) expect(action).toBeDisabled();
    await user.click(button);
    fireEvent.submit(form);
    expect(props.onSave).not.toHaveBeenCalled();
    expect(props.onNext).not.toHaveBeenCalled();
    expect(props.onBack).not.toHaveBeenCalled();
  });

  it.each(formCases)("keeps $step Continue disabled during a history rewind", (testCase) => {
    const props = formTestProps({ navigationDisabled: true });
    render(testCase.render(props));
    const button = screen.getByRole("button", { name: "Continue" });
    expect(button).toBeDisabled();
    const form = button.closest("form");
    if (!form) throw new Error("Step form not found");
    fireEvent.submit(form);
    expect(props.onNext).not.toHaveBeenCalled();
  });

  it("hydrates an untouched profile without marking the loaded values dirty", () => {
    const props = formTestProps({ isPersisted: false });
    const view = render(<InstitutionProfileStep {...props} />);
    view.rerender(<InstitutionProfileStep {...props} isPersisted initialValues={savedProfile} />);

    expect(screen.getByLabelText(/^Institution Name/)).toHaveValue("Test College");
    expect(screen.getByLabelText("City")).toHaveValue("Saved City");
    expect(props.onDirtyChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
  });

  it("preserves profile edits across a background refresh and compares them to the new saved snapshot", () => {
    const props = formTestProps();
    const view = render(<InstitutionProfileStep {...props} initialValues={savedProfile} />);
    fireEvent.change(screen.getByLabelText("City"), { target: { value: "Edited City" } });
    view.rerender(<InstitutionProfileStep {...props} initialValues={{ ...savedProfile, city: "Refreshed City" }} />);

    expect(screen.getByLabelText("City")).toHaveValue("Edited City");
    expect(props.onDirtyChange).toHaveBeenLastCalledWith(true);
    fireEvent.change(screen.getByLabelText("City"), { target: { value: "Refreshed City" } });
    expect(props.onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it("recognizes reverted working days, period counts, and unchanged calendar choices", async () => {
    const user = userEvent.setup();
    const props = formTestProps();
    render(<CalendarStep {...props} />);

    await user.click(screen.getByRole("button", { name: "monday" }));
    expect(props.onDirtyChange).toHaveBeenLastCalledWith(true);
    await user.click(screen.getByRole("button", { name: "monday" }));
    expect(props.onDirtyChange).toHaveBeenLastCalledWith(false);

    const count = screen.getByLabelText(/Periods Per Working Day/);
    fireEvent.change(count, { target: { value: "5" } });
    expect(props.onDirtyChange).toHaveBeenLastCalledWith(true);
    fireEvent.change(count, { target: { value: "6" } });
    expect(props.onDirtyChange).toHaveBeenLastCalledWith(false);

    await user.click(screen.getByRole("button", { name: /^Numeric Digits/ }));
    expect(props.onDirtyChange).toHaveBeenLastCalledWith(true);
    await user.click(screen.getByRole("button", { name: /^Roman Numerals/ }));
    await user.click(screen.getByRole("button", { name: "Auto-fill Defaults" }));
    expect(props.onDirtyChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
  });

  it("recognizes reverted guardian and approval-policy changes and ignores reselecting the saved choice", async () => {
    const user = userEvent.setup();
    const props = formTestProps();
    render(<SignupPolicyStep {...props} />);

    const parent = screen.getByRole("switch", { name: "Parent & Guardian Self-Registration" });
    await user.click(parent);
    expect(props.onDirtyChange).toHaveBeenLastCalledWith(true);
    await user.click(parent);
    expect(props.onDirtyChange).toHaveBeenLastCalledWith(false);

    await user.click(screen.getByRole("button", { name: /^Automatic Provisioning/ }));
    expect(props.onDirtyChange).toHaveBeenLastCalledWith(true);
    await user.click(screen.getByRole("button", { name: /^Manual Verification/ }));
    await user.click(screen.getByRole("button", { name: /^Manual Verification/ }));
    expect(props.onDirtyChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
  });

  it("preserves the stored weekday payload order when saving a different calendar field", async () => {
    const user = userEvent.setup();
    const props = formTestProps();
    render(<CalendarStep {...props} initialValues={{
      working_days: ["tuesday", "monday"], periods_per_day: 1,
      periods: [{ index: 1, start: "09:00", end: "10:00" }], day_order_format: "roman",
    }} />);
    fireEvent.change(screen.getByLabelText("Period 1 start time"), { target: { value: "09:15" } });
    await user.click(screen.getByRole("button", { name: "Save & Continue" }));
    expect(props.onSave).toHaveBeenCalledWith(expect.objectContaining({
      working_days: ["tuesday", "monday"], periods: [{ index: 1, start: "09:15", end: "10:00" }],
    }));
  });

  it("compares an organisation dialog to its opening defaults rather than refreshed list ordering", async () => {
    const user = userEvent.setup();
    const streams = [
      { id: "s1", code: "A", name: "First Stream" },
      { id: "s2", code: "B", name: "Second Stream" },
    ];
    const onDirtyChange = vi.fn();
    const props = {
      streams, departments: [], academicYears: [], onDirtyChange,
      onRefresh: vi.fn().mockResolvedValue(undefined),
      onCreateStream: vi.fn().mockResolvedValue(true),
      onRenameStream: vi.fn().mockResolvedValue(true),
      onDeleteStream: vi.fn().mockResolvedValue({ success: true }),
      onCreateDepartment: vi.fn().mockResolvedValue(true),
      onCreateAcademicYear: vi.fn().mockResolvedValue(true),
      onNext: vi.fn(), onBack: vi.fn(),
    };
    const view = render(<OrganisationBasicsStep {...props} />);
    await user.click(screen.getByRole("button", { name: "Add Department" }));
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    view.rerender(<OrganisationBasicsStep {...props} streams={[streams[1]!, streams[0]!]} />);
    const picker = screen.getByLabelText("Stream Picker");
    expect(picker).toHaveValue("s1");
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    await user.selectOptions(picker, "s2");
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    await user.selectOptions(picker, "s1");
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });
});

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  OrganisationBasicsStep,
  deriveStreamCode,
  type StreamItem,
  type DepartmentItem,
  type AcademicYearItem,
} from "../src/app/setup/components/OrganisationBasicsStep";

describe("OrganisationBasicsStep Render & Interactive Tests (Item 4)", () => {
  const mockStreams: StreamItem[] = [
    { id: "s1", code: "AIDED", name: "Government Aided", departments_count: 2 },
    { id: "s2", code: "SF", name: "Self Financing", departments_count: 0 },
  ];

  const mockDepartments: DepartmentItem[] = [
    { id: "d1", code: "CSE", name: "Computer Science", stream_id: "s1", kind: "academic" },
    { id: "d2", code: "ECE", name: "Electronics", stream_id: "s1", kind: "academic" },
  ];

  const mockYears: AcademicYearItem[] = [
    { id: "y1", label: "2026-2027", start_date: "2026-06-01", end_date: "2027-03-31", is_current: true },
  ];

  const mockOnCreateStream = vi.fn().mockResolvedValue(true);
  const mockOnRenameStream = vi.fn().mockResolvedValue(true);
  const mockOnDeleteStream = vi.fn().mockResolvedValue({ success: true });
  const mockOnCreateDepartment = vi.fn().mockResolvedValue(true);
  const mockOnDeleteDepartment = vi.fn().mockResolvedValue({ success: true });
  const mockOnCreateAcademicYear = vi.fn().mockResolvedValue(true);
  const mockOnRefresh = vi.fn().mockResolvedValue(undefined);
  const mockOnNext = vi.fn();
  const mockOnBack = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderStep(streams = mockStreams) {
    return render(
      <OrganisationBasicsStep
        streams={streams}
        departments={mockDepartments}
        academicYears={mockYears}
        onCreateStream={mockOnCreateStream}
        onRenameStream={mockOnRenameStream}
        onDeleteStream={mockOnDeleteStream}
        onCreateDepartment={mockOnCreateDepartment}
        onDeleteDepartment={mockOnDeleteDepartment}
        onCreateAcademicYear={mockOnCreateAcademicYear}
        onRefresh={mockOnRefresh}
        onNext={mockOnNext}
        onBack={mockOnBack}
      />
    );
  }

  describe("deriveStreamCode helper", () => {
    it("converts mixed string to upper-snake uppercase code", () => {
      expect(deriveStreamCode("Government Aided")).toBe("GOVERNMENT_AIDED");
      expect(deriveStreamCode("Self-financing & Management")).toBe("SELF_FINANCING_MANAGEMENT");
      expect(deriveStreamCode("  technical 101  ")).toBe("TECHNICAL_101");
    });

    it("truncates to maximum 32 characters per backend rules", () => {
      const longName = "A Very Extremely Super Long Stream Name That Exceeds Thirty Two Characters";
      const derived = deriveStreamCode(longName);
      expect(derived.length).toBeLessThanOrEqual(32);
    });
  });

  describe("Stream Dialog Interactions & Bug Regression", () => {
    it("opens Create Stream dialog and remains open while typing in input", async () => {
      const user = userEvent.setup();
      renderStep();

      const addBtn = screen.getByRole("button", { name: /add stream/i });
      await user.click(addBtn);

      // Dialog is open
      expect(screen.getByRole("heading", { name: /create institutional stream/i })).toBeInTheDocument();

      const nameInput = screen.getByLabelText(/stream name/i);
      const codeInput = screen.getByLabelText(/stream code/i);

      // Typing into input does NOT close the modal (Fix 1b regression test)
      await user.type(nameInput, "Aided Engineering");
      expect(nameInput).toHaveValue("Aided Engineering");

      // Auto-derives code in upper-snake
      expect(codeInput).toHaveValue("AIDED_ENGINEERING");

      // Dialog is still open
      expect(screen.getByRole("heading", { name: /create institutional stream/i })).toBeInTheDocument();
    });

    it("allows manual editing of stream code and stops auto-deriving once edited", async () => {
      const user = userEvent.setup();
      renderStep();

      await user.click(screen.getByRole("button", { name: /add stream/i }));

      const nameInput = screen.getByLabelText(/stream name/i);
      const codeInput = screen.getByLabelText(/stream code/i);

      // Manual edit on code
      await user.clear(codeInput);
      await user.type(codeInput, "CUSTOM_CODE");
      expect(codeInput).toHaveValue("CUSTOM_CODE");

      // Subsequent typing in name does not overwrite manual code
      await user.type(nameInput, "Some Name");
      expect(codeInput).toHaveValue("CUSTOM_CODE");
    });

    it("prefills name and code via quick-fill chips", async () => {
      const user = userEvent.setup();
      renderStep();

      await user.click(screen.getByRole("button", { name: /add stream/i }));

      // Click "Aided" quick fill chip
      const aidedChip = screen.getByRole("button", { name: /^aided$/i });
      await user.click(aidedChip);

      expect(screen.getByLabelText(/stream name/i)).toHaveValue("Aided");
      expect(screen.getByLabelText(/stream code/i)).toHaveValue("AIDED");

      // Click "Self-financing" quick fill chip
      const sfChip = screen.getByRole("button", { name: /self-financing/i });
      await user.click(sfChip);

      expect(screen.getByLabelText(/stream name/i)).toHaveValue("Self-financing");
      expect(screen.getByLabelText(/stream code/i)).toHaveValue("SELF_FINANCING");
    });

    it("shows note that stream code cannot be changed after creation", async () => {
      const user = userEvent.setup();
      renderStep();

      await user.click(screen.getByRole("button", { name: /add stream/i }));

      expect(screen.getByText(/the stream code cannot be changed after creation/i)).toBeInTheDocument();
    });

    it("closes dialog when Cancel button is clicked", async () => {
      const user = userEvent.setup();
      renderStep();

      await user.click(screen.getByRole("button", { name: /add stream/i }));
      expect(screen.getByRole("heading", { name: /create institutional stream/i })).toBeInTheDocument();

      const cancelBtn = screen.getByRole("button", { name: /cancel/i });
      await user.click(cancelBtn);

      await waitFor(() => {
        expect(screen.queryByRole("heading", { name: /create institutional stream/i })).not.toBeInTheDocument();
      });
    });

    it("closes dialog when Escape key is pressed", async () => {
      const user = userEvent.setup();
      renderStep();

      await user.click(screen.getByRole("button", { name: /add stream/i }));
      expect(screen.getByRole("heading", { name: /create institutional stream/i })).toBeInTheDocument();

      await user.keyboard("{Escape}");

      await waitFor(() => {
        expect(screen.queryByRole("heading", { name: /create institutional stream/i })).not.toBeInTheDocument();
      });
    });

    it("displays validation error when submitting with empty or invalid fields", async () => {
      const user = userEvent.setup();
      renderStep();

      await user.click(screen.getByRole("button", { name: /add stream/i }));

      // Submit without values
      const submitBtn = screen.getByRole("button", { name: /^create stream$/i });
      await user.click(submitBtn);

      expect(screen.getByText(/both stream code and stream name are required/i)).toBeInTheDocument();
      expect(mockOnCreateStream).not.toHaveBeenCalled();
    });

    it("successfully submits stream form with valid inputs", async () => {
      const user = userEvent.setup();
      renderStep();

      await user.click(screen.getByRole("button", { name: /add stream/i }));

      await user.click(screen.getByRole("button", { name: /^aided$/i }));
      await user.click(screen.getByRole("button", { name: /^create stream$/i }));

      expect(mockOnCreateStream).toHaveBeenCalledWith("AIDED", "Aided");
      await waitFor(() => {
        expect(screen.queryByRole("heading", { name: /create institutional stream/i })).not.toBeInTheDocument();
      });
    });
  });

  describe("Stream Delete Button State & Rules", () => {
    it("disables Delete button for stream with assigned departments", () => {
      renderStep();

      // First stream has 2 departments
      const deleteButtons = screen.getAllByRole("button", { name: /delete/i });
      const aidedDeleteBtn = deleteButtons[0];

      expect(aidedDeleteBtn).toBeDisabled();
      expect(aidedDeleteBtn).toHaveAttribute(
        "title",
        "Cannot delete stream while departments are assigned to it."
      );
    });

    it("enables Delete button for stream with zero assigned departments", () => {
      renderStep();

      // Second stream has 0 departments
      const deleteButtons = screen.getAllByRole("button", { name: /delete/i });
      const sfDeleteBtn = deleteButtons[1];

      expect(sfDeleteBtn).not.toBeDisabled();
    });

    it("deletes a department when its Delete button is clicked and triggers onRefresh", async () => {
      const user = userEvent.setup();
      renderStep();

      const deleteDeptBtn = screen.getByTitle("Delete department Computer Science");
      expect(deleteDeptBtn).not.toBeDisabled();

      await user.click(deleteDeptBtn);

      expect(mockOnDeleteDepartment).toHaveBeenCalledWith("d1");
      expect(mockOnRefresh).toHaveBeenCalled();
    });
  });

  describe("Department & Academic Year Dialogs", () => {
    it("opens Add Department dialog with stream select and kind select", async () => {
      const user = userEvent.setup();
      renderStep();

      await user.click(screen.getByRole("button", { name: /add department/i }));

      expect(screen.getByRole("heading", { name: /add department/i })).toBeInTheDocument();

      // Stream selector is a select element
      const streamSelect = screen.getByLabelText(/stream picker/i) as HTMLSelectElement;
      expect(streamSelect.tagName).toBe("SELECT");
      expect(streamSelect.options.length).toBe(2);

      // Kind selector has exactly academic, general, administrative
      const kindSelect = screen.getByLabelText(/department kind/i) as HTMLSelectElement;
      expect(kindSelect.tagName).toBe("SELECT");
      const kindValues = Array.from(kindSelect.options).map((o) => o.value);
      expect(kindValues).toEqual(["academic", "general", "administrative"]);
    });

    it("displays department stream name and code properly when stream is a string code or resolved via stream_id", () => {
      const customDepts: DepartmentItem[] = [
        {
          id: "d1",
          code: "EL",
          name: "Electronics Engineering",
          stream_id: "s2",
          stream: "SF",
          kind: "academic",
        },
        {
          id: "d2",
          code: "ME",
          name: "Mechanical Engineering",
          stream_id: "s1",
          kind: "academic",
        },
      ];

      render(
        <OrganisationBasicsStep
          streams={mockStreams}
          departments={customDepts}
          academicYears={mockYears}
          onCreateStream={mockOnCreateStream}
          onRenameStream={mockOnRenameStream}
          onDeleteStream={mockOnDeleteStream}
          onCreateDepartment={mockOnCreateDepartment}
          onDeleteDepartment={mockOnDeleteDepartment}
          onCreateAcademicYear={mockOnCreateAcademicYear}
          onRefresh={mockOnRefresh}
          onNext={mockOnNext}
          onBack={mockOnBack}
        />
      );

      // Verify that "undefined (undefined)" does not appear anywhere
      expect(screen.queryByText(/undefined \(undefined\)/i)).not.toBeInTheDocument();

      // Verify EL department shows Self Financing (SF)
      expect(screen.getByText("Self Financing (SF)")).toBeInTheDocument();
      // Verify ME department shows Government Aided (AIDED) via stream_id
      expect(screen.getByText("Government Aided (AIDED)")).toBeInTheDocument();
    });

    it("opens Add Academic Year dialog and validates inputs", async () => {
      const user = userEvent.setup();
      renderStep();

      await user.click(screen.getByRole("button", { name: /add academic year/i }));

      expect(screen.getByRole("heading", { name: /add academic year/i })).toBeInTheDocument();

      const labelInput = screen.getByLabelText(/session label/i);
      await user.type(labelInput, "2027-2028");
      expect(labelInput).toHaveValue("2027-2028");

      // Cancel closes
      await user.click(screen.getByRole("button", { name: /cancel/i }));
      await waitFor(() => {
        expect(screen.queryByRole("heading", { name: /add academic year/i })).not.toBeInTheDocument();
      });
    });
  });
});

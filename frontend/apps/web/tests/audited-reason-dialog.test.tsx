import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  AuditedReasonDialog,
  validateAuditedReason,
} from "../src/components/common/AuditedReasonDialog";

describe("AuditedReasonDialog", () => {
  it("validates 5-500 character trimmed reason bounds", () => {
    expect(validateAuditedReason("abc")).toBe(
      "Reason must be between 5 and 500 characters."
    );
    expect(validateAuditedReason("   ab  ")).toBe(
      "Reason must be between 5 and 500 characters."
    );
    expect(validateAuditedReason("Valid reason")).toBeNull();
    expect(validateAuditedReason("x".repeat(501))).toBe(
      "Reason must be between 5 and 500 characters."
    );
  });

  it("blocks submission when reason is shorter than 5 characters", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    render(
      <AuditedReasonDialog
        open
        onOpenChange={vi.fn()}
        title="Enable self-registration"
        onConfirm={onConfirm}
      />
    );

    await user.type(screen.getByLabelText("Reason"), "hey");
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    expect(
      screen.getByText("Reason must be between 5 and 500 characters.")
    ).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("requires at least one option when options are provided and requireAtLeastOneOption is true", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    render(
      <AuditedReasonDialog
        open
        onOpenChange={vi.fn()}
        title="Unlock setup sections"
        notice="Saving a section locks it again."
        options={[
          { id: "institution_profile", label: "Institution Profile" },
          { id: "calendar_basics", label: "Calendar Basics" },
        ]}
        requireAtLeastOneOption
        onConfirm={onConfirm}
      />
    );

    expect(screen.getByText("Saving a section locks it again.")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Reason"), "Update academic dates");
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    expect(
      screen.getByText("Select at least one section to continue.")
    ).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();

    await user.click(screen.getByRole("checkbox", { name: "Calendar Basics" }));
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith({
        reason: "Update academic dates",
        selectedOptions: ["calendar_basics"],
      });
    });
  });

  it("surfaces async errors from onConfirm", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn().mockRejectedValue(new Error("Server rejected"));

    render(
      <AuditedReasonDialog
        open
        onOpenChange={vi.fn()}
        title="Confirm action"
        onConfirm={onConfirm}
      />
    );

    await user.type(screen.getByLabelText("Reason"), "Valid audit reason");
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    expect(await screen.findByText("Server rejected")).toBeInTheDocument();
  });
});


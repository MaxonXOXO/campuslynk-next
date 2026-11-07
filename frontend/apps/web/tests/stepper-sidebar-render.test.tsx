import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Stepper } from "../src/app/setup/components/Stepper";
import { WIZARD_STEPS, type StepId, type StepState } from "../src/app/setup/logic/step-derivation";

describe("Guided Sidebar Stepper Component", () => {
  const defaultStates: Record<StepId, StepState> = {
    institution_profile: "saved",
    organisation_basics: "current",
    calendar_basics: "not_started",
    signup_policy: "not_started",
    review_finish: "not_started",
  };

  it("renders all 5 wizard steps with their titles, descriptions, and state badges", () => {
    const onStepClick = vi.fn();

    render(
      <Stepper
        currentStep="organisation_basics"
        stepStates={defaultStates}
        onStepClick={onStepClick}
      />
    );

    const nav = screen.getByRole("navigation", { name: /first-run setup progress/i });
    expect(nav).toBeInTheDocument();

    for (const step of WIZARD_STEPS) {
      expect(screen.getByText(step.title)).toBeInTheDocument();
      expect(screen.getByText(step.description)).toBeInTheDocument();
      expect(screen.getByText(`Step 0${step.stepNumber}`)).toBeInTheDocument();
    }

    // Check aria-current on Step 2 button
    const currentBtn = screen.getByRole("button", { name: /organisation basics/i });
    expect(currentBtn).toHaveAttribute("aria-current", "step");

    // Check state badges
    expect(screen.getByText("Saved")).toBeInTheDocument();
    expect(screen.getByText("Current")).toBeInTheDocument();
    expect(screen.getAllByText("Not started")).toHaveLength(3);
  });

  it("invokes onStepClick when an enabled step button is clicked", async () => {
    const user = userEvent.setup();
    const onStepClick = vi.fn();

    render(
      <Stepper
        currentStep="organisation_basics"
        stepStates={defaultStates}
        onStepClick={onStepClick}
      />
    );

    const step3Btn = screen.getByRole("button", { name: /academic calendar/i });
    await user.click(step3Btn);

    expect(onStepClick).toHaveBeenCalledWith("calendar_basics");
  });
});

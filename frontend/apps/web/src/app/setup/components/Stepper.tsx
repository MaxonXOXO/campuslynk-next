"use client";

import * as React from "react";
import {
  RiCheckboxCircleFill,
  RiRadioButtonLine,
  RiTimeLine,
} from "@remixicon/react";
import { cn } from "@academic-suite/ui";
import {
  WIZARD_STEPS,
  type StepId,
  type StepState,
} from "../logic/step-derivation";

interface StepperProps {
  currentStep: StepId;
  stepStates: Record<StepId, StepState>;
  onStepClick: (step: StepId) => void;
  disabled?: boolean;
}

export function Stepper({
  currentStep,
  stepStates,
  onStepClick,
  disabled = false,
}: StepperProps) {
  return (
    <nav aria-label="First-Run Setup Progress" className="w-full">
      <ol className="grid grid-cols-2 md:grid-cols-5 gap-2 md:gap-3">
        {WIZARD_STEPS.map((step) => {
          const state = stepStates[step.id] || "not_started";
          const isCurrent = currentStep === step.id;

          const renderStateBadge = () => {
            if (state === "saved") {
              return (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                  <RiCheckboxCircleFill
                    className="size-4 shrink-0 text-primary"
                    aria-hidden="true"
                  />
                  <span>Saved</span>
                </span>
              );
            }
            if (isCurrent || state === "current") {
              return (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-foreground">
                  <RiRadioButtonLine
                    className="size-4 shrink-0 text-primary animate-pulse"
                    aria-hidden="true"
                  />
                  <span>Current</span>
                </span>
              );
            }
            return (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <RiTimeLine className="size-4 shrink-0" aria-hidden="true" />
                <span>Not started</span>
              </span>
            );
          };

          return (
            <li key={step.id}>
              <button
                type="button"
                onClick={() => !disabled && onStepClick(step.id)}
                disabled={disabled}
                aria-current={isCurrent ? "step" : undefined}
                className={cn(
                  "w-full text-left p-3 rounded-lg border transition-all select-none outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  isCurrent
                    ? "border-primary bg-primary/5 shadow-xs"
                    : state === "saved"
                      ? "border-border bg-card hover:bg-muted/50"
                      : "border-dashed border-border/80 bg-muted/20 hover:bg-muted/40",
                  disabled && "opacity-50 cursor-not-allowed"
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-mono font-semibold text-muted-foreground">
                    Step 0{step.stepNumber}
                  </span>
                  {renderStateBadge()}
                </div>
                <div
                  className={cn(
                    "text-sm font-medium line-clamp-1",
                    isCurrent ? "text-foreground font-semibold" : "text-muted-foreground"
                  )}
                >
                  {step.title}
                </div>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}


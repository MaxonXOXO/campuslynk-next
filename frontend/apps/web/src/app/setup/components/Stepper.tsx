"use client";

import * as React from "react";
import {
  RiCheckboxCircleFill,
  RiRadioButtonLine,
  RiTimeLine,
  RiCheckLine,
} from "@remixicon/react";
import { Button, cn } from "@academic-suite/ui";
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
      <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2 lg:gap-1.5">
        {WIZARD_STEPS.map((step, index) => {
          const state = stepStates[step.id] || "not_started";
          const isCurrent = currentStep === step.id;
          const isSaved = state === "saved";
          const isLast = index === WIZARD_STEPS.length - 1;

          const renderStateBadge = () => {
            if (isSaved) {
              return (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                  <RiCheckboxCircleFill
                    className="size-3.5 shrink-0 text-primary"
                    aria-hidden="true"
                  />
                  <span>Saved</span>
                </span>
              );
            }
            if (isCurrent || state === "current") {
              return (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">
                  <RiRadioButtonLine
                    className="size-3.5 shrink-0 text-primary animate-pulse"
                    aria-hidden="true"
                  />
                  <span>Current</span>
                </span>
              );
            }
            return (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                <RiTimeLine className="size-3.5 shrink-0" aria-hidden="true" />
                <span>Not started</span>
              </span>
            );
          };

          return (
            <li key={step.id} className="relative">
              {/* Vertical connector line on desktop guided sidebar */}
              {!isLast && (
                <span
                  aria-hidden="true"
                  className={cn(
                    "hidden lg:block absolute left-[25px] top-11 -bottom-2.5 w-px transition-colors",
                    isSaved ? "bg-primary/40" : "bg-border"
                  )}
                />
              )}

              <Button
                type="button"
                variant="ghost"
                onClick={() => !disabled && onStepClick(step.id)}
                disabled={disabled}
                aria-current={isCurrent ? "step" : undefined}
                className={cn(
                  "group relative h-auto w-full whitespace-normal text-left p-3 rounded-xl border transition-all select-none outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  "flex items-start gap-3",
                  isCurrent
                    ? "border-primary/60 bg-primary/5 shadow-xs"
                    : isSaved
                      ? "border-transparent bg-card/60 hover:bg-muted/60 hover:border-border/60"
                      : "border-transparent bg-transparent hover:bg-muted/40 hover:border-border/50",
                  disabled && "opacity-50 cursor-not-allowed"
                )}
              >
                {/* Guided Step Indicator Circle */}
                <div
                  className={cn(
                    "relative z-10 mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-mono font-semibold transition-colors",
                    isCurrent
                      ? "border-primary bg-primary text-primary-foreground shadow-xs ring-4 ring-primary/15"
                      : isSaved
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-border bg-muted/50 text-muted-foreground group-hover:border-muted-foreground/40"
                  )}
                >
                  {isSaved ? (
                    <RiCheckLine className="size-4" aria-hidden="true" />
                  ) : (
                    <span>0{step.stepNumber}</span>
                  )}
                </div>

                {/* Step Details */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-muted-foreground">
                      Step 0{step.stepNumber}
                    </span>
                    {renderStateBadge()}
                  </div>

                  <div
                    className={cn(
                      "text-sm font-medium leading-snug truncate",
                      isCurrent
                        ? "text-foreground font-semibold"
                        : isSaved
                          ? "text-foreground/90"
                          : "text-muted-foreground group-hover:text-foreground/80"
                    )}
                  >
                    {step.title}
                  </div>

                  <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
                    {step.description}
                  </p>
                </div>
              </Button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

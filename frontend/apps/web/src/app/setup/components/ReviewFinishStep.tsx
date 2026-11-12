"use client";

import * as React from "react";
import {
  Button,
  Badge,
  Alert,
  AlertTitle,
  AlertDescription,
  Skeleton,
} from "@academic-suite/ui";
import {
  RiCheckLine,
  RiCloseLine,
  RiAlertLine,
  RiEditLine,
  RiLoader4Line,
  RiShieldCheckLine,
  RiRefreshLine,
} from "@remixicon/react";
import {
  isFinishEnabled,
  getPrerequisiteChecklist,
  type SetupStatusData,
  type StepId,
} from "../logic/step-derivation";
import type { InstitutionProfileFormValues } from "../logic/validation";
import type { CalendarFormValues } from "./CalendarStep";
import type { SignupPolicyFormValues } from "./SignupPolicyStep";

interface ReviewFinishStepProps {
  status: SetupStatusData | null;
  profileValues?: Partial<InstitutionProfileFormValues>;
  calendarValues?: Partial<CalendarFormValues>;
  signupValues?: Partial<SignupPolicyFormValues>;
  isLoading?: boolean;
  isFinishing?: boolean;
  missingPrerequisites?: string[];
  generalError?: string | null;
  onEditStep: (step: StepId) => void;
  onFinish: () => Promise<void>;
  onRetry?: () => Promise<void>;
  onBack: () => void;
}

export function ReviewFinishStep({
  status,
  profileValues,
  calendarValues,
  signupValues,
  isLoading = false,
  isFinishing = false,
  missingPrerequisites = [],
  generalError = null,
  onEditStep,
  onFinish,
  onRetry,
  onBack,
}: ReviewFinishStepProps) {
  const canFinish = isFinishEnabled(status);
  const checklist = getPrerequisiteChecklist(status);

  if (isLoading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          Review Configuration &amp; Finalize Setup
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Review institutional parameters and structural prerequisite readiness before locking
          in first-run initialization.
        </p>
      </div>

      {generalError && (
        <Alert variant="destructive">
          <RiAlertLine className="size-4 shrink-0" aria-hidden="true" />
          <AlertTitle>Setup Finalization Error</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>{generalError}</p>
            {onRetry && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void onRetry()}
                disabled={isFinishing}
              >
                <RiRefreshLine className="size-4 mr-1.5" aria-hidden="true" />
                Retry Finalization
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* MISSING PREREQUISITES CALLOUT IF ANY */}
      {missingPrerequisites.length > 0 && (
        <Alert variant="destructive">
          <RiAlertLine className="size-4 shrink-0" aria-hidden="true" />
          <AlertTitle>Missing Setup Prerequisites</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-5 mt-1 space-y-1 text-xs">
              {missingPrerequisites.map((msg, idx) => (
                <li key={idx}>{msg}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* CHECKLIST BANNER */}
      <div className="border border-border rounded-xl p-5 bg-card space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-foreground">
            Onboarding Completion Checklist
          </h3>
          <Badge variant={canFinish ? "default" : "outline"}>
            {canFinish ? "Ready to Finalize" : "Requirements Incomplete"}
          </Badge>
        </div>

        <ul className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
          {checklist.map((item) => (
            <li
              key={item.id}
              className={`flex items-center justify-between p-3 rounded-lg border text-xs ${
                item.satisfied
                  ? "border-primary/20 bg-primary/5 text-foreground"
                  : "border-border bg-muted/20 text-muted-foreground"
              }`}
            >
              <div className="flex items-center gap-2">
                {item.satisfied ? (
                  <RiCheckLine className="size-4 shrink-0 text-primary" aria-hidden="true" />
                ) : (
                  <RiCloseLine className="size-4 shrink-0 text-destructive" aria-hidden="true" />
                )}
                <span className={item.satisfied ? "font-medium" : ""}>{item.label}</span>
              </div>
              {!item.satisfied && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-primary"
                  onClick={() => onEditStep(item.stepTarget)}
                  disabled={isFinishing}
                >
                  Configure →
                </Button>
              )}
            </li>
          ))}
        </ul>
      </div>

      {/* STEP SUMMARIES */}
      <div className="space-y-4">
        {/* Profile Summary */}
        <div className="border border-border rounded-xl p-5 bg-card">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div>
              <h4 className="text-sm font-semibold text-foreground">1. Institution Profile</h4>
              <p className="text-xs text-muted-foreground">Identification and Contact</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onEditStep("institution_profile")}
              disabled={isFinishing}
            >
              <RiEditLine className="size-3.5 mr-1" aria-hidden="true" /> Edit
            </Button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-3 text-xs">
            <div>
              <span className="text-muted-foreground block">Name:</span>
              <span className="font-medium text-foreground">
                {profileValues?.name || (status?.steps.institution_profile?.is_completed ? "Configured" : "Not configured")}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block">Short Code:</span>
              <span className="font-mono font-medium text-foreground">
                {profileValues?.short_code || "—"}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block">Board / Code:</span>
              <span className="font-medium text-foreground">
                {profileValues?.board || "—"}{" "}
                {profileValues?.board_code ? `(${profileValues.board_code})` : ""}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block">Contact Email:</span>
              <span className="font-medium text-foreground">
                {profileValues?.contact_email || "—"}
              </span>
            </div>
          </div>
        </div>

        {/* Organisation Summary */}
        <div className="border border-border rounded-xl p-5 bg-card">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div>
              <h4 className="text-sm font-semibold text-foreground">2. Organisation Basics</h4>
              <p className="text-xs text-muted-foreground">Structural Hierarchy</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onEditStep("organisation_basics")}
              disabled={isFinishing}
            >
              <RiEditLine className="size-3.5 mr-1" aria-hidden="true" /> Edit
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-4 pt-3 text-xs">
            <div>
              <span className="text-muted-foreground block">Active Streams:</span>
              <span className="font-medium text-foreground text-sm">
                {status?.prerequisites.streams_count ?? 0}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block">Departments:</span>
              <span className="font-medium text-foreground text-sm">
                {status?.prerequisites.departments_count ?? 0}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block">Academic Years:</span>
              <span className="font-medium text-foreground text-sm">
                {status?.prerequisites.academic_years_count ?? 0}
              </span>
            </div>
          </div>
        </div>

        {/* Calendar Summary */}
        <div className="border border-border rounded-xl p-5 bg-card">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div>
              <h4 className="text-sm font-semibold text-foreground">3. Academic Calendar</h4>
              <p className="text-xs text-muted-foreground">Timetable &amp; Schedule</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onEditStep("calendar_basics")}
              disabled={isFinishing}
            >
              <RiEditLine className="size-3.5 mr-1" aria-hidden="true" /> Edit
            </Button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 pt-3 text-xs">
            <div>
              <span className="text-muted-foreground block">Working Days:</span>
              <span className="font-medium text-foreground capitalize">
                {calendarValues?.working_days?.join(", ") || (status?.steps.calendar_basics?.is_completed ? "Saved" : "Not configured")}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block">Periods Per Day:</span>
              <span className="font-medium text-foreground">
                {calendarValues?.periods_per_day || (status?.steps.calendar_basics?.is_completed ? "Saved" : "—")}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block">Day Order Representation:</span>
              <span className="font-medium text-foreground capitalize">
                {calendarValues?.day_order_format || (status?.steps.calendar_basics?.is_completed ? "Saved" : "—")}
              </span>
            </div>
          </div>
        </div>

        {/* Sign-up Policy Summary */}
        <div className="border border-border rounded-xl p-5 bg-card">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div>
              <h4 className="text-sm font-semibold text-foreground">4. Sign-up Policy</h4>
              <p className="text-xs text-muted-foreground">Registration Governance</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onEditStep("signup_policy")}
              disabled={isFinishing}
            >
              <RiEditLine className="size-3.5 mr-1" aria-hidden="true" /> Edit
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-4 pt-3 text-xs">
            <div>
              <span className="text-muted-foreground block">Student Registration:</span>
              <span className="font-medium text-foreground">
                {signupValues?.student_self_registration_enabled ? "Enabled" : "Disabled (Default)"}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block">Parent Registration:</span>
              <span className="font-medium text-foreground">
                {signupValues?.parent_self_registration_enabled ? "Enabled" : "Disabled (Default)"}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block">Approval Mode:</span>
              <span className="font-medium text-foreground capitalize">
                {signupValues?.approval_mode || "Manual (Default)"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* FINAL FINISH ACTION */}
      <div className="flex items-center justify-between border-t border-border pt-5">
        <Button type="button" variant="outline" onClick={onBack} disabled={isFinishing}>
          ← Back to Sign-up Policy
        </Button>
        <div className="flex items-center gap-3">
          <Button
            type="button"
            size="lg"
            disabled={!canFinish || isFinishing}
            onClick={onFinish}
            className="px-6 font-semibold"
          >
            {isFinishing ? (
              <>
                <RiLoader4Line className="size-5 animate-spin mr-2" aria-hidden="true" />
                Finalizing Setup...
              </>
            ) : (
              <>
                <RiShieldCheckLine className="size-5 mr-2" aria-hidden="true" />
                Complete First-Run Setup
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

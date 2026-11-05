"use client";

import * as React from "react";
import {
  Button,
  Badge,
} from "@academic-suite/ui";
import {
  RiCheckboxCircleFill,
  RiEditLine,
  RiArrowRightLine,
} from "@remixicon/react";
import type { SetupStatusData, StepId } from "../logic/step-derivation";
import type { InstitutionProfileFormValues } from "../logic/validation";
import type { CalendarFormValues } from "./CalendarStep";
import type { SignupPolicyFormValues } from "./SignupPolicyStep";

interface CompletedSummaryProps {
  status: SetupStatusData;
  profileValues?: Partial<InstitutionProfileFormValues>;
  calendarValues?: Partial<CalendarFormValues>;
  signupValues?: Partial<SignupPolicyFormValues>;
  onEditStep: (step: StepId) => void;
  onGoToDashboard?: () => void;
}

export function CompletedSummary({
  status,
  profileValues,
  calendarValues,
  signupValues,
  onEditStep,
  onGoToDashboard,
}: CompletedSummaryProps) {
  const completedDate = status.completed_at
    ? new Date(status.completed_at).toLocaleString()
    : "Completed";

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <div className="p-6 rounded-xl border border-primary/20 bg-primary/5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <RiCheckboxCircleFill className="size-7 text-primary shrink-0" aria-hidden="true" />
            <div>
              <h2 className="text-xl font-bold tracking-tight text-foreground">
                First-Run Setup Completed
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Completed timestamp: <span className="font-mono text-foreground">{completedDate}</span>
              </p>
            </div>
          </div>
          <Badge variant="default" className="text-xs font-semibold py-1 px-3">
            Institutional Core Active
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Your institution has been initialized. All structural prerequisites and baseline
          configurations are in place. You can fine-tune any configuration anytime using the
          edit links below without locking the institution or resetting completion status.
        </p>
      </div>

      {/* Summary Cards with Edit Links */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Step 1: Profile */}
        <div className="border border-border rounded-xl p-5 bg-card space-y-3">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <h3 className="text-sm font-semibold text-foreground">1. Institution Profile</h3>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onEditStep("institution_profile")}
            >
              <RiEditLine className="size-3.5 mr-1" aria-hidden="true" /> Edit
            </Button>
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Name:</span>
              <span className="font-medium text-foreground">{profileValues?.name || "Configured"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Short Code:</span>
              <span className="font-mono font-medium text-foreground">{profileValues?.short_code || "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Board / Code:</span>
              <span className="font-medium text-foreground">
                {profileValues?.board || "—"} {profileValues?.board_code ? `(${profileValues.board_code})` : ""}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Official Email:</span>
              <span className="font-medium text-foreground">{profileValues?.contact_email || "—"}</span>
            </div>
          </div>
        </div>

        {/* Step 2: Organisation */}
        <div className="border border-border rounded-xl p-5 bg-card space-y-3">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <h3 className="text-sm font-semibold text-foreground">2. Organisation Basics</h3>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onEditStep("organisation_basics")}
            >
              <RiEditLine className="size-3.5 mr-1" aria-hidden="true" /> Edit
            </Button>
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Active Streams:</span>
              <span className="font-mono font-medium text-foreground">{status.prerequisites.streams_count}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Departments:</span>
              <span className="font-mono font-medium text-foreground">{status.prerequisites.departments_count}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Academic Years:</span>
              <span className="font-mono font-medium text-foreground">{status.prerequisites.academic_years_count}</span>
            </div>
          </div>
        </div>

        {/* Step 3: Calendar */}
        <div className="border border-border rounded-xl p-5 bg-card space-y-3">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <h3 className="text-sm font-semibold text-foreground">3. Academic Calendar</h3>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onEditStep("calendar_basics")}
            >
              <RiEditLine className="size-3.5 mr-1" aria-hidden="true" /> Edit
            </Button>
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Instructional Days:</span>
              <span className="font-medium text-foreground capitalize">
                {calendarValues?.working_days?.join(", ") || "Configured"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Periods Per Day:</span>
              <span className="font-mono font-medium text-foreground">{calendarValues?.periods_per_day || "6"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Day Order Cycle:</span>
              <span className="font-medium text-foreground capitalize">{calendarValues?.day_order_format || "Roman"}</span>
            </div>
          </div>
        </div>

        {/* Step 4: Sign-up Policy */}
        <div className="border border-border rounded-xl p-5 bg-card space-y-3">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <h3 className="text-sm font-semibold text-foreground">4. Sign-up Policy</h3>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onEditStep("signup_policy")}
            >
              <RiEditLine className="size-3.5 mr-1" aria-hidden="true" /> Edit
            </Button>
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Student Registration:</span>
              <span className="font-medium text-foreground">
                {signupValues?.student_self_registration_enabled ? "Enabled" : "Disabled"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Parent Registration:</span>
              <span className="font-medium text-foreground">
                {signupValues?.parent_self_registration_enabled ? "Enabled" : "Disabled"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Approval Mode:</span>
              <span className="font-medium text-foreground capitalize">
                {signupValues?.approval_mode || "Manual"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {onGoToDashboard && (
        <div className="flex justify-end pt-4 border-t border-border">
          <Button type="button" onClick={onGoToDashboard}>
            Go to Portal Home <RiArrowRightLine className="size-4 ml-1" aria-hidden="true" />
          </Button>
        </div>
      )}
    </div>
  );
}

"use client";

import * as React from "react";
import {
  Button,
  Label,
  Switch,
  Alert,
  AlertTitle,
  AlertDescription,
  Skeleton,
} from "@academic-suite/ui";
import { RiLoader4Line, RiAlertLine, RiCheckLine, RiInformationLine } from "@remixicon/react";
import {
  validateSignupPolicy,
  type SignupPolicyFormValues,
} from "../logic/validation";

export type { SignupPolicyFormValues } from "../logic/validation";

interface SignupPolicyStepProps {
  initialValues?: Partial<SignupPolicyFormValues>;
  isLoading?: boolean;
  isSaving?: boolean;
  serverErrors?: Record<string, string>;
  generalError?: string | null;
  onSave: (values: SignupPolicyFormValues) => Promise<boolean>;
  onNext: () => void;
  onBack: () => void;
  onDirtyChange?: (isDirty: boolean) => void;
}

export function SignupPolicyStep({
  initialValues,
  isLoading = false,
  isSaving = false,
  serverErrors = {},
  generalError = null,
  onSave,
  onNext,
  onBack,
  onDirtyChange,
}: SignupPolicyStepProps) {
  const [studentSelfReg, setStudentSelfReg] = React.useState<boolean>(
    initialValues?.student_self_registration_enabled ?? false
  );
  const [parentSelfReg, setParentSelfReg] = React.useState<boolean>(
    initialValues?.parent_self_registration_enabled ?? false
  );
  const [approvalMode, setApprovalMode] = React.useState<"manual" | "auto">(
    initialValues?.approval_mode ?? "manual"
  );

  const [clientErrors, setClientErrors] = React.useState<Record<string, string>>({});
  const [saveSuccess, setSaveSuccess] = React.useState(false);

  React.useEffect(() => {
    if (initialValues) {
      if (initialValues.student_self_registration_enabled !== undefined) {
        setStudentSelfReg(initialValues.student_self_registration_enabled);
      }
      if (initialValues.parent_self_registration_enabled !== undefined) {
        setParentSelfReg(initialValues.parent_self_registration_enabled);
      }
      if (initialValues.approval_mode !== undefined) {
        setApprovalMode(initialValues.approval_mode);
      }
    }
  }, [initialValues]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveSuccess(false);

    const values: SignupPolicyFormValues = {
      student_self_registration_enabled: studentSelfReg,
      parent_self_registration_enabled: parentSelfReg,
      approval_mode: approvalMode,
    };

    const errors = validateSignupPolicy(values);
    if (Object.keys(errors).length > 0) {
      setClientErrors(errors);
      return;
    }

    setClientErrors({});
    const success = await onSave(values);
    if (success) {
      setSaveSuccess(true);
      onDirtyChange?.(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          Sign-up &amp; Registration Policy
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Configure admission and public registration rules for students and parents.
        </p>
      </div>

      {/* Visible callout note per ADR-0016 / prompt item 9 */}
      <Alert className="border-border bg-muted/30">
        <RiInformationLine className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <AlertTitle className="text-foreground">Inert Configuration Notice</AlertTitle>
        <AlertDescription className="text-xs text-muted-foreground">
          These settings establish initial policy preferences and take effect only when the
          Self-Registration and Registration Queue module ships in a future release.
        </AlertDescription>
      </Alert>

      {generalError && (
        <Alert variant="destructive">
          <RiAlertLine className="size-4 shrink-0" aria-hidden="true" />
          <AlertTitle>Policy Configuration Error</AlertTitle>
          <AlertDescription>{generalError}</AlertDescription>
        </Alert>
      )}

      {saveSuccess && (
        <Alert className="border-primary/30 bg-primary/5 text-primary">
          <RiCheckLine className="size-4 shrink-0 text-primary" aria-hidden="true" />
          <AlertTitle className="text-foreground">Policy Saved</AlertTitle>
          <AlertDescription className="text-muted-foreground">
            Sign-up policy has been saved. You can proceed to Review and Finish.
          </AlertDescription>
        </Alert>
      )}

      {/* TOGGLE 1: STUDENT REGISTRATION */}
      <div className="border border-border rounded-xl p-5 bg-card space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="student-reg-toggle" className="text-base font-semibold text-foreground cursor-pointer">
              Student Self-Registration
            </Label>
            <p className="text-xs text-muted-foreground">
              Allow prospective or admitted students to submit self-registration requests online.
            </p>
          </div>
          <Switch
            id="student-reg-toggle"
            checked={studentSelfReg}
            onCheckedChange={(checked) => {
              setStudentSelfReg(checked);
              onDirtyChange?.(true);
              setSaveSuccess(false);
            }}
            disabled={isSaving}
          />
        </div>
      </div>

      {/* TOGGLE 2: PARENT REGISTRATION */}
      <div className="border border-border rounded-xl p-5 bg-card space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="parent-reg-toggle" className="text-base font-semibold text-foreground cursor-pointer">
              Parent &amp; Guardian Self-Registration
            </Label>
            <p className="text-xs text-muted-foreground">
              Allow parents or legal guardians to register portal accounts linked to student handles.
            </p>
          </div>
          <Switch
            id="parent-reg-toggle"
            checked={parentSelfReg}
            onCheckedChange={(checked) => {
              setParentSelfReg(checked);
              onDirtyChange?.(true);
              setSaveSuccess(false);
            }}
            disabled={isSaving}
          />
        </div>
      </div>

      {/* APPROVAL MODE */}
      <div className="border border-border rounded-xl p-5 bg-card space-y-4">
        <div>
          <Label className="text-base font-semibold text-foreground">
            Registration Approval Mode
          </Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            Determine how submitted self-registrations are verified prior to account provisioning.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
          <button
            type="button"
            onClick={() => {
              setApprovalMode("manual");
              onDirtyChange?.(true);
              setSaveSuccess(false);
            }}
            disabled={isSaving}
            className={`p-4 rounded-lg border text-left transition-all ${
              approvalMode === "manual"
                ? "border-primary bg-primary/5 ring-1 ring-primary"
                : "border-border bg-muted/20 hover:bg-muted/40"
            }`}
          >
            <div className="font-semibold text-sm text-foreground">Manual Verification (Default)</div>
            <div className="text-xs text-muted-foreground mt-1">
              Registrations require administrative review by designated institutional staff before
              activating credentials.
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              setApprovalMode("auto");
              onDirtyChange?.(true);
              setSaveSuccess(false);
            }}
            disabled={isSaving}
            className={`p-4 rounded-lg border text-left transition-all ${
              approvalMode === "auto"
                ? "border-primary bg-primary/5 ring-1 ring-primary"
                : "border-border bg-muted/20 hover:bg-muted/40"
            }`}
          >
            <div className="font-semibold text-sm text-foreground">Automatic Provisioning</div>
            <div className="text-xs text-muted-foreground mt-1">
              Registrations matching verified student roll records are automatically activated
              with immediate credential dispatch.
            </div>
          </button>
        </div>

        {(clientErrors.approval_mode || serverErrors.approval_mode) && (
          <p className="text-xs text-destructive font-medium" role="alert">
            {clientErrors.approval_mode || serverErrors.approval_mode}
          </p>
        )}
      </div>

      {/* FOOTER ACTIONS */}
      <div className="flex items-center justify-between border-t border-border pt-4">
        <Button type="button" variant="outline" onClick={onBack}>
          ← Back to Calendar
        </Button>
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={isSaving}>
            {isSaving ? (
              <>
                <RiLoader4Line className="size-4 animate-spin mr-2" aria-hidden="true" />
                Saving...
              </>
            ) : (
              "Save Policy"
            )}
          </Button>
          <Button type="button" variant="outline" onClick={onNext}>
            Next Step: Review &amp; Finish →
          </Button>
        </div>
      </div>
    </form>
  );
}

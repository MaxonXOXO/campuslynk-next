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
import { RiLoader4Line, RiAlertLine, RiInformationLine } from "@remixicon/react";
import {
  validateSignupPolicy,
  type SignupPolicyFormValues,
} from "../logic/validation";
import { useStepForm } from "../logic/use-step-form";

export type { SignupPolicyFormValues } from "../logic/validation";

interface SignupPolicyStepProps {
  initialValues?: Partial<SignupPolicyFormValues>;
  isLoading?: boolean;
  isSaving?: boolean;
  isPersisted?: boolean;
  navigationDisabled?: boolean;
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
  isPersisted = false,
  navigationDisabled = false,
  serverErrors = {},
  generalError = null,
  onSave,
  onNext,
  onBack,
  onDirtyChange,
}: SignupPolicyStepProps) {
  const initialFormValues = React.useMemo<SignupPolicyFormValues>(() => ({
    student_self_registration_enabled: initialValues?.student_self_registration_enabled ?? false,
    parent_self_registration_enabled: initialValues?.parent_self_registration_enabled ?? false,
    approval_mode: initialValues?.approval_mode ?? "manual",
  }), [initialValues]);
  const { values, setValues, isDirty, markSaved } = useStepForm(
    initialFormValues, isPersisted, onDirtyChange
  );
  const {
    student_self_registration_enabled: studentSelfReg,
    parent_self_registration_enabled: parentSelfReg,
    approval_mode: approvalMode,
  } = values;
  const submitting = React.useRef(false);

  const [clientErrors, setClientErrors] = React.useState<Record<string, string>>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving || navigationDisabled || submitting.current) return;
    if (!isDirty) {
      onNext();
      return;
    }

    const errors = validateSignupPolicy(values);
    if (Object.keys(errors).length > 0) {
      setClientErrors(errors);
      return;
    }

    setClientErrors({});
    submitting.current = true;
    try {
      if (await onSave(values)) {
        markSaved(values);
        onNext();
      }
    } finally {
      submitting.current = false;
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
    <form onSubmit={handleSubmit} noValidate className="space-y-8">
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
            onCheckedChange={(checked) => setValues((prev) => ({
              ...prev, student_self_registration_enabled: checked,
            }))}
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
            onCheckedChange={(checked) => setValues((prev) => ({
              ...prev, parent_self_registration_enabled: checked,
            }))}
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
          <Button
            type="button"
            variant="outline"
            onClick={() => setValues((prev) => ({ ...prev, approval_mode: "manual" }))}
            disabled={isSaving}
            aria-pressed={approvalMode === "manual"}
            className={`h-auto flex-col items-start gap-1 whitespace-normal p-4 rounded-lg border text-left transition-all ${
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
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={() => setValues((prev) => ({ ...prev, approval_mode: "auto" }))}
            disabled={isSaving}
            aria-pressed={approvalMode === "auto"}
            className={`h-auto flex-col items-start gap-1 whitespace-normal p-4 rounded-lg border text-left transition-all ${
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
          </Button>
        </div>

        {(clientErrors.approval_mode || serverErrors.approval_mode) && (
          <p className="text-xs text-destructive font-medium" role="alert">
            {clientErrors.approval_mode || serverErrors.approval_mode}
          </p>
        )}
      </div>

      {/* FOOTER ACTIONS */}
      <div className="flex items-center justify-between border-t border-border pt-4">
        <Button type="button" variant="outline" onClick={onBack} disabled={isSaving || navigationDisabled}>
          ← Back to Calendar
        </Button>
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={isSaving || navigationDisabled}>
            {isSaving ? (
              <>
                <RiLoader4Line className="size-4 animate-spin mr-2" aria-hidden="true" />
                Saving...
              </>
            ) : (
              isDirty ? "Save & Continue" : "Continue"
            )}
          </Button>
        </div>
      </div>
    </form>
  );
}

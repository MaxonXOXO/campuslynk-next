"use client";

import * as React from "react";
import {
  Alert,
  AlertDescription,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Textarea,
} from "@academic-suite/ui";
import { RiAlertLine, RiLoader4Line } from "@remixicon/react";

export const AUDITED_REASON_MIN_LENGTH = 5;
export const AUDITED_REASON_MAX_LENGTH = 500;

export function validateAuditedReason(
  reason: string,
  errorMessage = "Reason must be between 5 and 500 characters."
): string | null {
  const trimmed = reason.trim();
  if (
    trimmed.length < AUDITED_REASON_MIN_LENGTH ||
    trimmed.length > AUDITED_REASON_MAX_LENGTH
  ) {
    return errorMessage;
  }
  return null;
}

export interface AuditedReasonFieldProps {
  id?: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string | null;
  errorId?: string;
  helperText?: string;
  disabled?: boolean;
  rows?: number;
}

export function AuditedReasonField({
  id = "audited-reason",
  label = "Reason",
  value,
  onChange,
  placeholder = "Describe why this change is being made (5-500 characters)",
  error,
  errorId = `${id}-error`,
  helperText,
  disabled = false,
  rows = 3,
}: AuditedReasonFieldProps) {
  const helperId = helperText ? `${id}-helper` : undefined;
  const describedBy =
    [error ? errorId : undefined, helperId].filter(Boolean).join(" ") ||
    undefined;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        maxLength={AUDITED_REASON_MAX_LENGTH}
        disabled={disabled}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
      />
      {helperText && (
        <p id={helperId} className="text-xs text-muted-foreground">
          {helperText}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export interface AuditedReasonOption {
  id: string;
  label: string;
  description?: string;
}

export interface AuditedReasonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  notice?: string;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  reasonHelperText?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: "default" | "destructive";
  options?: AuditedReasonOption[];
  optionsLabel?: string;
  defaultSelectedOptions?: string[];
  requireAtLeastOneOption?: boolean;
  onConfirm: (payload: {
    reason: string;
    selectedOptions: string[];
  }) => Promise<void> | void;
}

export function AuditedReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  notice,
  reasonLabel = "Reason",
  reasonPlaceholder,
  reasonHelperText,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  confirmVariant = "default",
  options,
  optionsLabel = "Select items",
  defaultSelectedOptions,
  requireAtLeastOneOption = false,
  onConfirm,
}: AuditedReasonDialogProps) {
  const [reason, setReason] = React.useState("");
  const [selectedOptions, setSelectedOptions] = React.useState<string[]>(
    defaultSelectedOptions ?? []
  );
  const [reasonError, setReasonError] = React.useState<string | null>(null);
  const [optionsError, setOptionsError] = React.useState<string | null>(null);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setReason("");
      setSelectedOptions(defaultSelectedOptions ?? []);
      setReasonError(null);
      setOptionsError(null);
      setSubmitError(null);
      setSubmitting(false);
    }
  }, [open, defaultSelectedOptions]);

  function toggleOption(id: string) {
    setSelectedOptions((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
    setOptionsError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const nextReasonError = validateAuditedReason(reason);
    const nextOptionsError =
      options && options.length > 0 && requireAtLeastOneOption && selectedOptions.length === 0
        ? "Select at least one section to continue."
        : null;

    if (nextReasonError || nextOptionsError) {
      setReasonError(nextReasonError);
      setOptionsError(nextOptionsError);
      return;
    }

    setSubmitting(true);
    setReasonError(null);
    setOptionsError(null);
    setSubmitError(null);

    try {
      await onConfirm({
        reason: reason.trim(),
        selectedOptions,
      });
    } catch (err: unknown) {
      const message =
        err instanceof Error && err.message
          ? err.message
          : "Could not complete this audited action.";
      setSubmitError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!submitting) {
          onOpenChange(nextOpen);
        }
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          {submitError && (
            <Alert variant="destructive">
              <RiAlertLine className="size-4" aria-hidden="true" />
              <AlertDescription>{submitError}</AlertDescription>
            </Alert>
          )}

          {notice && (
            <div className="rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
              {notice}
            </div>
          )}

          {options && options.length > 0 && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-foreground">
                {optionsLabel}
              </legend>
              <div className="space-y-2">
                {options.map((option) => {
                  const checked = selectedOptions.includes(option.id);
                  const checkboxId = `audited-option-${option.id}`;
                  return (
                    <label
                      key={option.id}
                      htmlFor={checkboxId}
                      className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:bg-muted/40"
                    >
                      <Checkbox
                        id={checkboxId}
                        checked={checked}
                        onCheckedChange={() => toggleOption(option.id)}
                        disabled={submitting}
                        className="mt-0.5"
                      />
                      <span className="space-y-0.5">
                        <span className="block text-sm font-medium text-foreground">
                          {option.label}
                        </span>
                        {option.description && (
                          <span className="block text-xs text-muted-foreground">
                            {option.description}
                          </span>
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>
              {optionsError && (
                <p className="text-xs text-destructive">{optionsError}</p>
              )}
            </fieldset>
          )}

          <AuditedReasonField
            id="audited-reason-input"
            label={reasonLabel}
            value={reason}
            onChange={(value) => {
              setReason(value);
              if (reasonError) {
                setReasonError(null);
              }
            }}
            placeholder={reasonPlaceholder}
            helperText={reasonHelperText}
            error={reasonError}
            disabled={submitting}
          />

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              {cancelLabel}
            </Button>
            <Button type="submit" variant={confirmVariant} disabled={submitting}>
              {submitting && (
                <RiLoader4Line className="size-4 animate-spin" aria-hidden="true" />
              )}
              {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}


"use client";

import * as React from "react";
import {
  Button,
  Input,
  Label,
  Alert,
  AlertTitle,
  AlertDescription,
  Skeleton,
} from "@academic-suite/ui";
import { RiLoader4Line, RiAlertLine } from "@remixicon/react";
import {
  validateInstitutionProfile,
  type InstitutionProfileFormValues,
} from "../logic/validation";
import { useStepForm } from "../logic/use-step-form";

interface InstitutionProfileStepProps {
  initialValues?: Partial<InstitutionProfileFormValues>;
  isLoading?: boolean;
  isSaving?: boolean;
  isPersisted?: boolean;
  navigationDisabled?: boolean;
  serverErrors?: Record<string, string>;
  generalError?: string | null;
  onSave: (values: InstitutionProfileFormValues) => Promise<boolean>;
  onNext: () => void;
  onDirtyChange?: (isDirty: boolean) => void;
}

export function InstitutionProfileStep({
  initialValues,
  isLoading = false,
  isSaving = false,
  isPersisted = false,
  navigationDisabled = false,
  serverErrors = {},
  generalError = null,
  onSave,
  onNext,
  onDirtyChange,
}: InstitutionProfileStepProps) {
  const initialFormValues = React.useMemo<InstitutionProfileFormValues>(() => ({
    name: initialValues?.name || "",
    short_code: initialValues?.short_code || "",
    board: initialValues?.board || "",
    board_code: initialValues?.board_code || "",
    affiliation: initialValues?.affiliation || "",
    affiliation_code: initialValues?.affiliation_code || "",
    contact_email: initialValues?.contact_email || "",
    contact_phone: initialValues?.contact_phone || "",
    address_line1: initialValues?.address_line1 || "",
    address_line2: initialValues?.address_line2 || "",
    city: initialValues?.city || "",
    state: initialValues?.state || "",
    postal_code: initialValues?.postal_code || "",
    website: initialValues?.website || "",
  }), [initialValues]);
  const { values, setValues, isDirty, markSaved } = useStepForm(
    initialFormValues, isPersisted, onDirtyChange
  );
  const submitting = React.useRef(false);

  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  const handleChange = (field: keyof InstitutionProfileFormValues, value: string) => {
    setValues((prev) => {
      const next = { ...prev, [field]: value };
      return next;
    });
    if (fieldErrors[field] || serverErrors[field]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving || navigationDisabled || submitting.current) return;
    if (!isDirty) {
      onNext();
      return;
    }

    // Client-side validation
    const errors = validateInstitutionProfile(values);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
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

  const getFieldError = (field: keyof InstitutionProfileFormValues): string | undefined => {
    return fieldErrors[field] || serverErrors[field];
  };

  if (isLoading) {
    return (
      <div className="space-y-6 p-6" aria-label="Loading profile step">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          Institution Profile
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Provide canonical institution identification and contact details. Required fields
          are indicated.
        </p>
      </div>

      {generalError && (
        <Alert variant="destructive" className="border-destructive/30">
          <RiAlertLine className="size-4 shrink-0" aria-hidden="true" />
          <AlertTitle>Configuration Error</AlertTitle>
          <AlertDescription>{generalError}</AlertDescription>
        </Alert>
      )}

      {/* Primary Details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="inst-name" className="text-sm font-medium">
            Institution Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="inst-name"
            name="name"
            value={values.name}
            onChange={(e) => handleChange("name", e.target.value)}
            placeholder="Institution Name"
            aria-invalid={Boolean(getFieldError("name"))}
            aria-describedby={getFieldError("name") ? "inst-name-error" : undefined}
            disabled={isSaving}
          />
          {getFieldError("name") && (
            <p id="inst-name-error" className="text-xs text-destructive font-medium" role="alert">
              {getFieldError("name")}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="inst-short-code" className="text-sm font-medium">
            Short Code <span className="text-destructive">*</span>
          </Label>
          <Input
            id="inst-short-code"
            name="short_code"
            value={values.short_code}
            onChange={(e) => handleChange("short_code", e.target.value)}
            placeholder="INST"
            aria-invalid={Boolean(getFieldError("short_code"))}
            aria-describedby={getFieldError("short_code") ? "inst-short-code-error" : undefined}
            disabled={isSaving}
          />
          {getFieldError("short_code") && (
            <p id="inst-short-code-error" className="text-xs text-destructive font-medium" role="alert">
              {getFieldError("short_code")}
            </p>
          )}
        </div>
      </div>

      {/* Affiliation / Board */}
      <div className="border-t border-border pt-4">
        <h3 className="text-sm font-semibold text-foreground mb-3">
          Board &amp; Affiliation
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="inst-board" className="text-sm font-medium">
              Board / Regulatory Authority
            </Label>
            <Input
              id="inst-board"
              name="board"
              value={values.board || ""}
              onChange={(e) => handleChange("board", e.target.value)}
              placeholder="State Technical Education Board"
              aria-invalid={Boolean(getFieldError("board"))}
              aria-describedby={getFieldError("board") ? "inst-board-error" : undefined}
              disabled={isSaving}
            />
            {getFieldError("board") && (
              <p id="inst-board-error" className="text-xs text-destructive font-medium" role="alert">
                {getFieldError("board")}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="inst-board-code" className="text-sm font-medium">
              Board Code
            </Label>
            <Input
              id="inst-board-code"
              name="board_code"
              value={values.board_code || ""}
              onChange={(e) => handleChange("board_code", e.target.value)}
              placeholder="BRD-001"
              aria-invalid={Boolean(getFieldError("board_code"))}
              aria-describedby={getFieldError("board_code") ? "inst-board-code-error" : undefined}
              disabled={isSaving}
            />
            {getFieldError("board_code") && (
              <p id="inst-board-code-error" className="text-xs text-destructive font-medium" role="alert">
                {getFieldError("board_code")}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="inst-affiliation" className="text-sm font-medium">
              Affiliation Body
            </Label>
            <Input
              id="inst-affiliation"
              name="affiliation"
              value={values.affiliation || ""}
              onChange={(e) => handleChange("affiliation", e.target.value)}
              placeholder="Technical University / Directorate"
              aria-invalid={Boolean(getFieldError("affiliation"))}
              aria-describedby={getFieldError("affiliation") ? "inst-affiliation-error" : undefined}
              disabled={isSaving}
            />
            {getFieldError("affiliation") && (
              <p id="inst-affiliation-error" className="text-xs text-destructive font-medium" role="alert">
                {getFieldError("affiliation")}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="inst-affiliation-code" className="text-sm font-medium">
              Affiliation Code
            </Label>
            <Input
              id="inst-affiliation-code"
              name="affiliation_code"
              value={values.affiliation_code || ""}
              onChange={(e) => handleChange("affiliation_code", e.target.value)}
              placeholder="AFF-001"
              aria-invalid={Boolean(getFieldError("affiliation_code"))}
              aria-describedby={getFieldError("affiliation_code") ? "inst-affiliation-code-error" : undefined}
              disabled={isSaving}
            />
            {getFieldError("affiliation_code") && (
              <p id="inst-affiliation-code-error" className="text-xs text-destructive font-medium" role="alert">
                {getFieldError("affiliation_code")}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Contact & Web */}
      <div className="border-t border-border pt-4">
        <h3 className="text-sm font-semibold text-foreground mb-3">
          Contact &amp; Online Presence
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="inst-email" className="text-sm font-medium">
              Official Email
            </Label>
            <Input
              id="inst-email"
              type="email"
              name="contact_email"
              value={values.contact_email || ""}
              onChange={(e) => handleChange("contact_email", e.target.value)}
              placeholder="principal@institution.edu"
              aria-invalid={Boolean(getFieldError("contact_email"))}
              aria-describedby={getFieldError("contact_email") ? "inst-email-error" : undefined}
              disabled={isSaving}
            />
            {getFieldError("contact_email") && (
              <p id="inst-email-error" className="text-xs text-destructive font-medium" role="alert">
                {getFieldError("contact_email")}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="inst-phone" className="text-sm font-medium">
              Contact Phone
            </Label>
            <Input
              id="inst-phone"
              name="contact_phone"
              value={values.contact_phone || ""}
              onChange={(e) => handleChange("contact_phone", e.target.value)}
              placeholder="+91 00000 00000"
              aria-invalid={Boolean(getFieldError("contact_phone"))}
              aria-describedby={getFieldError("contact_phone") ? "inst-phone-error" : undefined}
              disabled={isSaving}
            />
            {getFieldError("contact_phone") && (
              <p id="inst-phone-error" className="text-xs text-destructive font-medium" role="alert">
                {getFieldError("contact_phone")}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="inst-website" className="text-sm font-medium">
              Website URL
            </Label>
            <Input
              id="inst-website"
              name="website"
              value={values.website || ""}
              onChange={(e) => handleChange("website", e.target.value)}
              placeholder="https://institution.edu"
              aria-invalid={Boolean(getFieldError("website"))}
              aria-describedby={getFieldError("website") ? "inst-website-error" : undefined}
              disabled={isSaving}
            />
            {getFieldError("website") && (
              <p id="inst-website-error" className="text-xs text-destructive font-medium" role="alert">
                {getFieldError("website")}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Address */}
      <div className="border-t border-border pt-4">
        <h3 className="text-sm font-semibold text-foreground mb-3">
          Location Address
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="inst-addr1" className="text-sm font-medium">
              Address Line 1
            </Label>
            <Input
              id="inst-addr1"
              name="address_line1"
              value={values.address_line1 || ""}
              onChange={(e) => handleChange("address_line1", e.target.value)}
              placeholder="Campus Road / Sector"
              aria-invalid={Boolean(getFieldError("address_line1"))}
              aria-describedby={getFieldError("address_line1") ? "inst-addr1-error" : undefined}
              disabled={isSaving}
            />
            {getFieldError("address_line1") && (
              <p id="inst-addr1-error" className="text-xs text-destructive font-medium" role="alert">
                {getFieldError("address_line1")}
              </p>
            )}
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="inst-addr2" className="text-sm font-medium">
              Address Line 2
            </Label>
            <Input
              id="inst-addr2"
              name="address_line2"
              value={values.address_line2 || ""}
              onChange={(e) => handleChange("address_line2", e.target.value)}
              placeholder="Post / Area"
              aria-invalid={Boolean(getFieldError("address_line2"))}
              aria-describedby={getFieldError("address_line2") ? "inst-addr2-error" : undefined}
              disabled={isSaving}
            />
            {getFieldError("address_line2") && (
              <p id="inst-addr2-error" className="text-xs text-destructive font-medium" role="alert">
                {getFieldError("address_line2")}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="inst-city" className="text-sm font-medium">
              City
            </Label>
            <Input
              id="inst-city"
              name="city"
              value={values.city || ""}
              onChange={(e) => handleChange("city", e.target.value)}
              placeholder="City"
              aria-invalid={Boolean(getFieldError("city"))}
              aria-describedby={getFieldError("city") ? "inst-city-error" : undefined}
              disabled={isSaving}
            />
            {getFieldError("city") && (
              <p id="inst-city-error" className="text-xs text-destructive font-medium" role="alert">
                {getFieldError("city")}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="inst-state" className="text-sm font-medium">
              State / Province
            </Label>
            <Input
              id="inst-state"
              name="state"
              value={values.state || ""}
              onChange={(e) => handleChange("state", e.target.value)}
              placeholder="State"
              aria-invalid={Boolean(getFieldError("state"))}
              aria-describedby={getFieldError("state") ? "inst-state-error" : undefined}
              disabled={isSaving}
            />
            {getFieldError("state") && (
              <p id="inst-state-error" className="text-xs text-destructive font-medium" role="alert">
                {getFieldError("state")}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="inst-postal" className="text-sm font-medium">
              Postal Code
            </Label>
            <Input
              id="inst-postal"
              name="postal_code"
              value={values.postal_code || ""}
              onChange={(e) => handleChange("postal_code", e.target.value)}
              placeholder="000000"
              aria-invalid={Boolean(getFieldError("postal_code"))}
              aria-describedby={getFieldError("postal_code") ? "inst-postal-error" : undefined}
              disabled={isSaving}
            />
            {getFieldError("postal_code") && (
              <p id="inst-postal-error" className="text-xs text-destructive font-medium" role="alert">
                {getFieldError("postal_code")}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Action Footer */}
      <div className="flex items-center justify-between border-t border-border pt-4">
        <div className="text-xs text-muted-foreground">
          Step 1 of 5 • Profile settings
        </div>
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

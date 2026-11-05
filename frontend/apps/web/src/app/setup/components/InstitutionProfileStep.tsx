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
import { RiLoader4Line, RiAlertLine, RiCheckLine } from "@remixicon/react";
import {
  validateInstitutionProfile,
  type InstitutionProfileFormValues,
} from "../logic/validation";

interface InstitutionProfileStepProps {
  initialValues?: Partial<InstitutionProfileFormValues>;
  isLoading?: boolean;
  isSaving?: boolean;
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
  serverErrors = {},
  generalError = null,
  onSave,
  onNext,
  onDirtyChange,
}: InstitutionProfileStepProps) {
  const [values, setValues] = React.useState<InstitutionProfileFormValues>({
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
  });

  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [saveSuccess, setSaveSuccess] = React.useState(false);

  // Synchronize when initialValues arrive asynchronously
  React.useEffect(() => {
    if (initialValues) {
      setValues((prev) => ({
        ...prev,
        ...initialValues,
      }));
    }
  }, [initialValues]);

  const handleChange = (field: keyof InstitutionProfileFormValues, value: string) => {
    setValues((prev) => {
      const next = { ...prev, [field]: value };
      return next;
    });
    onDirtyChange?.(true);
    setSaveSuccess(false);

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
    setSaveSuccess(false);

    // Client-side validation
    const errors = validateInstitutionProfile(values);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    const success = await onSave(values);
    if (success) {
      setSaveSuccess(true);
      onDirtyChange?.(false);
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
    <form onSubmit={handleSubmit} className="space-y-6">
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

      {saveSuccess && (
        <Alert className="border-primary/30 bg-primary/5 text-primary">
          <RiCheckLine className="size-4 shrink-0 text-primary" aria-hidden="true" />
          <AlertTitle className="text-foreground">Settings Saved</AlertTitle>
          <AlertDescription className="text-muted-foreground">
            Institution profile has been saved. You can proceed to Organisation Basics or
            review other steps.
          </AlertDescription>
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
              disabled={isSaving}
            />
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
              disabled={isSaving}
            />
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
              disabled={isSaving}
            />
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
              disabled={isSaving}
            />
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
              disabled={isSaving}
            />
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
              disabled={isSaving}
            />
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
              disabled={isSaving}
            />
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
              disabled={isSaving}
            />
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
              disabled={isSaving}
            />
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
              disabled={isSaving}
            />
          </div>
        </div>
      </div>

      {/* Action Footer */}
      <div className="flex items-center justify-between border-t border-border pt-4">
        <div className="text-xs text-muted-foreground">
          Step 1 of 5 • Profile settings
        </div>
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={isSaving}>
            {isSaving ? (
              <>
                <RiLoader4Line className="size-4 animate-spin mr-2" aria-hidden="true" />
                Saving...
              </>
            ) : (
              "Save Profile"
            )}
          </Button>
          <Button type="button" variant="outline" onClick={onNext}>
            Next Step →
          </Button>
        </div>
      </div>
    </form>
  );
}


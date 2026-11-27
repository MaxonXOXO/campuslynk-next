"use client";

import * as React from "react";
import { ApiError } from "@academic-suite/api-client";
import {
  Alert,
  AlertDescription,
  Avatar,
  AvatarFallback,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Skeleton,
} from "@academic-suite/ui";
import { RiAlertLine, RiCheckLine, RiLoader4Line } from "@remixicon/react";
import { toast } from "sonner";
import { useApiClient, useSession } from "@/lib/auth/session-provider";
import { getProfileInitials } from "@/lib/profile/initials";

function normalizeNameInput(raw: string): string | null {
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

export function PersonalInfoSection() {
  const client = useApiClient();
  const { controller, state } = useSession();
  const user = state.user;

  const [firstName, setFirstName] = React.useState(user?.first_name ?? "");
  const [lastName, setLastName] = React.useState(user?.last_name ?? "");
  const [saving, setSaving] = React.useState(false);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [savedNotice, setSavedNotice] = React.useState<string | null>(null);
  const errorRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    setFirstName(user?.first_name ?? "");
    setLastName(user?.last_name ?? "");
  }, [user?.first_name, user?.last_name]);

  React.useEffect(() => {
    if (formError) {
      errorRef.current?.focus();
    }
  }, [formError]);

  if (state.status === "loading" || !user) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;

    setSaving(true);
    setFieldErrors({});
    setFormError(null);
    setSavedNotice(null);

    try {
      await client.auth.updateMe({
        first_name: normalizeNameInput(firstName),
        last_name: normalizeNameInput(lastName),
      });
      await controller.bootstrap();
      const message = "Personal information updated.";
      setSavedNotice(message);
      toast.success(message);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        const nextFieldErrors: Record<string, string> = {};
        const errors = err.problem.errors;
        if (errors && typeof errors === "object") {
          for (const [key, messages] of Object.entries(errors)) {
            if (Array.isArray(messages) && typeof messages[0] === "string") {
              nextFieldErrors[key] = messages[0];
            }
          }
        }
        setFieldErrors(nextFieldErrors);
        setFormError(
          err.problem.detail || err.problem.title || "Could not update personal information."
        );
      } else {
        setFormError("Could not update personal information. Please try again.");
      }
    } finally {
      setSaving(false);
    }
  }

  const initials = getProfileInitials(firstName || user.first_name, lastName || user.last_name, user.name);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Avatar</CardTitle>
          <CardDescription>
            Your initials are shown across the workspace header and directories.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-4">
          <Avatar className="size-14 text-base">
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">
              {user.name ?? "Signed-in user"}
            </p>
            <p className="text-xs text-muted-foreground">
              Profile photo upload is coming later.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Personal information</CardTitle>
          <CardDescription>
            Update your preferred first and last name used in greetings and avatar initials.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5" noValidate>
            {formError && (
              <div ref={errorRef} tabIndex={-1} className="outline-none">
                <Alert variant="destructive">
                  <RiAlertLine className="size-4" aria-hidden="true" />
                  <AlertDescription>{formError}</AlertDescription>
                </Alert>
              </div>
            )}

            {savedNotice && (
              <div role="status" aria-live="polite">
                <Alert>
                  <RiCheckLine className="size-4" aria-hidden="true" />
                  <AlertDescription>{savedNotice}</AlertDescription>
                </Alert>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="profile-first-name">First name</Label>
                <Input
                  id="profile-first-name"
                  name="first_name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  maxLength={100}
                  disabled={saving}
                  aria-invalid={Boolean(fieldErrors.first_name)}
                  aria-describedby={
                    fieldErrors.first_name ? "profile-first-name-error" : undefined
                  }
                />
                {fieldErrors.first_name && (
                  <p id="profile-first-name-error" className="text-xs text-destructive">
                    {fieldErrors.first_name}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="profile-last-name">Last name</Label>
                <Input
                  id="profile-last-name"
                  name="last_name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  maxLength={100}
                  disabled={saving}
                  aria-invalid={Boolean(fieldErrors.last_name)}
                  aria-describedby={
                    fieldErrors.last_name ? "profile-last-name-error" : undefined
                  }
                />
                {fieldErrors.last_name && (
                  <p id="profile-last-name-error" className="text-xs text-destructive">
                    {fieldErrors.last_name}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 border-t border-border pt-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="profile-full-name">Full name</Label>
                <Input
                  id="profile-full-name"
                  value={user.name ?? ""}
                  readOnly
                  disabled
                  aria-describedby="profile-full-name-help"
                />
                <p id="profile-full-name-help" className="text-xs text-muted-foreground">
                  Managed by your institution administrator
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="profile-reg-no">Registration number</Label>
                <Input
                  id="profile-reg-no"
                  value={user.registration_number ?? "—"}
                  readOnly
                  disabled
                  aria-describedby="profile-reg-no-help"
                />
                <p id="profile-reg-no-help" className="text-xs text-muted-foreground">
                  Managed by your institution administrator
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="profile-email">Email</Label>
                <Input
                  id="profile-email"
                  value={user.email ?? "—"}
                  readOnly
                  disabled
                  aria-describedby="profile-email-help"
                />
                <p id="profile-email-help" className="text-xs text-muted-foreground">
                  Email and mobile changes need verification, coming soon
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="profile-mobile">Mobile</Label>
                <Input
                  id="profile-mobile"
                  value={user.mobile ?? "—"}
                  readOnly
                  disabled
                  aria-describedby="profile-mobile-help"
                />
                <p id="profile-mobile-help" className="text-xs text-muted-foreground">
                  Email and mobile changes need verification, coming soon
                </p>
              </div>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={saving}>
                {saving && (
                  <RiLoader4Line className="size-4 animate-spin" aria-hidden="true" />
                )}
                Save changes
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}


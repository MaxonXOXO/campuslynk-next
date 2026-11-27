"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  AlertDescription,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  Input,
  Label,
} from "@academic-suite/ui";
import { RiCheckLine } from "@remixicon/react";
import { toast } from "sonner";
import { useSession } from "@/lib/auth/session-provider";
import { authStrings, passwordFailureMessage } from "@/lib/auth/strings";

export interface ChangePasswordFormProps {
  mode?: "forced" | "profile";
}

export function ChangePasswordForm({ mode }: ChangePasswordFormProps) {
  const router = useRouter();
  const { controller, state } = useSession();
  const resolvedMode =
    mode ?? (state.status === "must_change_password" ? "forced" : "profile");
  const isForced = resolvedMode === "forced";
  const isMustChange = state.status === "must_change_password";
  const copy = authStrings.changePassword;

  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [revokeOtherSessions, setRevokeOtherSessions] = React.useState(true);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [successNotice, setSuccessNotice] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const errorRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (formError) errorRef.current?.focus();
  }, [formError]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const errors: Record<string, string> = {};
    if (current === "") errors.current_password = copy.requiredCurrent;
    if (next !== confirm) errors.confirm = copy.mismatch;
    setFieldErrors(errors);
    setFormError(null);
    setSuccessNotice(null);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    const outcome = isForced
      ? await controller.changePassword(current, next)
      : await controller.changePassword(current, next, revokeOtherSessions);
    setSubmitting(false);

    if (outcome.ok) {
      setCurrent("");
      setNext("");
      setConfirm("");
      if (isForced) {
        router.replace(outcome.route);
      } else {
        const message = "Password updated successfully.";
        setSuccessNotice(message);
        toast.success(message);
      }
      return;
    }

    setFieldErrors(outcome.error.fields);
    setFormError(passwordFailureMessage(outcome.error));
    setCurrent("");
  }

  return (
    <Card className={isForced ? "w-full max-w-md border-border shadow-sm" : undefined}>
      <CardHeader>
        <CardTitle className={isForced ? "text-2xl font-bold tracking-tight" : "text-base"}>
          {isForced ? copy.titleForced : copy.titleVoluntary}
        </CardTitle>
        <CardDescription>
          {isForced ? copy.descriptionForced : copy.descriptionVoluntary}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          {formError && (
            <div ref={errorRef} tabIndex={-1} className="outline-none">
              <Alert variant="destructive">
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            </div>
          )}

          {successNotice && (
            <div role="status" aria-live="polite">
              <Alert>
                <RiCheckLine className="size-4" aria-hidden="true" />
                <AlertDescription>{successNotice}</AlertDescription>
              </Alert>
            </div>
          )}

          <PasswordField
            id="current_password"
            label={copy.currentLabel}
            autoComplete="current-password"
            value={current}
            onChange={setCurrent}
            error={fieldErrors.current_password}
          />
          <PasswordField
            id="new_password"
            label={copy.newLabel}
            autoComplete="new-password"
            value={next}
            onChange={setNext}
            error={fieldErrors.new_password}
            describedBy="password-policy"
          />
          <PasswordField
            id="confirm_password"
            label={copy.confirmLabel}
            autoComplete="new-password"
            value={confirm}
            onChange={setConfirm}
            error={fieldErrors.confirm}
          />

          <div
            id="password-policy"
            className="rounded-md border border-border bg-muted p-3 text-sm text-muted-foreground"
          >
            <p className="font-medium text-foreground">{copy.policyHeading}</p>
            <ul className="mt-1 list-disc pl-5 space-y-0.5">
              {copy.policy.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>
          </div>

          {isForced ? (
            <p className="text-xs text-muted-foreground">
              Other signed-in devices will be signed out when you update your password.
            </p>
          ) : (
            <label
              htmlFor="revoke-other-sessions"
              className="flex cursor-pointer items-center gap-2.5 text-sm text-foreground"
            >
              <Checkbox
                id="revoke-other-sessions"
                checked={revokeOtherSessions}
                onCheckedChange={(checked) => setRevokeOtherSessions(Boolean(checked))}
                disabled={submitting}
              />
              <span>Sign out other devices</span>
            </label>
          )}

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="submit" className={isForced ? "flex-1" : undefined} disabled={submitting}>
              {submitting ? copy.submitting : copy.submit}
            </Button>
            {isMustChange && isForced && (
              <Button type="button" variant="outline" onClick={() => void controller.logout()}>
                {copy.logout}
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

interface PasswordFieldProps {
  id: string;
  label: string;
  autoComplete: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  describedBy?: string;
}

function PasswordField({
  id,
  label,
  autoComplete,
  value,
  onChange,
  error,
  describedBy,
}: PasswordFieldProps) {
  const errorId = `${id}-error`;
  const described =
    [error ? errorId : null, describedBy ?? null].filter(Boolean).join(" ") || undefined;

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={id}
        type="password"
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={described}
      />
      {error && (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}


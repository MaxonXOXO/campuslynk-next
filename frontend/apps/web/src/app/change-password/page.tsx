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
  Input,
  Label,
} from "@academic-suite/ui";
import { AuthGuard } from "@/lib/auth/auth-guard";
import { useSession } from "@/lib/auth/session-provider";
import { authStrings, passwordFailureMessage } from "@/lib/auth/strings";

function ChangePasswordForm() {
  const router = useRouter();
  const { controller, state } = useSession();
  const forced = state.status === "must_change_password";
  const copy = authStrings.changePassword;

  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
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
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    const outcome = await controller.changePassword(current, next);
    setSubmitting(false);

    if (outcome.ok) {
      setCurrent("");
      setNext("");
      setConfirm("");
      router.replace(outcome.route);
      return;
    }

    setFieldErrors(outcome.error.fields);
    setFormError(passwordFailureMessage(outcome.error));
    setCurrent("");
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4 sm:p-8 bg-background text-foreground">
      <Card className="w-full max-w-md border-border shadow-sm">
        <CardHeader>
          <CardTitle className="text-2xl font-bold tracking-tight">
            {forced ? copy.titleForced : copy.titleVoluntary}
          </CardTitle>
          <CardDescription>{forced ? copy.descriptionForced : copy.descriptionVoluntary}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} noValidate className="space-y-4">
            {formError && (
              <div ref={errorRef} tabIndex={-1} role="alert" className="outline-none">
                <Alert variant="destructive">
                  <AlertDescription>{formError}</AlertDescription>
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

            <div id="password-policy" className="rounded-md border border-border bg-muted p-3 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">{copy.policyHeading}</p>
              <ul className="mt-1 list-disc pl-5 space-y-0.5">
                {copy.policy.map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ul>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="submit" className="flex-1" disabled={submitting}>
                {submitting ? copy.submitting : copy.submit}
              </Button>
              {forced && (
                <Button type="button" variant="outline" onClick={() => void controller.logout()}>
                  {copy.logout}
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </main>
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

function PasswordField({ id, label, autoComplete, value, onChange, error, describedBy }: PasswordFieldProps) {
  const errorId = `${id}-error`;
  const described = [error ? errorId : null, describedBy ?? null].filter(Boolean).join(" ") || undefined;

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

export default function ChangePasswordPage() {
  return (
    <AuthGuard>
      <ChangePasswordForm />
    </AuthGuard>
  );
}


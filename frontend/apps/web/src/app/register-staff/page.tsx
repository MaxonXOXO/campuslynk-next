"use client";

import * as React from "react";
import Link from "next/link";
import { RiEyeLine, RiEyeOffLine, RiCheckLine } from "@remixicon/react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  buttonVariants,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from "@academic-suite/ui";

interface FieldErrors {
  name?: string;
  email?: string;
  mobile?: string;
  password?: string;
}

export default function RegisterStaffPage() {
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [mobile, setMobile] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [designation, setDesignation] = React.useState("");
  const [employeeId, setEmployeeId] = React.useState("");
  const [website, setWebsite] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);

  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});
  const [submittedMessage, setSubmittedMessage] = React.useState<string | null>(null);
  const errorRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    return () => {
      setPassword("");
    };
  }, []);

  React.useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const errs: FieldErrors = {};
    if (name.trim() === "") errs.name = "Full name is required.";
    if (email.trim() === "" && mobile.trim() === "") {
      errs.email = "Provide either an email address or a mobile number.";
    }
    if (password === "") errs.password = "Password is required.";

    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      setError("Please check the highlighted fields.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setFieldErrors({});

    const submittedPassword = password;
    setPassword("");

    try {
      const response = await fetch("/api/session/register-staff", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, application/problem+json",
        },
        credentials: "same-origin",
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim() || null,
          mobile: mobile.trim() || null,
          password: submittedPassword,
          requested_department_id: null,
          designation: designation.trim() || null,
          employee_id: employeeId.trim() || null,
          website: website || null,
        }),
      });

      const body = (await response.json().catch(() => ({}))) as {
        data?: { message?: string };
        detail?: string;
        title?: string;
        errors?: Record<string, string[]>;
        retry_after?: number | null;
      };

      if (response.status === 202 || response.ok) {
        setSubmittedMessage(
          body.data?.message ??
            "If your details are eligible, your registration has been submitted for approval."
        );
        return;
      }

      if (response.status === 403) {
        setError(
          "Self-registration isn't open for this institution. Contact your administrator."
        );
        return;
      }

      if (response.status === 429) {
        const retryAfterHeader = response.headers.get("retry-after");
        const retrySeconds =
          body.retry_after ?? (retryAfterHeader ? Number(retryAfterHeader) : null);
        setError(
          retrySeconds && retrySeconds > 0
            ? `Too many registration attempts. Please try again in ${Math.ceil(retrySeconds / 60)} minute(s).`
            : "Too many registration attempts or daily registration capacity reached. Please try again later."
        );
        return;
      }

      if (response.status === 422 && body.errors) {
        setFieldErrors({
          name: body.errors.name?.[0],
          email: body.errors.email?.[0],
          mobile: body.errors.mobile?.[0],
          password: body.errors.password?.[0],
        });
        setError(body.detail ?? "Please correct the highlighted fields.");
        return;
      }

      setError(body.detail ?? body.title ?? "Unable to submit registration. Please try again.");
    } catch {
      setError("Network error while submitting registration. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4 sm:p-8 bg-background text-foreground">
      <Card className="w-full max-w-md border-border shadow-sm">
        <CardHeader>
          <CardTitle className="text-2xl font-bold tracking-tight">Request Staff Access</CardTitle>
          <CardDescription>
            Submit your details for administrator approval. You can sign in once approved.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {submittedMessage ? (
            <div className="space-y-4">
              <Alert>
                <RiCheckLine className="size-4" aria-hidden="true" />
                <AlertTitle>Request submitted</AlertTitle>
                <AlertDescription>{submittedMessage}</AlertDescription>
              </Alert>
              <Link
                href="/login"
                className={buttonVariants({ variant: "outline", className: "w-full" })}
              >
                Back to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={onSubmit} noValidate className="space-y-4">
              {error && (
                <div ref={errorRef} tabIndex={-1} role="alert" className="outline-none">
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                </div>
              )}

              {/* Honeypot field: hidden from sighted users and assistive technology */}
              <div
                aria-hidden="true"
                style={{
                  position: "absolute",
                  left: "-9999px",
                  width: "1px",
                  height: "1px",
                  overflow: "hidden",
                }}
              >
                <label htmlFor="website">Website</label>
                <input
                  id="website"
                  name="website"
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="reg-name">Full name</Label>
                <Input
                  id="reg-name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  aria-invalid={fieldErrors.name ? true : undefined}
                  required
                />
                {fieldErrors.name && (
                  <p className="text-xs text-destructive">{fieldErrors.name}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="reg-email">Email</Label>
                <Input
                  id="reg-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-invalid={fieldErrors.email ? true : undefined}
                />
                {fieldErrors.email && (
                  <p className="text-xs text-destructive">{fieldErrors.email}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="reg-mobile">Mobile (optional if email provided)</Label>
                <Input
                  id="reg-mobile"
                  name="mobile"
                  type="tel"
                  autoComplete="tel"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  aria-invalid={fieldErrors.mobile ? true : undefined}
                />
                {fieldErrors.mobile && (
                  <p className="text-xs text-destructive">{fieldErrors.mobile}</p>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="reg-designation">Designation (optional)</Label>
                  <Input
                    id="reg-designation"
                    name="designation"
                    type="text"
                    value={designation}
                    onChange={(e) => setDesignation(e.target.value)}
                    placeholder="e.g. Lecturer"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="reg-employee-id">Employee ID (optional)</Label>
                  <Input
                    id="reg-employee-id"
                    name="employee_id"
                    type="text"
                    value={employeeId}
                    onChange={(e) => setEmployeeId(e.target.value)}
                    placeholder="e.g. EMP-101"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="reg-password">Password</Label>
                <div className="flex gap-2">
                  <Input
                    id="reg-password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    aria-invalid={fieldErrors.password ? true : undefined}
                    required
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-pressed={showPassword}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    onClick={() => setShowPassword((v) => !v)}
                  >
                    {showPassword ? (
                      <RiEyeOffLine className="size-4" aria-hidden="true" />
                    ) : (
                      <RiEyeLine className="size-4" aria-hidden="true" />
                    )}
                  </Button>
                </div>
                {fieldErrors.password && (
                  <p className="text-xs text-destructive">{fieldErrors.password}</p>
                )}
              </div>

              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? "Submitting..." : "Request access"}
              </Button>

              <p className="text-center text-sm text-muted-foreground">
                Already have an account?{" "}
                <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
                  Sign in
                </Link>
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}


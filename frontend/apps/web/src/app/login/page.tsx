"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { RiEyeLine, RiEyeOffLine } from "@remixicon/react";
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
import { useSession } from "@/lib/auth/session-provider";
import { sanitizeReturnUrl } from "@/lib/auth/redirect";
import { authStrings, loginFailureMessage } from "@/lib/auth/strings";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = sanitizeReturnUrl(searchParams.get("returnTo"));
  const { controller, state } = useSession();

  const [identifier, setIdentifier] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const errorRef = React.useRef<HTMLDivElement>(null);

  // An already signed-in visitor is routed on instead of seeing the form.
  React.useEffect(() => {
    if (state.status === "authenticated") {
      void controller.enterApp(returnTo).then((outcome) => {
        if (outcome.ok) router.replace(outcome.route);
      });
    } else if (state.status === "must_change_password") {
      router.replace("/change-password");
    }
  }, [state.status, controller, returnTo, router]);

  React.useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    if (identifier.trim() === "" || password === "") {
      setError(authStrings.login.validationRequired);
      return;
    }

    setSubmitting(true);
    setError(null);

    const outcome = await controller.login(identifier.trim(), password, returnTo);
    setSubmitting(false);

    if (outcome.ok) {
      setPassword("");
      router.replace(outcome.route);
    } else {
      setPassword("");
      setError(loginFailureMessage(outcome.failure));
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4 sm:p-8 bg-background text-foreground">
      <Card className="w-full max-w-md border-border shadow-sm">
        <CardHeader>
          <CardTitle className="text-2xl font-bold tracking-tight">{authStrings.login.title}</CardTitle>
          <CardDescription>{authStrings.login.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} noValidate className="space-y-4">
            {error && (
              <div ref={errorRef} tabIndex={-1} role="alert" className="outline-none">
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="identifier">{authStrings.login.identifierLabel}</Label>
              <Input
                id="identifier"
                name="identifier"
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                aria-invalid={error ? true : undefined}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">{authStrings.login.passwordLabel}</Label>
              <div className="flex gap-2">
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-invalid={error ? true : undefined}
                  required
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-pressed={showPassword}
                  aria-label={showPassword ? authStrings.login.hidePassword : authStrings.login.showPassword}
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? <RiEyeOffLine className="size-4" aria-hidden="true" /> : <RiEyeLine className="size-4" aria-hidden="true" />}
                </Button>
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? authStrings.login.submitting : authStrings.login.submit}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

export default function LoginPage() {
  return (
    <React.Suspense fallback={null}>
      <LoginForm />
    </React.Suspense>
  );
}


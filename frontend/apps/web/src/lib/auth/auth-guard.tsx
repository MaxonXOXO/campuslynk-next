"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Skeleton } from "@academic-suite/ui";
import { guardDecision } from "./redirect";
import { useSession } from "./session-provider";
import { authStrings } from "./strings";

/** Gate for authenticated app routes. Renders children only for an authenticated session. */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { state, controller } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  const decision = guardDecision(state.status, pathname, typeof window === "undefined" ? "" : window.location.search);
  const redirectTo = decision.action === "redirect" ? decision.to : null;

  React.useEffect(() => {
    if (redirectTo) router.replace(redirectTo);
  }, [redirectTo, router]);

  if (state.status === "error") {
    return (
      <main className="min-h-screen flex items-center justify-center p-4 bg-background">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>{authStrings.guard.errorTitle}</CardTitle>
            <CardDescription>{authStrings.guard.errorDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button type="button" onClick={() => void controller.bootstrap()}>
              {authStrings.guard.retry}
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (decision.action !== "render") {
    return (
      <main
        className="min-h-screen flex items-center justify-center p-4 bg-background"
        aria-busy="true"
        aria-live="polite"
      >
        <div className="w-full max-w-md space-y-3" suppressHydrationWarning>
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-24 w-full" />
          <span className="sr-only">{authStrings.guard.loading}</span>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}


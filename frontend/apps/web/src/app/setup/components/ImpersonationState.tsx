"use client";

import * as React from "react";
import { Button, Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@academic-suite/ui";
import { RiShieldCrossLine, RiArrowLeftLine } from "@remixicon/react";

interface ImpersonationStateProps {
  onBackToHome?: () => void;
}

export function ImpersonationState({ onBackToHome }: ImpersonationStateProps) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="max-w-md w-full border-destructive/30 shadow-md">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto size-12 rounded-full bg-destructive/10 flex items-center justify-center text-destructive mb-3">
            <RiShieldCrossLine className="size-6" aria-hidden="true" />
          </div>
          <CardTitle className="text-lg font-bold text-foreground">
            Impersonation Session Active
          </CardTitle>
          <CardDescription className="text-sm font-medium text-destructive mt-1">
            Setup is not available while impersonating a user.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center text-xs text-muted-foreground space-y-2">
          <p>
            First-run institutional onboarding and configuration endpoints require direct,
            unimpersonated authentication by a Super Administrator.
          </p>
          <p>
            Please stop your current impersonation session to access institutional setup.
          </p>
        </CardContent>
        {onBackToHome && (
          <CardFooter className="flex justify-center pt-2">
            <Button type="button" variant="outline" size="sm" onClick={onBackToHome}>
              <RiArrowLeftLine className="size-4 mr-1.5" aria-hidden="true" /> Return to Home
            </Button>
          </CardFooter>
        )}
      </Card>
    </div>
  );
}


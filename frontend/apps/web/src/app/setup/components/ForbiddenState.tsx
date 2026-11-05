"use client";

import * as React from "react";
import { Button, Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@academic-suite/ui";
import { RiLockPasswordLine, RiArrowLeftLine } from "@remixicon/react";

interface ForbiddenStateProps {
  onBackToHome?: () => void;
}

export function ForbiddenState({ onBackToHome }: ForbiddenStateProps) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="max-w-md w-full border-border shadow-md">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto size-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground mb-3">
            <RiLockPasswordLine className="size-6" aria-hidden="true" />
          </div>
          <CardTitle className="text-lg font-bold text-foreground">
            Access Restricted
          </CardTitle>
          <CardDescription className="text-sm text-muted-foreground mt-1">
            403 Forbidden • Super Administrator Access Only
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center text-xs text-muted-foreground space-y-2">
          <p>
            The First-Run Setup Wizard is strictly restricted to Super Administrators assigned at
            institution scope.
          </p>
          <p>
            Department-scoped roles, faculty, and student accounts do not have permission to view or
            execute institutional setup.
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


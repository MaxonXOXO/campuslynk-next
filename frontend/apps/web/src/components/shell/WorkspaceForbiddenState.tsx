"use client";

import * as React from "react";
import Link from "next/link";
import {
  Button,
  buttonVariants,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@academic-suite/ui";
import { RiArrowLeftLine, RiLogoutBoxRLine, RiShieldKeyholeLine } from "@remixicon/react";
import type { ComputedWorkspace } from "@/lib/workspaces/workspaces";

export interface WorkspaceForbiddenStateProps {
  requestedWorkspace: string;
  landingWorkspace: ComputedWorkspace | null;
  onLogout: () => void;
}

export function WorkspaceForbiddenState({
  requestedWorkspace,
  landingWorkspace,
  onLogout,
}: WorkspaceForbiddenStateProps) {
  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-background text-foreground">
      <Card className="w-full max-w-md border-border shadow-sm" role="alert">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto size-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground mb-3">
            <RiShieldKeyholeLine className="size-6" aria-hidden="true" />
          </div>
          <CardTitle className="text-lg font-bold">Workspace Access Unavailable</CardTitle>
          <CardDescription>
            403 Forbidden &bull; Active assignment required
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center text-sm text-muted-foreground space-y-2">
          <p>
            You do not have an active role assignment granting access to{" "}
            <span className="font-mono text-foreground">/w/{requestedWorkspace}</span>.
          </p>
          {!landingWorkspace && (
            <p>
              Your account currently has no active workspace assignments. Contact your
              institution administrator if you believe this is an error.
            </p>
          )}
        </CardContent>
        <CardFooter className="flex flex-col sm:flex-row justify-center gap-2">
          {landingWorkspace && (
            <Link
              href={`/w/${landingWorkspace.slug}`}
              className={buttonVariants({ variant: "default" })}
            >
              <RiArrowLeftLine className="size-4 mr-1.5" aria-hidden="true" />
              Go to {landingWorkspace.shortLabel}
            </Link>
          )}
          <Button type="button" variant="outline" onClick={onLogout}>
            <RiLogoutBoxRLine className="size-4" aria-hidden="true" />
            Sign out
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}


"use client";

import * as React from "react";
import { Skeleton } from "@academic-suite/ui";
import { AuthGuard } from "@/lib/auth/auth-guard";
import { useSession } from "@/lib/auth/session-provider";
import { AppShell } from "@/components/shell/AppShell";
import { computeWorkspaces } from "@/lib/workspaces/workspaces";
import { ProfilePage } from "@/components/profile/ProfilePage";

function ProfileShellContent() {
  const { state } = useSession();
  const workspaces = React.useMemo(
    () => computeWorkspaces(state.user),
    [state.user]
  );
  const activeSlug = workspaces[0]?.slug ?? null;

  return (
    <AppShell activeSlug={activeSlug}>
      <React.Suspense
        fallback={
          <div className="space-y-4">
            <Skeleton className="h-10 w-56" />
            <Skeleton className="h-64 w-full" />
          </div>
        }
      >
        <ProfilePage />
      </React.Suspense>
    </AppShell>
  );
}

export default function ProfileRoutePage() {
  return (
    <AuthGuard>
      <ProfileShellContent />
    </AuthGuard>
  );
}


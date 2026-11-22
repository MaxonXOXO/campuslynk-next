"use client";

import * as React from "react";
import { AuthGuard } from "@/lib/auth/auth-guard";
import { useSession } from "@/lib/auth/session-provider";
import {
  getLandingWorkspace,
  hasWorkspaceAccess,
  isWorkspaceSlug,
} from "@/lib/workspaces/workspaces";
import { AppShell } from "./AppShell";
import { WorkspaceForbiddenState } from "./WorkspaceForbiddenState";

export interface WorkspaceShellLayoutProps {
  workspace: string;
  children: React.ReactNode;
}

function WorkspaceGate({ workspace, children }: WorkspaceShellLayoutProps) {
  const { state, controller } = useSession();
  const user = state.user;
  const landingWorkspace = React.useMemo(() => getLandingWorkspace(user), [user]);

  if (!isWorkspaceSlug(workspace) || !hasWorkspaceAccess(user, workspace)) {
    return (
      <WorkspaceForbiddenState
        requestedWorkspace={workspace}
        landingWorkspace={landingWorkspace}
        onLogout={() => void controller.logout()}
      />
    );
  }

  return <AppShell activeSlug={workspace}>{children}</AppShell>;
}

export function WorkspaceShellLayout({
  workspace,
  children,
}: WorkspaceShellLayoutProps) {
  return (
    <AuthGuard>
      <WorkspaceGate workspace={workspace}>{children}</WorkspaceGate>
    </AuthGuard>
  );
}


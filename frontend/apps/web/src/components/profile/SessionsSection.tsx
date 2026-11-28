"use client";

import * as React from "react";
import type { components } from "@academic-suite/api-client";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Skeleton,
  StatusBadge,
} from "@academic-suite/ui";
import {
  RiAlertLine,
  RiCheckLine,
  RiComputerLine,
  RiLoader4Line,
  RiLogoutBoxRLine,
} from "@remixicon/react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/auth/session-provider";
import {
  STALE_TIME_LIST_MS,
  scopedQueryKey,
  useApiQuery,
  useQueryScope,
} from "@/lib/query/api-query";
import { formatDisplayDateTime } from "@/lib/format-date";

type MySessionItem = components["schemas"]["MySessionItem"];

export function SessionsSection() {
  const client = useApiClient();
  const scope = useQueryScope();
  const queryClient = useQueryClient();

  const sessionsQueryKey = React.useMemo(
    () => ["auth", "sessions", "list"] as const,
    []
  );

  const sessionsQuery = useApiQuery({
    queryKey: sessionsQueryKey,
    queryFn: () => client.auth.sessions.list(),
    staleTime: STALE_TIME_LIST_MS,
  });

  const [confirmTarget, setConfirmTarget] = React.useState<MySessionItem | null>(null);
  const [confirmOthersOpen, setConfirmOthersOpen] = React.useState(false);
  const [mutating, setMutating] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [actionNotice, setActionNotice] = React.useState<string | null>(null);
  const actionErrorRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (actionError) {
      actionErrorRef.current?.focus();
    }
  }, [actionError]);

  const sessions: MySessionItem[] = sessionsQuery.data?.data ?? [];
  const revocableOthers = sessions.filter(
    (s) => !s.is_current && !s.is_support_session
  );

  async function refreshSessions() {
    await queryClient.invalidateQueries({
      queryKey: scopedQueryKey(scope, ...sessionsQueryKey),
    });
  }

  async function handleConfirmRevokeOne() {
    if (!confirmTarget || mutating) return;
    setMutating(true);
    setActionError(null);
    setActionNotice(null);

    try {
      await client.auth.sessions.revoke(confirmTarget.id);
      const message = `Signed out ${confirmTarget.device_label}.`;
      setActionNotice(message);
      toast.success(message);
      setConfirmTarget(null);
      await refreshSessions();
    } catch {
      setActionError("Could not revoke that session. Please try again.");
      setConfirmTarget(null);
    } finally {
      setMutating(false);
    }
  }

  async function handleConfirmRevokeOthers() {
    if (mutating) return;
    setMutating(true);
    setActionError(null);
    setActionNotice(null);

    try {
      const res = await client.auth.sessions.revokeOthers();
      const count = res.data.revoked_count;
      const message =
        count === 1
          ? "Signed out 1 other session."
          : `Signed out ${count} other sessions.`;
      setActionNotice(message);
      toast.success(message);
      setConfirmOthersOpen(false);
      await refreshSessions();
    } catch {
      setActionError("Could not sign out other sessions. Please try again.");
      setConfirmOthersOpen(false);
    } finally {
      setMutating(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle className="text-base">Active sessions</CardTitle>
          <CardDescription>
            Devices currently signed in to your account. Support sessions are read-only and cannot be revoked here.
          </CardDescription>
        </div>
        {revocableOthers.length > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setConfirmOthersOpen(true)}
            disabled={mutating}
          >
            <RiLogoutBoxRLine className="size-4" aria-hidden="true" />
            Sign out all other sessions
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {actionError && (
          <div ref={actionErrorRef} tabIndex={-1} className="outline-none">
            <Alert variant="destructive">
              <RiAlertLine className="size-4" aria-hidden="true" />
              <AlertDescription>{actionError}</AlertDescription>
            </Alert>
          </div>
        )}

        {actionNotice && (
          <div role="status" aria-live="polite">
            <Alert>
              <RiCheckLine className="size-4" aria-hidden="true" />
              <AlertDescription>{actionNotice}</AlertDescription>
            </Alert>
          </div>
        )}

        {sessionsQuery.isLoading ? (
          <div className="space-y-3" aria-label="Loading active sessions">
            <Skeleton className="h-16 w-full rounded-lg" />
            <Skeleton className="h-16 w-full rounded-lg" />
          </div>
        ) : sessionsQuery.isError ? (
          <Alert variant="destructive">
            <RiAlertLine className="size-4" aria-hidden="true" />
            <AlertTitle>Unable to load active sessions</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
              <span>Could not retrieve your signed-in devices.</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void sessionsQuery.refetch()}
              >
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        ) : sessions.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No active sessions found.
          </div>
        ) : (
          <ul className="space-y-3" aria-label="Signed-in devices">
            {sessions.map((session) => (
              <li
                key={session.id}
                className="flex flex-col gap-3 rounded-lg border border-border p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <RiComputerLine
                      className="size-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <span className="text-sm font-medium text-foreground">
                      {session.device_label}
                    </span>
                    {session.is_current && (
                      <StatusBadge status="success">This device</StatusBadge>
                    )}
                    {session.is_support_session && (
                      <StatusBadge status="warning">
                        Support session (read-only)
                      </StatusBadge>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>
                      Signed in:{" "}
                      {session.created_at
                        ? formatDisplayDateTime(session.created_at)
                        : "—"}
                    </span>
                    <span>
                      Last active:{" "}
                      {session.last_used_at
                        ? formatDisplayDateTime(session.last_used_at)
                        : "Never"}
                    </span>
                  </div>
                </div>

                {!session.is_current && !session.is_support_session && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmTarget(session)}
                    disabled={mutating}
                    className="self-start sm:self-auto"
                  >
                    Revoke
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      {/* Confirm revoke one */}
      <Dialog
        open={confirmTarget !== null}
        onOpenChange={(open) => {
          if (!open && !mutating) {
            setConfirmTarget(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Sign out device?</DialogTitle>
            <DialogDescription>
              This will immediately revoke access for{" "}
              <span className="font-medium text-foreground">
                {confirmTarget?.device_label}
              </span>
              .
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmTarget(null)}
              disabled={mutating}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleConfirmRevokeOne()}
              disabled={mutating}
            >
              {mutating && (
                <RiLoader4Line className="size-4 animate-spin" aria-hidden="true" />
              )}
              Revoke session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm revoke all others */}
      <Dialog
        open={confirmOthersOpen}
        onOpenChange={(open) => {
          if (!open && !mutating) {
            setConfirmOthersOpen(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Sign out all other sessions?</DialogTitle>
            <DialogDescription>
              All other signed-in devices will be signed out immediately. This device and any active read-only support sessions will stay active.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmOthersOpen(false)}
              disabled={mutating}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleConfirmRevokeOthers()}
              disabled={mutating}
            >
              {mutating && (
                <RiLoader4Line className="size-4 animate-spin" aria-hidden="true" />
              )}
              Sign out all other sessions
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}


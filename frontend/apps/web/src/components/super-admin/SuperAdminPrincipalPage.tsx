"use client";

import * as React from "react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Input,
  Label,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn,
} from "@academic-suite/ui";
import {
  RiAlertLine,
  RiCheckLine,
  RiHistoryLine,
  RiLoader4Line,
  RiRefreshLine,
  RiShieldUserLine,
  RiUserAddLine,
} from "@remixicon/react";
import { toast } from "sonner";
import { useApiClient, useSession } from "@/lib/auth/session-provider";
import {
  parsePaginatedRoleAssignments,
  parsePaginatedUsers,
  parseUserEnvelope,
  type RoleAssignmentRecord,
  type TemporaryPasswordPayload,
  type UserRecord,
} from "@/lib/api-narrowing";
import { problemStatus } from "@/lib/auth/problem";
import { getInstitutionScopeLabel } from "@/lib/workspaces/workspaces";
import {
  getGeneralErrorMessage,
  mapProblemFieldErrors,
} from "@/app/setup/logic/error-mapping";
import { TemporaryPasswordReveal } from "./TemporaryPasswordReveal";

type AppointMode = "existing" | "create";

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

export function SuperAdminPrincipalPage() {
  const client = useApiClient();
  const { state } = useSession();

  const institutionScopeLabel = React.useMemo(
    () => getInstitutionScopeLabel(state.user),
    [state.user]
  );

  const [assignments, setAssignments] = React.useState<RoleAssignmentRecord[]>([]);
  const [hydratedUsers, setHydratedUsers] = React.useState<Record<string, UserRecord>>({});
  const [staffOptions, setStaffOptions] = React.useState<UserRecord[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  // Appoint form state
  const [appointMode, setAppointMode] = React.useState<AppointMode>("existing");
  const [selectedUserId, setSelectedUserId] = React.useState("");
  const [orderRecord, setOrderRecord] = React.useState("");
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  // Ephemeral one-time temporary password state (cleared on dismiss/unmount; never persisted)
  const [revealedTempPassword, setRevealedTempPassword] = React.useState<{
    recipientName: string;
    payload: TemporaryPasswordPayload;
  } | null>(null);

  React.useEffect(() => {
    return () => {
      setRevealedTempPassword(null);
    };
  }, []);

  const loadPrincipalData = React.useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    try {
      const [assignmentsRes, staffRes] = await Promise.all([
        client.roleAssignments.list({ role_key: "principal", active_only: false }),
        client.users.list({ type: "staff", status: "active" }),
      ]);

      const parsedAssignments = parsePaginatedRoleAssignments(assignmentsRes).data;
      const parsedStaff = parsePaginatedUsers(staffRes).data;

      const userMap: Record<string, UserRecord> = {};
      for (const staff of parsedStaff) {
        userMap[staff.id] = staff;
      }

      for (const assignment of parsedAssignments) {
        if (assignment.user) {
          userMap[assignment.user.id] = {
            id: assignment.user.id,
            type: "staff",
            name: assignment.user.name,
            email: assignment.user.email ?? null,
            mobile: assignment.user.mobile ?? null,
            registration_number: null,
            status: "active",
            must_change_password: false,
            last_login_at: null,
            created_at: null,
            updated_at: null,
          };
        }
      }

      // TODO: Remove per-user hydration once GET /role-assignments embeds user summary.
      const missingUserIds = Array.from(
        new Set(
          parsedAssignments
            .map((a) => a.user_id)
            .filter((uid) => Boolean(uid) && !userMap[uid])
        )
      );

      if (missingUserIds.length > 0) {
        const fetched = await Promise.allSettled(
          missingUserIds.map(async (uid) => {
            const res = await client.users.get(uid);
            return parseUserEnvelope(res);
          })
        );

        for (const result of fetched) {
          if (result.status === "fulfilled" && result.value) {
            userMap[result.value.id] = result.value;
          }
        }
      }

      setAssignments(parsedAssignments);
      setHydratedUsers(userMap);
      setStaffOptions(parsedStaff);
    } catch (err: unknown) {
      setLoadError(getGeneralErrorMessage(err, "Failed to load Principal assignments."));
    } finally {
      setLoading(false);
    }
  }, [client]);

  React.useEffect(() => {
    void loadPrincipalData();
  }, [loadPrincipalData]);

  const activePrincipal = React.useMemo(
    () => assignments.find((a) => a.is_active) ?? null,
    [assignments]
  );

  const staffSelectItems = React.useMemo(
    () =>
      staffOptions.map((staff) => ({
        value: staff.id,
        label: staff.email ? `${staff.name} (${staff.email})` : staff.name,
      })),
    [staffOptions]
  );

  function clearFieldError(field: string) {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  async function handleAppointSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || appointMode !== "existing") return;

    const nextErrors: Record<string, string> = {};
    if (!selectedUserId) {
      nextErrors.user_id = "Select a staff member to appoint as Principal.";
    }
    if (!institutionScopeLabel) {
      nextErrors.scope_label =
        "Institution scope is unavailable on your active Super Admin assignment.";
    }

    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      setSubmitError(null);
      return;
    }

    setSubmitting(true);
    setFieldErrors({});
    setSubmitError(null);

    try {
      await client.roleAssignments.create({
        user_id: selectedUserId,
        role_key: "principal",
        scope_type: "institution",
        scope_label: institutionScopeLabel!,
        order_record: orderRecord.trim() ? orderRecord.trim() : null,
      });

      const appointedUser = hydratedUsers[selectedUserId];
      toast.success(
        appointedUser
          ? `${appointedUser.name} appointed as Principal.`
          : "Principal appointed successfully."
      );
      setSelectedUserId("");
      setOrderRecord("");
      await loadPrincipalData();
    } catch (err: unknown) {
      const mapped = mapProblemFieldErrors(err);
      if (Object.keys(mapped).length > 0) {
        setFieldErrors(mapped);
      }

      if (problemStatus(err) === 409) {
        setSubmitError(
          getGeneralErrorMessage(
            err,
            "An active Principal is already appointed for this institution."
          )
        );
        await loadPrincipalData();
      } else {
        setSubmitError(
          getGeneralErrorMessage(err, "Could not complete Principal appointment.")
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Principal Management"
        description="Appoint the institution Principal and review past Principal assignments."
      />

      {revealedTempPassword && (
        <TemporaryPasswordReveal
          recipientName={revealedTempPassword.recipientName}
          payload={revealedTempPassword.payload}
          onDismiss={() => setRevealedTempPassword(null)}
        />
      )}

      {loading && (
        <div className="space-y-4" aria-busy="true">
          <Skeleton className="h-44 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      )}

      {!loading && loadError && (
        <Alert variant="destructive">
          <RiAlertLine className="size-4" aria-hidden="true" />
          <AlertTitle>Unable to load Principal data</AlertTitle>
          <AlertDescription className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <span>{loadError}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadPrincipalData()}
            >
              <RiRefreshLine className="size-4" aria-hidden="true" />
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {!loading && !loadError && (
        <>
          {/* Current Principal Card */}
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="space-y-1">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <RiShieldUserLine className="size-4 text-primary" aria-hidden="true" />
                    Current Principal
                  </CardTitle>
                  <CardDescription>
                    Only one active Principal assignment is permitted at institution scope.
                  </CardDescription>
                </div>
                <StatusBadge status={activePrincipal ? "success" : "warning"}>
                  {activePrincipal ? "Active" : "Vacant"}
                </StatusBadge>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {activePrincipal ? (
                <>
                  <div className="grid grid-cols-1 gap-4 rounded-lg border border-border bg-muted/30 p-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Person</p>
                      <p className="text-sm font-semibold text-foreground">
                        {hydratedUsers[activePrincipal.user_id]?.name ?? activePrincipal.user_id}
                      </p>
                      {hydratedUsers[activePrincipal.user_id]?.email && (
                        <p className="text-xs text-muted-foreground truncate">
                          {hydratedUsers[activePrincipal.user_id]?.email}
                        </p>
                      )}
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Contact</p>
                      <p className="text-sm text-foreground">
                        {hydratedUsers[activePrincipal.user_id]?.mobile ??
                          hydratedUsers[activePrincipal.user_id]?.email ??
                          "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Effective From</p>
                      <p className="text-sm font-mono text-foreground">
                        {formatDateTime(activePrincipal.valid_from)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Scope</p>
                      <p className="text-sm font-mono text-foreground">
                        {activePrincipal.scope_label || activePrincipal.scope_type}
                      </p>
                    </div>
                  </div>

                  <Alert>
                    <AlertTitle>Replace Principal</AlertTitle>
                    <AlertDescription>
                      Awaiting backend support: atomic Principal replacement with a recorded
                      transition reason (<code>POST /principal/replace</code>) is pending.
                    </AlertDescription>
                  </Alert>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No active Principal is currently assigned. Use the appointment panel below to
                  appoint a Principal.
                </p>
              )}
            </CardContent>

            {activePrincipal && (
              <CardFooter className="border-t border-border/60 pt-4 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  Awaiting backend support
                </span>
                <Button type="button" variant="outline" disabled>
                  Replace Principal
                </Button>
              </CardFooter>
            )}
          </Card>

          {/* Appoint Principal Card (shown when vacant) */}
          {!activePrincipal && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <RiUserAddLine className="size-4 text-primary" aria-hidden="true" />
                  Appoint Principal
                </CardTitle>
                <CardDescription>
                  Choose an appointment method for the incoming Principal.
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-6">
                <div
                  role="radiogroup"
                  aria-label="Appointment method"
                  className="grid grid-cols-1 gap-3 md:grid-cols-2"
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={appointMode === "existing"}
                    data-selected={appointMode === "existing" ? "true" : "false"}
                    onClick={() => setAppointMode("existing")}
                    className={cn(
                      "flex items-start justify-between gap-3 rounded-xl border p-4 text-left transition-colors",
                      "outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                      appointMode === "existing"
                        ? "border-primary bg-primary/5"
                        : "border-border bg-card hover:bg-muted/50"
                    )}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-foreground">
                          Appoint existing staff user
                        </span>
                        <Badge variant="default">Available</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Assign the singleton Principal role at institution scope to an active
                        staff account.
                      </p>
                    </div>
                    {appointMode === "existing" && (
                      <RiCheckLine
                        className="size-4 shrink-0 text-primary mt-0.5"
                        aria-hidden="true"
                      />
                    )}
                  </button>

                  <button
                    type="button"
                    role="radio"
                    aria-checked={false}
                    aria-disabled="true"
                    data-selected="false"
                    disabled
                    className="flex items-start justify-between gap-3 rounded-xl border border-border bg-muted/40 p-4 text-left opacity-65 cursor-not-allowed"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-foreground">
                          Create new account &amp; appoint
                        </span>
                        <Badge variant="outline">Awaiting backend support</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Requires backend support to generate and return a one-time temporary
                        password on user creation.
                      </p>
                    </div>
                  </button>
                </div>

                <form onSubmit={handleAppointSubmit} noValidate className="space-y-4">
                  {submitError && (
                    <Alert variant="destructive">
                      <RiAlertLine className="size-4" aria-hidden="true" />
                      <AlertDescription>{submitError}</AlertDescription>
                    </Alert>
                  )}

                  {fieldErrors.scope_label && (
                    <Alert variant="destructive">
                      <RiAlertLine className="size-4" aria-hidden="true" />
                      <AlertDescription>{fieldErrors.scope_label}</AlertDescription>
                    </Alert>
                  )}

                  <div className="space-y-1.5">
                    <Label htmlFor="principal-staff-select">Active staff user</Label>
                    <Select
                      value={selectedUserId || null}
                      onValueChange={(value) => {
                        setSelectedUserId(typeof value === "string" ? value : "");
                        clearFieldError("user_id");
                      }}
                      items={staffSelectItems}
                      disabled={submitting || staffOptions.length === 0}
                    >
                      <SelectTrigger
                        id="principal-staff-select"
                        className="w-full"
                        aria-invalid={Boolean(fieldErrors.user_id)}
                        aria-describedby={
                          fieldErrors.user_id ? "principal-user-error" : undefined
                        }
                      >
                        <SelectValue
                          placeholder={
                            staffOptions.length === 0
                              ? "No active staff accounts available"
                              : "Select a staff member..."
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {staffOptions.map((staff) => (
                          <SelectItem key={staff.id} value={staff.id}>
                            {staff.email ? `${staff.name} (${staff.email})` : staff.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {fieldErrors.user_id && (
                      <p id="principal-user-error" className="text-xs text-destructive">
                        {fieldErrors.user_id}
                      </p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="principal-order-record">
                      Official Order Reference (optional)
                    </Label>
                    <Input
                      id="principal-order-record"
                      name="order_record"
                      value={orderRecord}
                      onChange={(e) => {
                        setOrderRecord(e.target.value);
                        clearFieldError("order_record");
                      }}
                      placeholder="e.g. GO-2026-041"
                      maxLength={255}
                      disabled={submitting}
                      aria-invalid={Boolean(fieldErrors.order_record)}
                      aria-describedby={
                        fieldErrors.order_record ? "principal-order-error" : undefined
                      }
                    />
                    {fieldErrors.order_record && (
                      <p id="principal-order-error" className="text-xs text-destructive">
                        {fieldErrors.order_record}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                    <p className="text-xs text-muted-foreground">
                      Scope:{" "}
                      <span className="font-mono text-foreground">
                        {institutionScopeLabel ?? "Unavailable"}
                      </span>
                    </p>
                    <Button
                      type="submit"
                      disabled={submitting || staffOptions.length === 0}
                    >
                      {submitting ? (
                        <>
                          <RiLoader4Line
                            className="size-4 animate-spin"
                            aria-hidden="true"
                          />
                          Appointing...
                        </>
                      ) : (
                        "Appoint Principal"
                      )}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {/* Principal History */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <RiHistoryLine className="size-4 text-primary" aria-hidden="true" />
                Principal Assignment History
              </CardTitle>
              <CardDescription>
                Active and end-dated Principal appointments recorded in this institution.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {assignments.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">
                  No Principal appointments have been recorded yet.
                </p>
              ) : (
                <>
                  {/* Desktop table */}
                  <div className="hidden md:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Person</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Effective From</TableHead>
                          <TableHead>Ended At</TableHead>
                          <TableHead>Scope</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {assignments.map((row) => {
                          const person = hydratedUsers[row.user_id];
                          return (
                            <TableRow key={row.id}>
                              <TableCell className="whitespace-normal">
                                <div className="font-medium text-foreground">
                                  {person?.name ?? row.user_id}
                                </div>
                                {person?.email && (
                                  <div className="text-xs text-muted-foreground">
                                    {person.email}
                                  </div>
                                )}
                              </TableCell>
                              <TableCell>
                                <StatusBadge status={row.is_active ? "success" : "neutral"}>
                                  {row.is_active ? "Active" : "Ended"}
                                </StatusBadge>
                              </TableCell>
                              <TableCell className="font-mono text-xs">
                                {formatDateTime(row.valid_from)}
                              </TableCell>
                              <TableCell className="font-mono text-xs">
                                {formatDateTime(row.valid_to)}
                              </TableCell>
                              <TableCell className="font-mono text-xs">
                                {row.scope_label || row.scope_type}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Mobile cards (375px+) */}
                  <div className="space-y-3 md:hidden">
                    {assignments.map((row) => {
                      const person = hydratedUsers[row.user_id];
                      return (
                        <div
                          key={row.id}
                          className="rounded-lg border border-border p-3.5 space-y-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">
                                {person?.name ?? row.user_id}
                              </p>
                              {person?.email && (
                                <p className="text-xs text-muted-foreground truncate">
                                  {person.email}
                                </p>
                              )}
                            </div>
                            <StatusBadge status={row.is_active ? "success" : "neutral"}>
                              {row.is_active ? "Active" : "Ended"}
                            </StatusBadge>
                          </div>
                          <div className="grid grid-cols-1 gap-1 text-xs text-muted-foreground">
                            <div>
                              From:{" "}
                              <span className="font-mono text-foreground">
                                {formatDateTime(row.valid_from)}
                              </span>
                            </div>
                            <div>
                              Ended:{" "}
                              <span className="font-mono text-foreground">
                                {formatDateTime(row.valid_to)}
                              </span>
                            </div>
                            <div>
                              Scope:{" "}
                              <span className="font-mono text-foreground">
                                {row.scope_label || row.scope_type}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}


"use client";

import * as React from "react";
import type { components } from "@academic-suite/api-client";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
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
  Textarea,
} from "@academic-suite/ui";
import {
  RiAlertLine,
  RiBuilding2Line,
  RiLoader4Line,
  RiRefreshLine,
  RiUserSettingsLine,
} from "@remixicon/react";
import { toast } from "sonner";
import { useApiClient, useSession } from "@/lib/auth/session-provider";
import { problemStatus } from "@/lib/auth/problem";
import { isAssignmentActive } from "@/lib/workspaces/workspaces";
import {
  getGeneralErrorMessage,
  mapProblemFieldErrors,
} from "@/app/setup/logic/error-mapping";

type RoleAssignmentSchema = components["schemas"]["RoleAssignmentSchema"];
type StreamSchema = components["schemas"]["Stream"];
type UserSchema = components["schemas"]["UserSchema"];
type AssignScopeType = components["schemas"]["AssignRoleInput"]["scope_type"];

interface DepartmentRow {
  id: string;
  code: string;
  name: string;
  stream_id?: string;
  stream?: string;
  kind?: string;
  scope_label: string;
  is_active?: boolean;
}

interface BatchRow {
  id: string;
  home_department_id: string;
  managing_department_id?: string;
  status?: string;
}

type LeadershipRoleKey =
  | "hod"
  | "gen_dept_coordinator"
  | "academic_coordinator"
  | "workshop_superintendent"
  | "sf_office";

interface LeadershipRoleMeta {
  key: LeadershipRoleKey;
  label: string;
  scopeLevel: "department" | "stream" | "institution";
}

const LEADERSHIP_ROLES: readonly LeadershipRoleMeta[] = [
  { key: "hod", label: "Head of Department (HOD)", scopeLevel: "department" },
  {
    key: "gen_dept_coordinator",
    label: "General Dept Coordinator",
    scopeLevel: "department",
  },
  {
    key: "academic_coordinator",
    label: "Academic Coordinator",
    scopeLevel: "stream",
  },
  {
    key: "workshop_superintendent",
    label: "Workshop Superintendent",
    scopeLevel: "institution",
  },
  { key: "sf_office", label: "SF Office Superintendent", scopeLevel: "stream" },
] as const;

const LEADERSHIP_ROLE_KEYS = new Set<string>(LEADERSHIP_ROLES.map((r) => r.key));

const ROLE_SELECT_ITEMS = LEADERSHIP_ROLES.map((r) => ({
  value: r.key,
  label: r.label,
}));

function mapAssignmentError(err: unknown, fallback: string): string {
  const status = problemStatus(err);
  if (status === 409) {
    return getGeneralErrorMessage(
      err,
      "This leadership role is already occupied at the selected scope. End the existing assignment first."
    );
  }
  if (status === 403) {
    return getGeneralErrorMessage(
      err,
      "You are not authorized to manage this leadership assignment."
    );
  }
  if (status === 422) {
    return getGeneralErrorMessage(err, "Validation failed for this leadership assignment.");
  }
  return getGeneralErrorMessage(err, fallback);
}

export function PrincipalDepartmentsPage() {
  const client = useApiClient();
  const { state: sessionState } = useSession();

  const streamsApi = client.organisation?.streams ?? client.streams;
  const departmentsApi = client.organisation?.departments ?? client.departments;
  const batchesApi = client.organisation?.batches ?? client.batches;
  const roleAssignmentsApi =
    client.identity?.roleAssignments ?? client.roleAssignments;
  const usersApi = client.identity?.users ?? client.users;

  const [streams, setStreams] = React.useState<StreamSchema[]>([]);
  const [departments, setDepartments] = React.useState<DepartmentRow[]>([]);
  const [batches, setBatches] = React.useState<BatchRow[]>([]);
  const [assignments, setAssignments] = React.useState<RoleAssignmentSchema[]>([]);
  const [staffUsers, setStaffUsers] = React.useState<UserSchema[]>([]);

  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  // Manage Leadership Dialog state
  const [selectedDept, setSelectedDept] = React.useState<DepartmentRow | null>(null);
  const [appointRoleKey, setAppointRoleKey] =
    React.useState<LeadershipRoleKey>("hod");
  const [appointUserId, setAppointUserId] = React.useState<string>("");
  const [appointOrderRecord, setAppointOrderRecord] = React.useState("");
  const [appointFieldErrors, setAppointFieldErrors] = React.useState<
    Record<string, string>
  >({});
  const [dialogError, setDialogError] = React.useState<string | null>(null);
  const [appointSubmitting, setAppointSubmitting] = React.useState(false);

  // Revoke inline state inside the dialog
  const [revokingAssignment, setRevokingAssignment] =
    React.useState<RoleAssignmentSchema | null>(null);
  const [revokeReason, setRevokeReason] = React.useState("");
  const [revokeError, setRevokeError] = React.useState<string | null>(null);
  const [revokeSubmitting, setRevokeSubmitting] = React.useState(false);

  const institutionScopeLabel = React.useMemo(() => {
    const match = sessionState.user?.assignments?.find(
      (a) =>
        a.scope_type === "institution" &&
        isAssignmentActive(a) &&
        typeof a.scope_label === "string" &&
        a.scope_label.length > 0
    );
    return match?.scope_label ?? "";
  }, [sessionState.user?.assignments]);

  const loadData = React.useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    try {
      const [streamsRes, deptsRes, batchesRes, assignmentsRes, staffRes] =
        await Promise.all([
          streamsApi.list(),
          departmentsApi.list(),
          batchesApi.list(),
          roleAssignmentsApi.list({ active_only: true }),
          usersApi.list({ type: "staff", status: "active" }),
        ]);

      setStreams(streamsRes.data ?? []);
      setDepartments((deptsRes as { data?: DepartmentRow[] }).data ?? []);
      setBatches((batchesRes as { data?: BatchRow[] }).data ?? []);
      setAssignments(
        (assignmentsRes.data ?? []).filter((a) => a.is_active !== false)
      );
      setStaffUsers(staffRes.data ?? []);
    } catch (err: unknown) {
      setLoadError(
        getGeneralErrorMessage(err, "Failed to load departments and leadership.")
      );
    } finally {
      setLoading(false);
    }
  }, [streamsApi, departmentsApi, batchesApi, roleAssignmentsApi, usersApi]);

  React.useEffect(() => {
    void loadData();
  }, [loadData]);

  const streamById = React.useMemo(() => {
    const map = new Map<string, StreamSchema>();
    for (const s of streams) {
      map.set(s.id, s);
    }
    return map;
  }, [streams]);

  const streamByCode = React.useMemo(() => {
    const map = new Map<string, StreamSchema>();
    for (const s of streams) {
      map.set(s.code, s);
    }
    return map;
  }, [streams]);

  const resolveDeptStream = React.useCallback(
    (dept: DepartmentRow): StreamSchema | null => {
      if (dept.stream_id && streamById.has(dept.stream_id)) {
        return streamById.get(dept.stream_id) ?? null;
      }
      if (dept.stream && streamByCode.has(dept.stream)) {
        return streamByCode.get(dept.stream) ?? null;
      }
      return null;
    },
    [streamById, streamByCode]
  );

  const batchCountByDept = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const b of batches) {
      counts.set(b.home_department_id, (counts.get(b.home_department_id) ?? 0) + 1);
    }
    return counts;
  }, [batches]);

  const activeHodByScope = React.useMemo(() => {
    const map = new Map<string, RoleAssignmentSchema>();
    for (const a of assignments) {
      if (a.role_key === "hod" && a.is_active !== false) {
        map.set(a.scope_label, a);
      }
    }
    return map;
  }, [assignments]);

  const groupedByStream = React.useMemo(() => {
    const groups = new Map<
      string,
      { key: string; label: string; code: string; departments: DepartmentRow[] }
    >();

    for (const dept of departments) {
      const stream = resolveDeptStream(dept);
      const key = stream?.id ?? dept.stream ?? "other";
      const label = stream?.name ?? dept.stream ?? "Other";
      const code = stream?.code ?? dept.stream ?? "OTHER";

      const existing = groups.get(key);
      if (existing) {
        existing.departments.push(dept);
      } else {
        groups.set(key, { key, label, code, departments: [dept] });
      }
    }

    return Array.from(groups.values());
  }, [departments, resolveDeptStream]);

  const staffSelectItems = React.useMemo(
    () =>
      staffUsers.map((u) => ({
        value: u.id,
        label: u.email ? `${u.name} (${u.email})` : u.name,
      })),
    [staffUsers]
  );

  function openLeadershipDialog(dept: DepartmentRow) {
    setSelectedDept(dept);
    setAppointRoleKey("hod");
    setAppointUserId(staffUsers[0]?.id ?? "");
    setAppointOrderRecord("");
    setAppointFieldErrors({});
    setDialogError(null);
    setRevokingAssignment(null);
    setRevokeReason("");
    setRevokeError(null);
  }

  function resolveTargetScope(
    dept: DepartmentRow,
    roleKey: LeadershipRoleKey
  ): { scope_type: AssignScopeType; scope_label: string } {
    const meta = LEADERSHIP_ROLES.find((r) => r.key === roleKey);
    if (meta?.scopeLevel === "stream") {
      const stream = resolveDeptStream(dept);
      const streamLabel =
        stream?.scope_label ??
        (dept.stream ? `s_${dept.stream.toLowerCase()}` : dept.scope_label);
      return { scope_type: "stream", scope_label: streamLabel };
    }
    if (meta?.scopeLevel === "institution") {
      return {
        scope_type: "institution",
        scope_label: institutionScopeLabel || dept.scope_label,
      };
    }
    return { scope_type: "department", scope_label: dept.scope_label };
  }

  const dialogAssignments = React.useMemo(() => {
    if (!selectedDept) return [];
    const stream = resolveDeptStream(selectedDept);
    const validScopes = new Set<string>([selectedDept.scope_label]);
    if (stream?.scope_label) validScopes.add(stream.scope_label);
    if (institutionScopeLabel) validScopes.add(institutionScopeLabel);

    return assignments.filter(
      (a) =>
        LEADERSHIP_ROLE_KEYS.has(a.role_key) &&
        a.is_active !== false &&
        validScopes.has(a.scope_label)
    );
  }, [selectedDept, assignments, resolveDeptStream, institutionScopeLabel]);

  async function handleAppointSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedDept || appointSubmitting) return;

    const fieldErrs: Record<string, string> = {};
    if (!appointUserId) {
      fieldErrs.user_id = "Select a staff member to appoint.";
    }
    if (Object.keys(fieldErrs).length > 0) {
      setAppointFieldErrors(fieldErrs);
      setDialogError(null);
      return;
    }

    setAppointSubmitting(true);
    setAppointFieldErrors({});
    setDialogError(null);

    const { scope_type, scope_label } = resolveTargetScope(
      selectedDept,
      appointRoleKey
    );

    try {
      await roleAssignmentsApi.create({
        user_id: appointUserId,
        role_key: appointRoleKey,
        scope_type,
        scope_label,
        order_record: appointOrderRecord.trim() || null,
      });

      toast.success("Leadership role appointed.");
      setAppointOrderRecord("");
      await loadData();
    } catch (err: unknown) {
      const mapped = mapProblemFieldErrors(err);
      if (Object.keys(mapped).length > 0) {
        setAppointFieldErrors(mapped);
      }
      setDialogError(
        mapAssignmentError(err, "Failed to appoint leadership role.")
      );
    } finally {
      setAppointSubmitting(false);
    }
  }

  async function handleRevokeConfirm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!revokingAssignment || revokeSubmitting) return;

    const trimmedReason = revokeReason.trim();
    if (trimmedReason.length < 3) {
      setRevokeError("Provide a reason (at least 3 characters) to end this assignment.");
      return;
    }

    setRevokeSubmitting(true);
    setRevokeError(null);
    setDialogError(null);

    try {
      await roleAssignmentsApi.delete(revokingAssignment.id, trimmedReason);
      toast.success("Leadership assignment ended.");
      setRevokingAssignment(null);
      setRevokeReason("");
      await loadData();
    } catch (err: unknown) {
      const msg = mapAssignmentError(err, "Failed to end leadership assignment.");
      setRevokeError(msg);
      setDialogError(msg);
    } finally {
      setRevokeSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Departments"
        description="View departments grouped by stream, check active HOD coverage, and manage department leadership."
      />

      {loading && (
        <div className="space-y-4" aria-busy="true">
          <Skeleton className="h-36 w-full rounded-xl" />
          <Skeleton className="h-36 w-full rounded-xl" />
        </div>
      )}

      {!loading && loadError && (
        <Alert variant="destructive">
          <RiAlertLine className="size-4" aria-hidden="true" />
          <AlertTitle>Unable to load departments</AlertTitle>
          <AlertDescription className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <span>{loadError}</span>
            <Button type="button" variant="outline" size="sm" onClick={() => void loadData()}>
              <RiRefreshLine className="size-4" aria-hidden="true" />
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {!loading && !loadError && departments.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No departments are configured for this institution yet.
          </CardContent>
        </Card>
      )}

      {!loading && !loadError && groupedByStream.length > 0 && (
        <div className="space-y-6">
          {groupedByStream.map((group) => (
            <Card key={group.key}>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <RiBuilding2Line className="size-4 text-primary" aria-hidden="true" />
                    <CardTitle className="text-base">{group.label}</CardTitle>
                    <Badge variant="outline" className="font-mono text-xs">
                      {group.code}
                    </Badge>
                  </div>
                  <CardDescription>
                    {group.departments.length} department(s)
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Department</TableHead>
                      <TableHead>Code</TableHead>
                      <TableHead>Active HOD</TableHead>
                      <TableHead className="text-right">Batches</TableHead>
                      <TableHead className="text-right">Leadership</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {group.departments.map((dept) => {
                      const activeHod = activeHodByScope.get(dept.scope_label);
                      const batchCount = batchCountByDept.get(dept.id) ?? 0;

                      return (
                        <TableRow key={dept.id}>
                          <TableCell className="whitespace-normal">
                            <div className="font-medium text-foreground">{dept.name}</div>
                            {dept.kind && (
                              <div className="text-xs capitalize text-muted-foreground">
                                {dept.kind}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="font-mono">
                              {dept.code}
                            </Badge>
                          </TableCell>
                          <TableCell className="whitespace-normal">
                            {activeHod ? (
                              <div>
                                <div className="text-sm font-medium text-foreground">
                                  {activeHod.user?.name ?? activeHod.user_id}
                                </div>
                                {activeHod.user?.email && (
                                  <div className="text-xs text-muted-foreground">
                                    {activeHod.user.email}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <StatusBadge status="warning">Vacant</StatusBadge>
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {batchCount}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => openLeadershipDialog(dept)}
                            >
                              <RiUserSettingsLine className="size-4" aria-hidden="true" />
                              Manage leadership
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Manage Leadership Dialog */}
      <Dialog
        open={selectedDept !== null}
        onOpenChange={(open) => {
          if (!open && !appointSubmitting && !revokeSubmitting) {
            setSelectedDept(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              Manage Leadership — {selectedDept?.name} ({selectedDept?.code})
            </DialogTitle>
            <DialogDescription>
              Appoint or end department and stream leadership assignments.
            </DialogDescription>
          </DialogHeader>

          {dialogError && (
            <Alert variant="destructive">
              <RiAlertLine className="size-4" aria-hidden="true" />
              <AlertDescription>{dialogError}</AlertDescription>
            </Alert>
          )}

          {/* Active Leadership Assignments */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-foreground">
              Active Leadership Assignments
            </h3>
            {dialogAssignments.length === 0 ? (
              <p className="rounded-lg border border-border p-3 text-xs text-muted-foreground">
                No active leadership roles are assigned in this context.
              </p>
            ) : (
              <div className="space-y-2">
                {dialogAssignments.map((assignment) => (
                  <div
                    key={assignment.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg border border-border p-3"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline">
                          {assignment.role_name || assignment.role_key}
                        </Badge>
                        <span className="text-sm font-medium text-foreground">
                          {assignment.user?.name ?? assignment.user_id}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground font-mono">
                        {assignment.scope_type}: {assignment.scope_label}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={revokeSubmitting || appointSubmitting}
                      onClick={() => {
                        setRevokingAssignment(assignment);
                        setRevokeReason("");
                        setRevokeError(null);
                      }}
                    >
                      End assignment
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Inline Revoke Confirmation */}
          {revokingAssignment && (
            <form
              onSubmit={handleRevokeConfirm}
              noValidate
              className="space-y-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3"
            >
              <div className="text-sm font-medium text-foreground">
                End {revokingAssignment.role_name || revokingAssignment.role_key} for{" "}
                {revokingAssignment.user?.name ?? revokingAssignment.user_id}
              </div>

              {revokeError && (
                <p role="alert" className="text-xs text-destructive">
                  {revokeError}
                </p>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="revoke-reason">Reason</Label>
                <Textarea
                  id="revoke-reason"
                  value={revokeReason}
                  onChange={(e) => {
                    setRevokeReason(e.target.value);
                    setRevokeError(null);
                  }}
                  placeholder="Enter reason for ending this leadership assignment"
                  disabled={revokeSubmitting}
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={revokeSubmitting}
                  onClick={() => {
                    setRevokingAssignment(null);
                    setRevokeError(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="destructive"
                  size="sm"
                  disabled={revokeSubmitting}
                >
                  {revokeSubmitting ? "Ending..." : "Confirm End Assignment"}
                </Button>
              </div>
            </form>
          )}

          {/* Appoint Leadership Form */}
          <form
            onSubmit={handleAppointSubmit}
            noValidate
            className="space-y-3 border-t border-border pt-4"
          >
            <h3 className="text-sm font-medium text-foreground">Appoint Leadership Role</h3>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="appoint-role-key">Role</Label>
                <Select
                  value={appointRoleKey}
                  onValueChange={(val) => {
                    if (typeof val === "string" && LEADERSHIP_ROLE_KEYS.has(val)) {
                      setAppointRoleKey(val as LeadershipRoleKey);
                    }
                  }}
                  items={ROLE_SELECT_ITEMS}
                  disabled={appointSubmitting}
                >
                  <SelectTrigger id="appoint-role-key" className="w-full">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_SELECT_ITEMS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="appoint-staff-user">Staff Member</Label>
                <Select
                  value={appointUserId}
                  onValueChange={(val) => {
                    if (typeof val === "string") {
                      setAppointUserId(val);
                      setAppointFieldErrors((prev) => ({ ...prev, user_id: "" }));
                    }
                  }}
                  items={staffSelectItems}
                  disabled={appointSubmitting || staffSelectItems.length === 0}
                >
                  <SelectTrigger id="appoint-staff-user" className="w-full">
                    <SelectValue placeholder="Select staff member" />
                  </SelectTrigger>
                  <SelectContent>
                    {staffSelectItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {appointFieldErrors.user_id && (
                  <p className="text-xs text-destructive">{appointFieldErrors.user_id}</p>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="appoint-order-record">Official Order Reference (optional)</Label>
              <Input
                id="appoint-order-record"
                value={appointOrderRecord}
                onChange={(e) => setAppointOrderRecord(e.target.value)}
                placeholder="e.g. GO-2026-042"
                disabled={appointSubmitting}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={appointSubmitting || revokeSubmitting}
                onClick={() => setSelectedDept(null)}
              >
                Close
              </Button>
              <Button type="submit" disabled={appointSubmitting || revokeSubmitting}>
                {appointSubmitting ? (
                  <>
                    <RiLoader4Line className="size-4 animate-spin" aria-hidden="true" />
                    Appointing...
                  </>
                ) : (
                  "Appoint"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}


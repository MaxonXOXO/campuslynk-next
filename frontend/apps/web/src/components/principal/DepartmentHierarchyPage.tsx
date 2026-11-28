"use client";

import * as React from "react";
import Link from "next/link";
import type { components } from "@academic-suite/api-client";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  buttonVariants,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  PageHeader,
  Popover,
  PopoverContent,
  PopoverTrigger,
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
  cn,
} from "@academic-suite/ui";
import {
  RiAlertLine,
  RiArrowLeftLine,
  RiBuilding2Line,
  RiCheckLine,
  RiExpandUpDownLine,
  RiGraduationCapLine,
  RiLoader4Line,
  RiSearchLine,
  RiShieldUserLine,
  RiUserAddLine,
  RiUserSettingsLine,
} from "@remixicon/react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  STALE_TIME_REFERENCE_MS,
  scopedQueryKey,
  useApiQuery,
  useQueryScope,
} from "@/lib/query/api-query";
import { useApiClient, useSession } from "@/lib/auth/session-provider";
import { problemStatus } from "@/lib/auth/problem";
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
  name?: string;
  code?: string;
  scope_label?: string;
  home_department_id: string;
  managing_department_id?: string;
  semester?: number;
  status?: string;
}

type HierarchyRoleKey =
  | "hod"
  | "gen_dept_coordinator"
  | "academic_coordinator"
  | "workshop_superintendent"
  | "sf_office"
  | "tutor"
  | "mentor"
  | "lecturer"
  | "demonstrator"
  | "workshop_instructor"
  | "trade_instructor"
  | "tradesman";

interface HierarchyRoleMeta {
  key: HierarchyRoleKey;
  label: string;
  tier: "leadership" | "batch" | "staff";
  scopeLevel: "department" | "stream" | "institution" | "batch";
}

const HIERARCHY_ROLES: readonly HierarchyRoleMeta[] = [
  { key: "hod", label: "Head of Department (HOD)", tier: "leadership", scopeLevel: "department" },
  {
    key: "gen_dept_coordinator",
    label: "General Dept Coordinator",
    tier: "leadership",
    scopeLevel: "department",
  },
  {
    key: "academic_coordinator",
    label: "Academic Coordinator",
    tier: "leadership",
    scopeLevel: "stream",
  },
  {
    key: "workshop_superintendent",
    label: "Workshop Superintendent",
    tier: "leadership",
    scopeLevel: "institution",
  },
  {
    key: "sf_office",
    label: "SF Office Superintendent",
    tier: "leadership",
    scopeLevel: "institution",
  },
  { key: "tutor", label: "Tutor", tier: "batch", scopeLevel: "batch" },
  { key: "mentor", label: "Mentor (Staff Advisor)", tier: "batch", scopeLevel: "batch" },
  { key: "lecturer", label: "Lecturer", tier: "staff", scopeLevel: "department" },
  { key: "demonstrator", label: "Demonstrator", tier: "staff", scopeLevel: "department" },
  {
    key: "workshop_instructor",
    label: "Workshop Instructor",
    tier: "staff",
    scopeLevel: "department",
  },
  { key: "trade_instructor", label: "Trade Instructor", tier: "staff", scopeLevel: "department" },
  { key: "tradesman", label: "Tradesman", tier: "staff", scopeLevel: "department" },
] as const;

const LEADERSHIP_ROLE_KEYS = new Set<string>(
  HIERARCHY_ROLES.filter((r) => r.tier === "leadership" && r.key !== "hod").map((r) => r.key)
);
const BATCH_ROLE_KEYS = new Set<string>(
  HIERARCHY_ROLES.filter((r) => r.tier === "batch").map((r) => r.key)
);
const STAFF_ROLE_KEYS = new Set<string>(
  HIERARCHY_ROLES.filter((r) => r.tier === "staff").map((r) => r.key)
);

interface HierarchyData {
  streams: StreamSchema[];
  departments: DepartmentRow[];
  batches: BatchRow[];
  assignments: RoleAssignmentSchema[];
  staffUsers: UserSchema[];
}

export interface DepartmentHierarchyPageProps {
  departmentId: string;
}

export function DepartmentHierarchyPage({ departmentId }: DepartmentHierarchyPageProps) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const scope = useQueryScope();
  const { state: sessionState } = useSession();

  const institutionScope = React.useMemo(() => {
    const found = sessionState.user?.assignments?.find(
      (a) => a.scope_type === "institution"
    );
    return found?.scope_label ?? "institution";
  }, [sessionState.user]);

  const queryKey = React.useMemo(
    () => ["principal", "departments", "hierarchy", departmentId] as const,
    [departmentId]
  );

  const {
    data,
    isPending: loading,
    error: queryError,
    refetch,
  } = useApiQuery<HierarchyData>({
    queryKey,
    staleTime: STALE_TIME_REFERENCE_MS,
    queryFn: async (api) => {
      const streamsApi = api.organisation?.streams ?? api.streams;
      const deptsApi = api.organisation?.departments ?? api.departments;
      const batchesApi = api.organisation?.batches ?? api.batches;
      const roleAssignmentsApi = api.identity?.roleAssignments ?? api.roleAssignments;
      const usersApi = api.identity?.users ?? api.users;

      const [streamsRes, deptsRes, batchesRes, assignmentsRes, staffRes] =
        await Promise.all([
          streamsApi.list(),
          deptsApi.list(),
          batchesApi.list(),
          roleAssignmentsApi.list({ active_only: true }),
          usersApi.list({ type: "staff", status: "active", per_page: 100 }),
        ]);

      return {
        streams: (streamsRes as { data?: StreamSchema[] }).data ?? [],
        departments: (deptsRes as { data?: DepartmentRow[] }).data ?? [],
        batches: (batchesRes as { data?: BatchRow[] }).data ?? [],
        assignments:
          (assignmentsRes as { data?: RoleAssignmentSchema[] }).data ?? [],
        staffUsers: (staffRes as { data?: UserSchema[] }).data ?? [],
      };
    },
  });

  const [staffFilter, setStaffFilter] = React.useState("");
  const [roleKey, setRoleKey] = React.useState<HierarchyRoleKey>("hod");
  const [selectedUserId, setSelectedUserId] = React.useState<string>("");
  const [selectedBatchScope, setSelectedBatchScope] = React.useState<string>("");
  const [staffPickerOpen, setStaffPickerOpen] = React.useState(false);
  const [orderRecord, setOrderRecord] = React.useState("");
  const [formError, setFormError] = React.useState<string | null>(null);
  const [appointSubmitting, setAppointSubmitting] = React.useState(false);

  const [endingAssignment, setEndingAssignment] =
    React.useState<RoleAssignmentSchema | null>(null);
  const [endReason, setEndReason] = React.useState("");
  const [endReasonError, setEndReasonError] = React.useState<string | null>(null);
  const [revokeSubmitting, setRevokeSubmitting] = React.useState(false);

  const dept = React.useMemo(
    () => (data?.departments ?? []).find((d) => d.id === departmentId) ?? null,
    [data?.departments, departmentId]
  );

  const stream = React.useMemo(() => {
    if (!dept) return null;
    return (
      (data?.streams ?? []).find(
        (s) => s.id === dept.stream_id || s.code === dept.stream
      ) ?? null
    );
  }, [data?.streams, dept]);

  const deptBatches = React.useMemo(() => {
    if (!dept) return [];
    return (data?.batches ?? []).filter(
      (b) =>
        b.home_department_id === dept.id || b.managing_department_id === dept.id
    );
  }, [data?.batches, dept]);

  React.useEffect(() => {
    if (!selectedUserId && data?.staffUsers && data.staffUsers.length > 0) {
      setSelectedUserId(data.staffUsers[0]!.id);
    }
  }, [data?.staffUsers, selectedUserId]);

  React.useEffect(() => {
    if (!selectedBatchScope && deptBatches.length > 0) {
      const first = deptBatches[0]!;
      setSelectedBatchScope(first.scope_label ?? first.id);
    }
  }, [deptBatches, selectedBatchScope]);

  const activeAssignments = React.useMemo(
    () => (data?.assignments ?? []).filter((a) => a.is_active !== false),
    [data?.assignments]
  );

  const activeHod = React.useMemo(() => {
    if (!dept) return null;
    return (
      activeAssignments.find(
        (a) => a.role_key === "hod" && a.scope_label === dept.scope_label
      ) ?? null
    );
  }, [activeAssignments, dept]);

  const coordinatorAssignments = React.useMemo(() => {
    if (!dept) return [];
    const allowedScopes = new Set<string>([dept.scope_label, institutionScope]);
    if (stream?.scope_label) allowedScopes.add(stream.scope_label);
    return activeAssignments.filter(
      (a) =>
        LEADERSHIP_ROLE_KEYS.has(a.role_key) && allowedScopes.has(a.scope_label)
    );
  }, [activeAssignments, dept, stream?.scope_label, institutionScope]);

  const batchAssignmentsByScope = React.useMemo(() => {
    const map = new Map<string, RoleAssignmentSchema[]>();
    for (const a of activeAssignments) {
      if (!BATCH_ROLE_KEYS.has(a.role_key)) continue;
      const list = map.get(a.scope_label) ?? [];
      list.push(a);
      map.set(a.scope_label, list);
    }
    return map;
  }, [activeAssignments]);

  const deptStaffAssignments = React.useMemo(() => {
    if (!dept) return [];
    const q = staffFilter.trim().toLowerCase();
    return activeAssignments.filter((a) => {
      if (!STAFF_ROLE_KEYS.has(a.role_key)) return false;
      if (a.scope_label !== dept.scope_label) return false;
      if (!q) return true;
      const name = (a.user?.name ?? "").toLowerCase();
      const email = (a.user?.email ?? "").toLowerCase();
      const role = (a.role_name ?? a.role_key).toLowerCase();
      return name.includes(q) || email.includes(q) || role.includes(q);
    });
  }, [activeAssignments, dept, staffFilter]);

  const totalHierarchyCount = React.useMemo(() => {
    let count = activeHod ? 1 : 0;
    count += coordinatorAssignments.length;
    for (const b of deptBatches) {
      const key = b.scope_label ?? b.id;
      count += (batchAssignmentsByScope.get(key) ?? []).length;
    }
    if (dept) {
      count += activeAssignments.filter(
        (a) => STAFF_ROLE_KEYS.has(a.role_key) && a.scope_label === dept.scope_label
      ).length;
    }
    return count;
  }, [
    activeHod,
    coordinatorAssignments.length,
    deptBatches,
    batchAssignmentsByScope,
    dept,
    activeAssignments,
  ]);

  const selectedRoleMeta = React.useMemo(
    () => HIERARCHY_ROLES.find((r) => r.key === roleKey) ?? HIERARCHY_ROLES[0]!,
    [roleKey]
  );

  const selectedStaff = React.useMemo(
    () => (data?.staffUsers ?? []).find((u) => u.id === selectedUserId) ?? null,
    [data?.staffUsers, selectedUserId]
  );

  function resolveScopeForRole(meta: HierarchyRoleMeta): {
    scope_type: AssignScopeType;
    scope_label: string;
  } {
    if (meta.scopeLevel === "batch") {
      return {
        scope_type: "batch",
        scope_label: selectedBatchScope,
      };
    }
    if (meta.scopeLevel === "stream" && stream?.scope_label) {
      return {
        scope_type: "stream",
        scope_label: stream.scope_label,
      };
    }
    if (meta.scopeLevel === "institution") {
      return {
        scope_type: "institution",
        scope_label: institutionScope,
      };
    }
    return {
      scope_type: "department",
      scope_label: dept?.scope_label ?? "",
    };
  }

  async function refreshHierarchy() {
    await queryClient.invalidateQueries({
      queryKey: scopedQueryKey(scope, ...queryKey),
    });
    await queryClient.invalidateQueries({
      queryKey: scopedQueryKey(scope, "principal", "departments"),
    });
    await queryClient.invalidateQueries({
      queryKey: scopedQueryKey(scope, "principal", "overview"),
    });
  }

  async function handleAppoint(e: React.FormEvent) {
    e.preventDefault();
    if (!dept || !selectedUserId || appointSubmitting) return;

    const targetScope = resolveScopeForRole(selectedRoleMeta);
    if (!targetScope.scope_label) {
      setFormError(
        selectedRoleMeta.scopeLevel === "batch"
          ? "Select an active batch before assigning a Tutor or Mentor."
          : "Missing target scope for this role."
      );
      return;
    }

    setAppointSubmitting(true);
    setFormError(null);

    try {
      const roleAssignmentsApi =
        client.identity?.roleAssignments ?? client.roleAssignments;
      await roleAssignmentsApi.create({
        user_id: selectedUserId,
        role_key: roleKey,
        scope_type: targetScope.scope_type,
        scope_label: targetScope.scope_label,
        order_record: orderRecord.trim() || undefined,
      });

      toast.success(`Appointed ${selectedRoleMeta.label}.`);
      setOrderRecord("");
      await refreshHierarchy();
    } catch (err) {
      const status = problemStatus(err);
      if (status === 422) {
        const fields = mapProblemFieldErrors(err);
        setFormError(
          Object.values(fields)[0] ??
            getGeneralErrorMessage(err, "Cannot appoint this user to the selected role.")
        );
      } else if (status === 409) {
        setFormError(
          getGeneralErrorMessage(
            err,
            "This singleton role is already occupied for the selected scope. End the current assignment first."
          )
        );
      } else if (status === 403) {
        setFormError(
          getGeneralErrorMessage(
            err,
            "You do not have permission to appoint this role."
          )
        );
      } else {
        setFormError(getGeneralErrorMessage(err, "Failed to appoint role."));
      }
    } finally {
      setAppointSubmitting(false);
    }
  }

  async function handleConfirmEndAssignment() {
    if (!endingAssignment || revokeSubmitting) return;
    const trimmedReason = endReason.trim();
    if (!trimmedReason) {
      setEndReasonError("Please provide a reason before ending this assignment.");
      return;
    }

    setRevokeSubmitting(true);
    setEndReasonError(null);
    setFormError(null);

    try {
      const roleAssignmentsApi =
        client.identity?.roleAssignments ?? client.roleAssignments;
      await roleAssignmentsApi.delete(endingAssignment.id, trimmedReason);
      toast.success(
        `Ended ${endingAssignment.role_name ?? endingAssignment.role_key} assignment.`
      );
      setEndingAssignment(null);
      setEndReason("");
      await refreshHierarchy();
    } catch (err) {
      setFormError(
        getGeneralErrorMessage(err, "Failed to end leadership assignment.")
      );
      setEndingAssignment(null);
    } finally {
      setRevokeSubmitting(false);
    }
  }

  const loadError = queryError
    ? getGeneralErrorMessage(queryError, "Failed to load department hierarchy.")
    : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={dept ? `${dept.name} (${dept.code})` : "Department Hierarchy"}
        description={
          dept
            ? `${stream?.name ?? dept.stream ?? "Institution"} · Manage HOD, coordinators, batch tutors, mentors, and department staff.`
            : "Inspect department leadership and staff hierarchy."
        }
        actions={
          <Link
            href="/w/principal/departments"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <RiArrowLeftLine className="size-4" aria-hidden="true" />
            Back to Departments
          </Link>
        }
      />

      {loading && (
        <div className="space-y-4" aria-busy="true">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
          </div>
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      )}

      {!loading && loadError && (
        <Alert variant="destructive">
          <RiAlertLine className="size-4" aria-hidden="true" />
          <AlertTitle>Unable to load department hierarchy</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            <span>{loadError}</span>
            <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {!loading && !loadError && !dept && (
        <Card>
          <CardHeader>
            <CardTitle>Department not found</CardTitle>
            <CardDescription>
              No department matches ID <code>{departmentId}</code>.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href="/w/principal/departments"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Return to Departments
            </Link>
          </CardContent>
        </Card>
      )}

      {!loading && !loadError && dept && (
        <>
          {/* Summary KPI Strip */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Active HOD</CardDescription>
                <CardTitle className="text-base">
                  {activeHod ? (
                    activeHod.user?.name ?? activeHod.user_id
                  ) : (
                    <StatusBadge status="warning">Vacant</StatusBadge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {activeHod?.user?.email ?? "No Head of Department appointed."}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Assigned Personnel</CardDescription>
                <CardTitle className="text-2xl tabular-nums">
                  {totalHierarchyCount}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                Active role assignments in this branch hierarchy
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Active Batches</CardDescription>
                <CardTitle className="text-2xl tabular-nums">
                  {deptBatches.length}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                Batches managed or hosted by {dept.code}
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
            {/* Left: Tiered Hierarchy */}
            <div className="space-y-6">
              {/* Tier 1: Department & Stream Leadership */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <RiShieldUserLine className="size-4 text-primary" aria-hidden="true" />
                    <CardTitle className="text-base">
                      Tier 1 · Department &amp; Stream Leadership
                    </CardTitle>
                  </div>
                  <CardDescription>
                    Head of Department (singleton) and stream/department coordinators.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* HOD Card */}
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 p-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">
                          Head of Department (HOD)
                        </span>
                        <Badge variant="outline" className="font-mono text-[11px]">
                          {dept.scope_label}
                        </Badge>
                      </div>
                      {activeHod ? (
                        <div className="text-sm text-foreground">
                          {activeHod.user?.name ?? activeHod.user_id}{" "}
                          {activeHod.user?.email && (
                            <span className="text-xs text-muted-foreground">
                              ({activeHod.user.email})
                            </span>
                          )}
                        </div>
                      ) : (
                        <StatusBadge status="warning">Vacant</StatusBadge>
                      )}
                    </div>
                    {activeHod && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={revokeSubmitting}
                        onClick={() => {
                          setEndingAssignment(activeHod);
                          setEndReason("");
                          setEndReasonError(null);
                        }}
                      >
                        End assignment
                      </Button>
                    )}
                  </div>

                  {/* Other Leadership Coordinators */}
                  {coordinatorAssignments.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No additional coordinators or superintendents assigned in this context.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {coordinatorAssignments.map((a) => (
                        <div
                          key={a.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-medium text-foreground">
                                {a.role_name ?? a.role_key}
                              </span>
                              <Badge variant="secondary" className="font-mono text-[11px]">
                                {a.scope_label}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {a.user?.name ?? a.user_id}
                              {a.user?.email ? ` · ${a.user.email}` : ""}
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={revokeSubmitting}
                            onClick={() => {
                              setEndingAssignment(a);
                              setEndReason("");
                              setEndReasonError(null);
                            }}
                          >
                            End assignment
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Tier 2: Batch Tutors & Mentors */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <RiGraduationCapLine className="size-4 text-primary" aria-hidden="true" />
                    <CardTitle className="text-base">
                      Tier 2 · Batch Tutors &amp; Mentors (Staff Advisors)
                    </CardTitle>
                  </div>
                  <CardDescription>
                    Tutors and mentors scoped to active batches in {dept.name}.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {deptBatches.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                      No batches are configured for {dept.code} yet. Once batches exist, Tutors
                      and Mentors can be assigned per batch.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {deptBatches.map((batch) => {
                        const batchScope = batch.scope_label ?? batch.id;
                        const batchRoles = batchAssignmentsByScope.get(batchScope) ?? [];
                        return (
                          <div
                            key={batch.id}
                            className="rounded-lg border border-border p-3 space-y-2"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold text-foreground">
                                  {batch.name ?? batch.code ?? batch.id}
                                </span>
                                <Badge variant="outline" className="font-mono text-[11px]">
                                  {batchScope}
                                </Badge>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setRoleKey("tutor");
                                  setSelectedBatchScope(batchScope);
                                }}
                              >
                                + Assign to batch
                              </Button>
                            </div>
                            {batchRoles.length === 0 ? (
                              <p className="text-xs text-muted-foreground">
                                No Tutor or Mentor assigned to this batch yet.
                              </p>
                            ) : (
                              <div className="space-y-1.5">
                                {batchRoles.map((a) => (
                                  <div
                                    key={a.id}
                                    className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/40 px-2.5 py-1.5 text-xs"
                                  >
                                    <div>
                                      <span className="font-medium text-foreground">
                                        {a.role_name ?? a.role_key}:
                                      </span>{" "}
                                      <span>{a.user?.name ?? a.user_id}</span>
                                    </div>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 px-2 text-xs"
                                      onClick={() => {
                                        setEndingAssignment(a);
                                        setEndReason("");
                                        setEndReasonError(null);
                                      }}
                                    >
                                      End
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Tier 3: Teaching & Lab Staff */}
              <Card>
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <RiBuilding2Line className="size-4 text-primary" aria-hidden="true" />
                      <div>
                        <CardTitle className="text-base">
                          Tier 3 · Teaching &amp; Lab Staff
                        </CardTitle>
                        <CardDescription>
                          Lecturers, demonstrators, and workshop staff assigned to {dept.code}.
                        </CardDescription>
                      </div>
                    </div>
                    <div className="relative w-full sm:w-56">
                      <RiSearchLine
                        className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <Input
                        type="search"
                        value={staffFilter}
                        onChange={(e) => setStaffFilter(e.target.value)}
                        placeholder="Filter assigned staff..."
                        aria-label="Filter assigned staff"
                        className="h-8 pl-8"
                      />
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {deptStaffAssignments.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                      No teaching or lab staff assignments match this filter.
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Staff Member</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {deptStaffAssignments.map((a) => (
                          <TableRow key={a.id}>
                            <TableCell className="whitespace-normal">
                              <div className="font-medium text-foreground">
                                {a.user?.name ?? a.user_id}
                              </div>
                              {a.user?.email && (
                                <div className="text-xs text-muted-foreground">
                                  {a.user.email}
                                </div>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary">
                                {a.role_name ?? a.role_key}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setEndingAssignment(a);
                                  setEndReason("");
                                  setEndReasonError(null);
                                }}
                              >
                                End assignment
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Right: Appoint / Assign Role Panel */}
            <div className="space-y-4">
              <Card className="sticky top-20">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <RiUserAddLine className="size-4 text-primary" aria-hidden="true" />
                    <CardTitle className="text-base">Appoint or Assign Role</CardTitle>
                  </div>
                  <CardDescription>
                    Search active staff and assign a role in {dept.code}.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={(e) => void handleAppoint(e)} className="space-y-4">
                    {formError && (
                      <Alert variant="destructive">
                        <RiAlertLine className="size-4" aria-hidden="true" />
                        <AlertDescription>{formError}</AlertDescription>
                      </Alert>
                    )}

                    <div className="space-y-1.5">
                      <Label htmlFor="hierarchy-role-select">Role</Label>
                      <Select
                        value={roleKey}
                        onValueChange={(v) => setRoleKey(v as HierarchyRoleKey)}
                      >
                        <SelectTrigger id="hierarchy-role-select" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {HIERARCHY_ROLES.map((r) => (
                            <SelectItem key={r.key} value={r.key}>
                              {r.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {selectedRoleMeta.scopeLevel === "batch" && (
                      <div className="space-y-1.5">
                        <Label htmlFor="hierarchy-batch-select">Target Batch</Label>
                        {deptBatches.length === 0 ? (
                          <p className="text-xs text-muted-foreground">
                            No batches available in {dept.code}.
                          </p>
                        ) : (
                          <Select
                            value={selectedBatchScope}
                            onValueChange={(v) => setSelectedBatchScope(v ?? "")}
                          >
                            <SelectTrigger id="hierarchy-batch-select" className="w-full">
                              <SelectValue placeholder="Select batch" />
                            </SelectTrigger>
                            <SelectContent>
                              {deptBatches.map((b) => {
                                const val = b.scope_label ?? b.id;
                                return (
                                  <SelectItem key={b.id} value={val}>
                                    {b.name ?? b.code ?? val}
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <Label>Staff Member</Label>
                      <Popover open={staffPickerOpen} onOpenChange={setStaffPickerOpen}>
                        <PopoverTrigger
                          render={
                            <Button
                              type="button"
                              variant="outline"
                              role="combobox"
                              aria-expanded={staffPickerOpen}
                              aria-label="Select staff member"
                              className="w-full justify-between font-normal"
                            >
                              <span className="truncate">
                                {selectedStaff
                                  ? `${selectedStaff.name}${selectedStaff.email ? ` (${selectedStaff.email})` : ""}`
                                  : "Search staff member..."}
                              </span>
                              <RiExpandUpDownLine
                                className="ml-2 size-4 shrink-0 opacity-50"
                                aria-hidden="true"
                              />
                            </Button>
                          }
                        />
                        <PopoverContent className="w-80 p-0" align="start">
                          <Command>
                            <CommandInput placeholder="Search by name or email..." />
                            <CommandList>
                              <CommandEmpty>No matching staff found.</CommandEmpty>
                              <CommandGroup>
                                {(data?.staffUsers ?? []).map((u) => (
                                  <CommandItem
                                    key={u.id}
                                    value={`${u.name} ${u.email ?? ""} ${u.registration_number ?? ""}`}
                                    onSelect={() => {
                                      setSelectedUserId(u.id);
                                      setStaffPickerOpen(false);
                                    }}
                                  >
                                    <RiCheckLine
                                      className={cn(
                                        "size-4 shrink-0",
                                        selectedUserId === u.id ? "opacity-100" : "opacity-0"
                                      )}
                                      aria-hidden="true"
                                    />
                                    <div className="flex min-w-0 flex-col">
                                      <span className="truncate font-medium">{u.name}</span>
                                      {u.email && (
                                        <span className="truncate text-xs text-muted-foreground">
                                          {u.email}
                                        </span>
                                      )}
                                    </div>
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="hierarchy-order-ref">
                        Official Order Reference (optional)
                      </Label>
                      <Input
                        id="hierarchy-order-ref"
                        value={orderRecord}
                        onChange={(e) => setOrderRecord(e.target.value)}
                        placeholder="e.g. GO-2026-042"
                        disabled={appointSubmitting}
                      />
                    </div>

                    <Button
                      type="submit"
                      className="w-full"
                      disabled={
                        appointSubmitting ||
                        !selectedUserId ||
                        (selectedRoleMeta.scopeLevel === "batch" && deptBatches.length === 0)
                      }
                    >
                      {appointSubmitting ? (
                        <RiLoader4Line className="size-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <RiUserSettingsLine className="size-4" aria-hidden="true" />
                      )}
                      Appoint
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}

      {/* Confirm End Assignment Modal */}
      <Dialog
        open={endingAssignment !== null}
        onOpenChange={(open) => {
          if (!open && !revokeSubmitting) {
            setEndingAssignment(null);
            setEndReason("");
            setEndReasonError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>End Leadership Assignment</DialogTitle>
            <DialogDescription>
              End {endingAssignment?.role_name ?? endingAssignment?.role_key} for{" "}
              {endingAssignment?.user?.name ?? endingAssignment?.user_id}. This action is
              recorded in the audit log.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="hierarchy-end-reason">Reason</Label>
            <Textarea
              id="hierarchy-end-reason"
              rows={3}
              value={endReason}
              onChange={(e) => {
                setEndReason(e.target.value);
                if (endReasonError) setEndReasonError(null);
              }}
              placeholder="e.g. Tenure completed or transferred"
              disabled={revokeSubmitting}
            />
            {endReasonError && (
              <p className="text-xs text-destructive" role="alert">
                {endReasonError}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={revokeSubmitting}
              onClick={() => {
                setEndingAssignment(null);
                setEndReason("");
                setEndReasonError(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={revokeSubmitting}
              onClick={() => void handleConfirmEndAssignment()}
            >
              {revokeSubmitting && (
                <RiLoader4Line className="size-4 animate-spin" aria-hidden="true" />
              )}
              Confirm End Assignment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


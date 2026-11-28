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
  PageHeader,
  Skeleton,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@academic-suite/ui";
import {
  RiAlertLine,
  RiBuilding2Line,
  RiUserSettingsLine,
} from "@remixicon/react";
import {
  STALE_TIME_REFERENCE_MS,
  useApiQuery,
} from "@/lib/query/api-query";
import { getGeneralErrorMessage } from "@/app/setup/logic/error-mapping";

type RoleAssignmentSchema = components["schemas"]["RoleAssignmentSchema"];
type StreamSchema = components["schemas"]["Stream"];

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

export function PrincipalDepartmentsPage() {
  const {
    data: deptData,
    isPending: loading,
    error: queryError,
    refetch,
  } = useApiQuery<{
    streams: StreamSchema[];
    departments: DepartmentRow[];
    batches: BatchRow[];
    assignments: RoleAssignmentSchema[];
  }>({
    queryKey: ["principal", "departments"],
    staleTime: STALE_TIME_REFERENCE_MS,
    queryFn: async (api) => {
      const streamsApi = api.organisation?.streams ?? api.streams;
      const departmentsApi = api.organisation?.departments ?? api.departments;
      const batchesApi = api.organisation?.batches ?? api.batches;
      const roleAssignments = api.identity?.roleAssignments ?? api.roleAssignments;

      const [streamsRes, deptsRes, batchesRes, assignmentsRes] =
        await Promise.all([
          streamsApi.list(),
          departmentsApi.list(),
          batchesApi.list(),
          roleAssignments.list({ active_only: true }),
        ]);

      return {
        streams: streamsRes.data ?? [],
        departments: (deptsRes as { data?: DepartmentRow[] }).data ?? [],
        batches: (batchesRes as { data?: BatchRow[] }).data ?? [],
        assignments: (assignmentsRes.data ?? []).filter((a) => a.is_active !== false),
      };
    },
  });

  const streams = React.useMemo(() => deptData?.streams ?? [], [deptData?.streams]);
  const departments = React.useMemo(() => deptData?.departments ?? [], [deptData?.departments]);
  const batches = React.useMemo(() => deptData?.batches ?? [], [deptData?.batches]);
  const assignments = React.useMemo(() => deptData?.assignments ?? [], [deptData?.assignments]);
  const loadError = queryError
    ? getGeneralErrorMessage(queryError, "Failed to load departments and leadership.")
    : null;

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
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            <span>{loadError}</span>
            <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
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
                            <Link
                              href={`/w/principal/departments/${dept.id}`}
                              className={buttonVariants({ variant: "outline", size: "sm" })}
                            >
                              <RiUserSettingsLine className="size-4" aria-hidden="true" />
                              Manage leadership
                            </Link>
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
    </div>
  );
}

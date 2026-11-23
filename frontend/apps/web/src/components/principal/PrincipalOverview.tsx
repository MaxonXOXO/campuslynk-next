"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import type { components } from "@academic-suite/api-client";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  buttonVariants,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
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
  cn,
} from "@academic-suite/ui";
import {
  RiAlertLine,
  RiArrowRightLine,
  RiBarChart2Line,
  RiBuilding2Line,
  RiGraduationCapLine,
  RiGroupLine,
  RiRefreshLine,
  RiStackLine,
  RiTableLine,
  RiUserReceivedLine,
} from "@remixicon/react";
import { useApiClient } from "@/lib/auth/session-provider";
import { getGeneralErrorMessage } from "@/app/setup/logic/error-mapping";
import type { UsersByTypeDatum } from "./PrincipalUsersChart";

const DynamicUsersChart = dynamic(
  () => import("./PrincipalUsersChart").then((m) => m.PrincipalUsersChart),
  {
    ssr: false,
    loading: () => <Skeleton className="h-64 w-full rounded-lg" />,
  }
);

type RoleAssignmentSchema = components["schemas"]["RoleAssignmentSchema"];

interface DepartmentRow {
  id: string;
  scope_label: string;
}

interface PrincipalOverviewState {
  staffCount: number;
  studentCount: number;
  parentCount: number;
  pendingCount: number;
  totalDepartments: number;
  coveredDepartments: number;
  activeBatchesCount: number;
}

export function PrincipalOverview() {
  const client = useApiClient();
  const usersApi = client.identity?.users ?? client.users;
  const roleAssignmentsApi = client.identity?.roleAssignments ?? client.roleAssignments;
  const departmentsApi = client.organisation?.departments ?? client.departments;
  const batchesApi = client.organisation?.batches ?? client.batches;

  const [data, setData] = React.useState<PrincipalOverviewState | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [showDataTable, setShowDataTable] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [
        staffRes,
        studentRes,
        parentRes,
        pendingRes,
        departmentsRes,
        hodAssignmentsRes,
        batchesRes,
      ] = await Promise.all([
        usersApi.list({ type: "staff", limit: 1 }),
        usersApi.list({ type: "student", limit: 1 }),
        usersApi.list({ type: "parent", limit: 1 }),
        usersApi.list({ status: "pending", limit: 1 }),
        departmentsApi.list(),
        roleAssignmentsApi.list({ role_key: "hod", active_only: true }),
        batchesApi.list({ query: { limit: 1 } }),
      ]);

      const departments = ((departmentsRes as { data?: DepartmentRow[] }).data ?? []);
      const activeHods = (hodAssignmentsRes.data ?? []).filter(
        (a: RoleAssignmentSchema) => a.is_active !== false
      );
      const hodScopeLabels = new Set(activeHods.map((a) => a.scope_label));
      const coveredDepartments = departments.filter((d) =>
        hodScopeLabels.has(d.scope_label)
      ).length;

      const batchesMeta = (batchesRes as { meta?: { total?: number } }).meta;
      const batchesList = (batchesRes as { data?: unknown[] }).data ?? [];

      setData({
        staffCount: staffRes.meta.total,
        studentCount: studentRes.meta.total,
        parentCount: parentRes.meta.total,
        pendingCount: pendingRes.meta.total,
        totalDepartments: departments.length,
        coveredDepartments,
        activeBatchesCount: batchesMeta?.total ?? batchesList.length,
      });
    } catch (err: unknown) {
      setError(getGeneralErrorMessage(err, "Failed to load Principal overview."));
    } finally {
      setLoading(false);
    }
  }, [usersApi, roleAssignmentsApi, departmentsApi, batchesApi]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const chartData: UsersByTypeDatum[] = React.useMemo(() => {
    if (!data) return [];
    return [
      { type: "Staff", count: data.staffCount },
      { type: "Students", count: data.studentCount },
      { type: "Parents", count: data.parentCount },
    ];
  }, [data]);

  const totalUsersForChart = data
    ? data.staffCount + data.studentCount + data.parentCount
    : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Principal Overview"
        description="Institution-wide staffing, student enrollment, department leadership coverage, and active batches."
      />

      {loading && (
        <div className="space-y-6" aria-busy="true">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Skeleton className="h-32 w-full rounded-xl" />
            <Skeleton className="h-32 w-full rounded-xl" />
            <Skeleton className="h-32 w-full rounded-xl" />
            <Skeleton className="h-32 w-full rounded-xl" />
            <Skeleton className="h-32 w-full rounded-xl" />
          </div>
          <Skeleton className="h-80 w-full rounded-xl" />
        </div>
      )}

      {!loading && error && (
        <Alert variant="destructive">
          <RiAlertLine className="size-4" aria-hidden="true" />
          <AlertTitle>Unable to load overview</AlertTitle>
          <AlertDescription className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <span>{error}</span>
            <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
              <RiRefreshLine className="size-4" aria-hidden="true" />
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {!loading && !error && data && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1.5">
                  <RiGroupLine className="size-4 text-primary" aria-hidden="true" />
                  Staff
                </CardDescription>
                <CardTitle className="text-2xl tabular-nums">{data.staffCount}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                Registered staff accounts
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1.5">
                  <RiGraduationCapLine className="size-4 text-primary" aria-hidden="true" />
                  Students
                </CardDescription>
                <CardTitle className="text-2xl tabular-nums">{data.studentCount}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                Enrolled student accounts
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardDescription className="flex items-center gap-1.5">
                    <RiUserReceivedLine className="size-4 text-primary" aria-hidden="true" />
                    Pending Accounts
                  </CardDescription>
                  {data.pendingCount > 0 && (
                    <StatusBadge status="warning">Pending</StatusBadge>
                  )}
                </div>
                <CardTitle className="text-2xl tabular-nums">{data.pendingCount}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                Awaiting activation
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardDescription className="flex items-center gap-1.5">
                    <RiBuilding2Line className="size-4 text-primary" aria-hidden="true" />
                    HOD Coverage
                  </CardDescription>
                  {data.totalDepartments > 0 && (
                    <StatusBadge
                      status={
                        data.coveredDepartments === data.totalDepartments ? "success" : "warning"
                      }
                    >
                      {data.coveredDepartments === data.totalDepartments ? "Full" : "Vacant"}
                    </StatusBadge>
                  )}
                </div>
                <CardTitle className="text-2xl tabular-nums">
                  {data.totalDepartments === 0
                    ? "0"
                    : `${data.coveredDepartments}/${data.totalDepartments}`}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {data.totalDepartments === 0
                  ? "No departments configured"
                  : "Departments with active HOD"}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1.5">
                  <RiStackLine className="size-4 text-primary" aria-hidden="true" />
                  Active Batches
                </CardDescription>
                <CardTitle className="text-2xl tabular-nums">
                  {data.activeBatchesCount}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                Visible institutional batches
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base">Accounts by User Type</CardTitle>
                <CardDescription>
                  Distribution of staff, student, and parent accounts across the institution.
                </CardDescription>
              </div>
              {totalUsersForChart > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDataTable((prev) => !prev)}
                  aria-pressed={showDataTable}
                >
                  {showDataTable ? (
                    <>
                      <RiBarChart2Line className="size-4" aria-hidden="true" />
                      Show chart
                    </>
                  ) : (
                    <>
                      <RiTableLine className="size-4" aria-hidden="true" />
                      Show data table
                    </>
                  )}
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {totalUsersForChart === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  No user accounts found yet. Create accounts from the Users directory.
                </div>
              ) : showDataTable ? (
                <Table aria-label="User accounts by type data table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>User Type</TableHead>
                      <TableHead className="text-right">Accounts</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {chartData.map((row) => (
                      <TableRow key={row.type}>
                        <TableCell className="font-medium">{row.type}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <DynamicUsersChart data={chartData} />
              )}
            </CardContent>
            <CardFooter className="flex flex-wrap gap-2 border-t border-border/60 pt-4">
              <Link
                href="/w/principal/departments"
                className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              >
                <span>View departments</span>
                <RiArrowRightLine className="size-4" aria-hidden="true" />
              </Link>
              <Link
                href="/w/principal/users"
                className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              >
                <span>Open users directory</span>
                <RiArrowRightLine className="size-4" aria-hidden="true" />
              </Link>
            </CardFooter>
          </Card>
        </>
      )}
    </div>
  );
}


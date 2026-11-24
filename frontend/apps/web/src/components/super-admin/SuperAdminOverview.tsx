"use client";

import * as React from "react";
import Link from "next/link";
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
  cn,
} from "@academic-suite/ui";
import {
  RiArrowRightLine,
  RiRefreshLine,
  RiSettings4Line,
  RiShieldUserLine,
  RiUserSettingsLine,
} from "@remixicon/react";
import type { components } from "@academic-suite/api-client";
import { STALE_TIME_LIST_MS, useApiQuery } from "@/lib/query/api-query";
import { formatDisplayDate } from "@/lib/format-date";
import { getGeneralErrorMessage } from "@/app/setup/logic/error-mapping";

type RoleAssignmentSchema = components["schemas"]["RoleAssignmentSchema"];

interface OverviewState {
  setupCompletedAt: string | null;
  activePrincipalAssignment: RoleAssignmentSchema | null;
  totalUsers: number;
}

export function SuperAdminOverview() {
  const {
    data,
    isPending: loading,
    isRefreshing,
    error: queryError,
    refetch,
  } = useApiQuery<OverviewState>({
    queryKey: ["super-admin", "overview"],
    staleTime: STALE_TIME_LIST_MS,
    queryFn: async (client) => {
      const [setupRes, assignmentsRes, usersRes] = await Promise.all([
        client.setup.status(),
        client.roleAssignments.list({ role_key: "principal", active_only: true }),
        client.users.list({ page: 1 }),
      ]);

      const setupData = (setupRes as { data?: { completed_at?: string | null } }).data;
      const activePrincipal =
        assignmentsRes.data.find((a) => a.is_active !== false) ?? null;

      return {
        setupCompletedAt: setupData?.completed_at ?? null,
        activePrincipalAssignment: activePrincipal,
        totalUsers: usersRes.meta.total,
      };
    },
  });

  const error = queryError
    ? getGeneralErrorMessage(queryError, "Failed to load Super Admin overview.")
    : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Super Admin Overview"
        description="Manage institutional configuration, Principal appointment, and user accounts."
        actions={
          isRefreshing ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <RiRefreshLine className="size-3.5 animate-spin" aria-hidden="true" />
              Refreshing…
            </span>
          ) : undefined
        }
      />

      {loading && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3" aria-busy="true">
          <Skeleton className="h-44 w-full rounded-xl" />
          <Skeleton className="h-44 w-full rounded-xl" />
          <Skeleton className="h-44 w-full rounded-xl" />
        </div>
      )}

      {!loading && error && (
        <Alert variant="destructive">
          <AlertTitle>Unable to load overview</AlertTitle>
          <AlertDescription className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <span>{error}</span>
            <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
              <RiRefreshLine className="size-4" aria-hidden="true" />
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {!loading && !error && data && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <RiSettings4Line className="size-4 text-primary" aria-hidden="true" />
                  Institution Setup
                </CardTitle>
                <StatusBadge status={data.setupCompletedAt ? "success" : "warning"}>
                  {data.setupCompletedAt ? "Completed" : "In Progress"}
                </StatusBadge>
              </div>
              <CardDescription>
                First-run profile, organisation structure, and academic calendar.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {data.setupCompletedAt
                ? `Finalized on ${formatDisplayDate(data.setupCompletedAt)}.`
                : "Required setup steps are still pending completion."}
            </CardContent>
            <CardFooter className="mt-auto">
              <Link
                href="/setup"
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "w-full justify-between"
                )}
              >
                <span>{data.setupCompletedAt ? "Review setup" : "Continue setup"}</span>
                <RiArrowRightLine className="size-4" aria-hidden="true" />
              </Link>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <RiShieldUserLine className="size-4 text-primary" aria-hidden="true" />
                  Current Principal
                </CardTitle>
                <StatusBadge
                  status={data.activePrincipalAssignment ? "success" : "warning"}
                  className={
                    !data.activePrincipalAssignment ? "dark:text-foreground" : undefined
                  }
                >
                  {data.activePrincipalAssignment ? "Appointed" : "Vacant"}
                </StatusBadge>
              </div>
              <CardDescription>
                Institution-scope singleton leadership assignment.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm">
              {data.activePrincipalAssignment ? (
                <div className="space-y-1">
                  <p className="font-medium text-foreground">
                    {data.activePrincipalAssignment.user?.name ??
                      data.activePrincipalAssignment.user_id}
                  </p>
                  {data.activePrincipalAssignment.user?.email && (
                    <p className="text-xs text-muted-foreground truncate">
                      {data.activePrincipalAssignment.user.email}
                    </p>
                  )}
                  {data.activePrincipalAssignment.valid_from && (
                    <p className="text-xs text-muted-foreground">
                      Active since{" "}
                      {formatDisplayDate(data.activePrincipalAssignment.valid_from)}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-muted-foreground">
                  No active Principal is currently appointed for this institution.
                </p>
              )}
            </CardContent>
            <CardFooter className="mt-auto">
              <Link
                href="/w/super-admin/principal"
                className={cn(
                  buttonVariants({
                    variant: data.activePrincipalAssignment ? "outline" : "default",
                    size: "sm",
                  }),
                  "w-full justify-between"
                )}
              >
                <span>
                  {data.activePrincipalAssignment ? "Manage Principal" : "Appoint Principal"}
                </span>
                <RiArrowRightLine className="size-4" aria-hidden="true" />
              </Link>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <RiUserSettingsLine className="size-4 text-primary" aria-hidden="true" />
                  User Accounts
                </CardTitle>
                <StatusBadge status="info">{data.totalUsers} total</StatusBadge>
              </div>
              <CardDescription>
                Directory of staff, student, and parent login accounts.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Update account details, suspend or reactivate access, and clear failed-login
              lockouts.
            </CardContent>
            <CardFooter className="mt-auto">
              <Link
                href="/w/super-admin/users"
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "w-full justify-between"
                )}
              >
                <span>Open users directory</span>
                <RiArrowRightLine className="size-4" aria-hidden="true" />
              </Link>
            </CardFooter>
          </Card>
        </div>
      )}
    </div>
  );
}


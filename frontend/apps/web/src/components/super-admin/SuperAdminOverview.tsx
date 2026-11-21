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
import { useApiClient } from "@/lib/auth/session-provider";
import {
  parsePaginatedRoleAssignments,
  parsePaginatedUsers,
  parseUserEnvelope,
  type RoleAssignmentRecord,
  type UserRecord,
} from "@/lib/api-narrowing";
import { getGeneralErrorMessage } from "@/app/setup/logic/error-mapping";

interface OverviewState {
  setupCompletedAt: string | null;
  activePrincipalAssignment: RoleAssignmentRecord | null;
  activePrincipalUser: UserRecord | null;
  totalUsers: number;
}

export function SuperAdminOverview() {
  const client = useApiClient();
  const [data, setData] = React.useState<OverviewState | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [setupRes, assignmentsRes, usersRes] = await Promise.all([
        client.setup.status(),
        client.roleAssignments.list({ role_key: "principal", active_only: true }),
        client.users.list({ page: 1 }),
      ]);

      const setupData = (setupRes as { data?: { completed_at?: string | null } }).data;
      const parsedAssignments = parsePaginatedRoleAssignments(assignmentsRes);
      const activePrincipal =
        parsedAssignments.data.find((a) => a.is_active !== false) ?? null;

      let principalUser: UserRecord | null = null;
      if (activePrincipal) {
        if (activePrincipal.user) {
          principalUser = {
            id: activePrincipal.user.id,
            type: "staff",
            name: activePrincipal.user.name,
            email: activePrincipal.user.email ?? null,
            mobile: activePrincipal.user.mobile ?? null,
            registration_number: null,
            status: "active",
            must_change_password: false,
            last_login_at: null,
            created_at: null,
            updated_at: null,
          };
        } else {
          try {
            const userRes = await client.users.get(activePrincipal.user_id);
            principalUser = parseUserEnvelope(userRes);
          } catch {
            principalUser = null;
          }
        }
      }

      const parsedUsers = parsePaginatedUsers(usersRes);

      setData({
        setupCompletedAt: setupData?.completed_at ?? null,
        activePrincipalAssignment: activePrincipal,
        activePrincipalUser: principalUser,
        totalUsers: parsedUsers.meta.total,
      });
    } catch (err: unknown) {
      setError(getGeneralErrorMessage(err, "Failed to load Super Admin overview."));
    } finally {
      setLoading(false);
    }
  }, [client]);

  React.useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Super Admin Overview"
        description="Manage institutional configuration, Principal appointment, and user accounts."
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
            <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
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
                ? `Finalized on ${new Date(data.setupCompletedAt).toLocaleDateString()}.`
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
                <StatusBadge status={data.activePrincipalAssignment ? "success" : "warning"}>
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
                    {data.activePrincipalUser?.name ?? data.activePrincipalAssignment.user_id}
                  </p>
                  {data.activePrincipalUser?.email && (
                    <p className="text-xs text-muted-foreground truncate">
                      {data.activePrincipalUser.email}
                    </p>
                  )}
                  {data.activePrincipalAssignment.valid_from && (
                    <p className="text-xs text-muted-foreground">
                      Active since{" "}
                      {new Date(data.activePrincipalAssignment.valid_from).toLocaleDateString()}
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


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
  Input,
  Label,
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
} from "@academic-suite/ui";
import { RiAlertLine, RiSearchLine } from "@remixicon/react";
import { useApiClient, useSession } from "@/lib/auth/session-provider";
import { isSuperAdminAtInstitutionScope } from "@/app/setup/logic/role-routing";
import {
  STALE_TIME_LIST_MS,
  scopedQueryKey,
  useApiQuery,
  useQueryScope,
} from "@/lib/query/api-query";
import { formatDisplayDateTime } from "@/lib/format-date";

type AuditLogEntry = components["schemas"]["AuditLogEntry"];

function extractKeyOrStep(properties: Record<string, unknown>): string {
  if (typeof properties.key === "string" && properties.key.trim()) {
    return properties.key;
  }
  if (typeof properties.step === "string" && properties.step.trim()) {
    return properties.step;
  }
  if (Array.isArray(properties.sections) && properties.sections.length > 0) {
    const names = properties.sections.filter(
      (s): s is string => typeof s === "string"
    );
    if (names.length > 0) {
      return names.join(", ");
    }
  }
  return "—";
}

function extractReason(properties: Record<string, unknown>): string {
  if (typeof properties.reason === "string" && properties.reason.trim()) {
    return properties.reason;
  }
  return "—";
}

function eventStatusTone(
  event: string | null | undefined
): "success" | "warning" | "danger" | "neutral" {
  if (!event) return "neutral";
  if (event.includes("unlocked") || event.includes("updated")) return "warning";
  if (event.includes("locked")) return "success";
  if (event.includes("failed") || event.includes("rejected")) return "danger";
  return "neutral";
}

export function AuditControlPane() {
  const client = useApiClient();
  const { state: sessionState } = useSession();
  const scope = useQueryScope();
  const isSuperAdmin = isSuperAdminAtInstitutionScope(sessionState.user);

  const [search, setSearch] = React.useState("");
  const [logName, setLogName] = React.useState<string>("all");
  const [page, setPage] = React.useState(1);
  const [expandedReasons, setExpandedReasons] = React.useState<Record<string, boolean>>({});

  function toggleReason(id: string) {
    setExpandedReasons((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  const queryParams = React.useMemo(() => {
    const params: Record<string, string | number | boolean> = {
      page,
      per_page: 20,
    };
    if (search.trim()) {
      params.search = search.trim();
    }
    if (logName !== "all") {
      params.log_name = logName;
    }
    return params;
  }, [page, search, logName]);

  const auditQuery = useApiQuery({
    queryKey: scopedQueryKey(
      scope,
      "identity",
      "audit-logs",
      "list",
      `${page}:${logName}:${search.trim()}`
    ),
    queryFn: () => client.identity.auditLogs.list(queryParams),
    staleTime: STALE_TIME_LIST_MS,
  });

  const entries: AuditLogEntry[] = auditQuery.data?.data ?? [];
  const meta = auditQuery.data?.meta;
  const currentPage = meta?.current_page ?? page;
  const lastPage = meta?.last_page ?? 1;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Audit &amp; Security Log</CardTitle>
        <CardDescription>
          Review setting changes, setup lock/unlock events, and recorded audit reasons.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="cp-audit-search">Search logs</Label>
            <div className="relative">
              <RiSearchLine
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id="cp-audit-search"
                type="search"
                placeholder="Search by reason, actor, or key"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="pl-9"
              />
            </div>
          </div>

          <div className="w-full space-y-1.5 sm:w-48">
            <Label htmlFor="cp-audit-log-name">Category</Label>
            <Select
              value={logName}
              onValueChange={(value) => {
                if (value) {
                  setLogName(value);
                  setPage(1);
                }
              }}
            >
              <SelectTrigger id="cp-audit-log-name">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {isSuperAdmin && (
                  <SelectItem value="security">Security</SelectItem>
                )}
                <SelectItem value="identity">Identity</SelectItem>
                <SelectItem value="organisation">Organisation</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Table states */}
        {auditQuery.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : auditQuery.isError ? (
          <Alert variant="destructive">
            <RiAlertLine className="size-4" aria-hidden="true" />
            <AlertTitle>Unable to load audit logs</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
              <span>Could not retrieve tenant audit history.</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void auditQuery.refetch()}
              >
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        ) : entries.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No audit log entries match your current filters.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead>Setting / Section</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Actor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {entry.created_at
                          ? formatDisplayDateTime(entry.created_at)
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={eventStatusTone(entry.event)}>
                          {entry.event ?? entry.description}
                        </StatusBadge>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-foreground">
                        {extractKeyOrStep(entry.properties ?? {})}
                      </TableCell>
                      <TableCell className="max-w-xs overflow-hidden text-sm text-foreground">
                        {(() => {
                          const reasonText = extractReason(entry.properties ?? {});
                          if (reasonText === "—") {
                            return reasonText;
                          }
                          const isExpanded = Boolean(expandedReasons[entry.id]);
                          return (
                            <button
                              type="button"
                              aria-expanded={isExpanded}
                              onClick={() => toggleReason(entry.id)}
                              title={isExpanded ? "Click to collapse" : "Click to expand"}
                              className={
                                isExpanded
                                  ? "block w-full cursor-pointer whitespace-normal break-words text-left outline-none focus-visible:underline"
                                  : "block w-full cursor-pointer truncate text-left outline-none focus-visible:underline"
                              }
                            >
                              {reasonText}
                            </button>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {entry.causer_name ?? entry.causer_email ?? "System"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                Page {currentPage} of {lastPage}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={currentPage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= lastPage}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

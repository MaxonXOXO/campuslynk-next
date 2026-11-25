"use client";

import * as React from "react";
import type { components } from "@academic-suite/api-client";
import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@academic-suite/ui";
import { RiLoader4Line } from "@remixicon/react";
import { toast } from "sonner";
import { STALE_TIME_REFERENCE_MS, useApiMutation, useApiQuery } from "@/lib/query/api-query";
import { problemStatus } from "@/lib/auth/problem";
import { getGeneralErrorMessage, mapProblemFieldErrors } from "@/app/setup/logic/error-mapping";

type UserSchema = components["schemas"]["UserSchema"];
type StreamSchema = components["schemas"]["Stream"];
type AssignRoleInput = components["schemas"]["AssignRoleInput"];
type AssignScopeType = AssignRoleInput["scope_type"];

interface DepartmentRow {
  id: string;
  code: string;
  name: string;
  scope_label: string;
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
    label: "Academic Coordinator (Stream)",
    scopeLevel: "stream",
  },
  {
    key: "workshop_superintendent",
    label: "Workshop Superintendent (Institution)",
    scopeLevel: "institution",
  },
  {
    key: "sf_office",
    label: "Self-Financing Office (Institution)",
    scopeLevel: "institution",
  },
] as const;

const ROLE_SELECT_ITEMS = LEADERSHIP_ROLES.map((r) => ({
  value: r.key,
  label: r.label,
}));

export interface LeadershipAppointDialogProps {
  user: UserSchema | null;
  institutionScopeLabel?: string;
  onOpenChange: (open: boolean) => void;
  onAppointed?: () => void;
}

export function LeadershipAppointDialog({
  user,
  institutionScopeLabel = "i_main",
  onOpenChange,
  onAppointed,
}: LeadershipAppointDialogProps) {
  const open = user !== null;

  const [roleKey, setRoleKey] = React.useState<LeadershipRoleKey>("hod");
  const [departmentId, setDepartmentId] = React.useState("");
  const [streamId, setStreamId] = React.useState("");
  const [orderRecord, setOrderRecord] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  const { data: deptData } = useApiQuery<{ data: DepartmentRow[] }>({
    queryKey: ["departments", "lookup", "appoint-dialog"],
    enabled: open,
    staleTime: STALE_TIME_REFERENCE_MS,
    queryFn: (api) =>
      (api.organisation?.departments ?? api.departments).list() as Promise<{ data: DepartmentRow[] }>,
  });

  const { data: streamData } = useApiQuery<{ data: StreamSchema[] }>({
    queryKey: ["streams", "lookup", "appoint-dialog"],
    enabled: open,
    staleTime: STALE_TIME_REFERENCE_MS,
    queryFn: (api) =>
      (api.organisation?.streams ?? api.streams).list() as Promise<{ data: StreamSchema[] }>,
  });

  const departments = React.useMemo(() => deptData?.data ?? [], [deptData?.data]);
  const streams = React.useMemo(() => streamData?.data ?? [], [streamData?.data]);

  const deptSelectItems = React.useMemo(
    () =>
      departments.map((d) => ({
        value: d.id,
        label: `${d.name} (${d.code})`,
      })),
    [departments]
  );

  const streamSelectItems = React.useMemo(
    () =>
      streams.map((s) => ({
        value: s.id,
        label: `${s.name} (${s.code})`,
      })),
    [streams]
  );

  React.useEffect(() => {
    if (!user) return;
    setRoleKey("hod");
    setDepartmentId(user.staff_profile?.requested_department_id ?? "");
    setStreamId("");
    setOrderRecord("");
    setError(null);
    setFieldErrors({});
  }, [user]);

  const roleMeta = React.useMemo(
    () =>
      LEADERSHIP_ROLES.find((r) => r.key === roleKey) ?? {
        key: "hod" as const,
        label: "Head of Department (HOD)",
        scopeLevel: "department" as const,
      },
    [roleKey]
  );

  const appointMutation = useApiMutation({
    mutationFn: (api, payload: AssignRoleInput) =>
      (api.identity?.roleAssignments ?? api.roleAssignments).create(payload),
    invalidateKeys: [["users"], ["role-assignments"], ["departments"]],
  });

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || appointMutation.isPending) return;

    const errs: Record<string, string> = {};
    let scopeType: AssignScopeType = "institution";
    let scopeLabel = institutionScopeLabel;

    if (roleMeta.scopeLevel === "department") {
      const dept = departments.find((d) => d.id === departmentId);
      if (!dept) {
        errs.scope_label = "Select a department for this role.";
      } else {
        scopeType = "department";
        scopeLabel = dept.scope_label;
      }
    } else if (roleMeta.scopeLevel === "stream") {
      const stream = streams.find((s) => s.id === streamId);
      if (!stream) {
        errs.scope_label = "Select a stream for this role.";
      } else {
        scopeType = "stream";
        scopeLabel = stream.scope_label;
      }
    }

    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      setError(null);
      return;
    }

    setFieldErrors({});
    setError(null);

    try {
      await appointMutation.mutateAsync({
        user_id: user.id,
        role_key: roleKey,
        scope_type: scopeType,
        scope_label: scopeLabel,
        order_record: orderRecord.trim() || null,
      });
      toast.success(`Appointed ${user.name} as ${roleMeta.label}.`);
      onAppointed?.();
      onOpenChange(false);
    } catch (err: unknown) {
      const status = problemStatus(err);
      const mapped = mapProblemFieldErrors(err);
      if (Object.keys(mapped).length > 0) setFieldErrors(mapped);
      if (status === 409) {
        setError(
          getGeneralErrorMessage(
            err,
            "This leadership role is already occupied at the selected scope."
          )
        );
      } else {
        setError(getGeneralErrorMessage(err, "Failed to appoint leadership role."));
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Appoint Leadership Role</DialogTitle>
          <DialogDescription>
            {user
              ? `Assign a leadership role to ${user.name}${user.email ? ` (${user.email})` : ""}.`
              : "Assign a leadership role."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="dialog-appoint-role">Role</Label>
            <Select
              value={roleKey}
              onValueChange={(val) => {
                if (typeof val === "string") {
                  setRoleKey(val as LeadershipRoleKey);
                  setFieldErrors({});
                  setError(null);
                }
              }}
              items={ROLE_SELECT_ITEMS}
              disabled={appointMutation.isPending}
            >
              <SelectTrigger id="dialog-appoint-role" className="w-full">
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

          {roleMeta.scopeLevel === "department" && (
            <div className="space-y-1.5">
              <Label htmlFor="dialog-appoint-dept">Department</Label>
              <Select
                value={departmentId}
                onValueChange={(val) => {
                  if (typeof val === "string") {
                    setDepartmentId(val);
                    setFieldErrors((prev) => ({ ...prev, scope_label: "" }));
                  }
                }}
                items={deptSelectItems}
                disabled={appointMutation.isPending}
              >
                <SelectTrigger id="dialog-appoint-dept" className="w-full">
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  {deptSelectItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldErrors.scope_label && (
                <p className="text-xs text-destructive">{fieldErrors.scope_label}</p>
              )}
            </div>
          )}

          {roleMeta.scopeLevel === "stream" && (
            <div className="space-y-1.5">
              <Label htmlFor="dialog-appoint-stream">Stream</Label>
              <Select
                value={streamId}
                onValueChange={(val) => {
                  if (typeof val === "string") {
                    setStreamId(val);
                    setFieldErrors((prev) => ({ ...prev, scope_label: "" }));
                  }
                }}
                items={streamSelectItems}
                disabled={appointMutation.isPending}
              >
                <SelectTrigger id="dialog-appoint-stream" className="w-full">
                  <SelectValue placeholder="Select stream" />
                </SelectTrigger>
                <SelectContent>
                  {streamSelectItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldErrors.scope_label && (
                <p className="text-xs text-destructive">{fieldErrors.scope_label}</p>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="dialog-appoint-order">Official Order Reference (optional)</Label>
            <Input
              id="dialog-appoint-order"
              value={orderRecord}
              onChange={(e) => setOrderRecord(e.target.value)}
              placeholder="e.g. GO-2026-042"
              disabled={appointMutation.isPending}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={appointMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={appointMutation.isPending}>
              {appointMutation.isPending ? (
                <>
                  <RiLoader4Line className="size-4 animate-spin" aria-hidden="true" />
                  Appointing...
                </>
              ) : (
                "Appoint Role"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}


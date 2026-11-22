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
  CardFooter,
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
import { problemStatus } from "@/lib/auth/problem";
import { formatDisplayDateTime } from "@/lib/format-date";
import { getInstitutionScopeLabel } from "@/lib/workspaces/workspaces";
import {
  getGeneralErrorMessage,
  mapProblemFieldErrors,
} from "@/app/setup/logic/error-mapping";
import {
  TemporaryPasswordReveal,
  type TemporaryPasswordPayload,
} from "./TemporaryPasswordReveal";

type RoleAssignmentSchema = components["schemas"]["RoleAssignmentSchema"];
type UserSchema = components["schemas"]["UserSchema"];
type AppointMode = "existing" | "create";

interface NewUserFieldsState {
  name: string;
  email: string;
  mobile: string;
  registration_number: string;
}

const EMPTY_NEW_USER: NewUserFieldsState = {
  name: "",
  email: "",
  mobile: "",
  registration_number: "",
};

function validateNewUserFields(
  fields: NewUserFieldsState,
  prefix: "new_user." | "" = "new_user."
): Record<string, string> {
  const errors: Record<string, string> = {};
  const name = fields.name.trim();
  const email = fields.email.trim();
  const mobile = fields.mobile.trim();
  const regNo = fields.registration_number.trim();

  if (name.length < 2) {
    errors[`${prefix}name`] = "Name must be at least 2 characters.";
  }
  if (!email && !mobile && !regNo) {
    errors[`${prefix}email`] =
      "Provide at least one identifier (email, mobile, or registration number).";
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors[`${prefix}email`] = "Enter a valid email address.";
  }
  if (mobile && !/^[0-9+\-\s]{10,20}$/.test(mobile)) {
    errors[`${prefix}mobile`] = "Enter a valid mobile number (10-20 digits/symbols).";
  }
  if (regNo && !/^[a-zA-Z0-9\-_/]{3,32}$/.test(regNo)) {
    errors[`${prefix}registration_number`] =
      "Registration number must be 3-32 characters.";
  }

  return errors;
}

function buildNewUserPayload(fields: NewUserFieldsState) {
  return {
    name: fields.name.trim(),
    email: fields.email.trim() || null,
    mobile: fields.mobile.trim() || null,
    registration_number: fields.registration_number.trim() || null,
  };
}

export function SuperAdminPrincipalPage() {
  const client = useApiClient();
  const { state } = useSession();

  const institutionScopeLabel = React.useMemo(
    () => getInstitutionScopeLabel(state.user),
    [state.user]
  );

  const [assignments, setAssignments] = React.useState<RoleAssignmentSchema[]>([]);
  const [staffOptions, setStaffOptions] = React.useState<UserSchema[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  // Appoint form state
  const [appointMode, setAppointMode] = React.useState<AppointMode>("existing");
  const [selectedUserId, setSelectedUserId] = React.useState("");
  const [appointNewUser, setAppointNewUser] =
    React.useState<NewUserFieldsState>(EMPTY_NEW_USER);
  const [orderRecord, setOrderRecord] = React.useState("");
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  // Replace Principal dialog state
  const [replaceOpen, setReplaceOpen] = React.useState(false);
  const [replaceMode, setReplaceMode] = React.useState<AppointMode>("existing");
  const [replaceUserId, setReplaceUserId] = React.useState("");
  const [replaceNewUser, setReplaceNewUser] =
    React.useState<NewUserFieldsState>(EMPTY_NEW_USER);
  const [replaceReason, setReplaceReason] = React.useState("");
  const [replaceOrderRecord, setReplaceOrderRecord] = React.useState("");
  const [replaceFieldErrors, setReplaceFieldErrors] = React.useState<
    Record<string, string>
  >({});
  const [replaceSubmitError, setReplaceSubmitError] = React.useState<string | null>(null);
  const [replacing, setReplacing] = React.useState(false);

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

      setAssignments(assignmentsRes.data);
      setStaffOptions(staffRes.data);
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

  function clearReplaceFieldError(field: string) {
    setReplaceFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  function formatMutationError(
    err: unknown,
    fallback: string,
    wasCreatingUser: boolean
  ): string {
    const status = problemStatus(err);
    if (status === 403) {
      return getGeneralErrorMessage(
        err,
        "You do not have permission to perform this Principal action."
      );
    }
    if (status === undefined && wasCreatingUser) {
      return "The response was lost or timed out after submitting. Check Principal Assignment History below; if the user account was created without displaying the password, use Reset temporary password on the Users page.";
    }
    return getGeneralErrorMessage(err, fallback);
  }

  async function handleAppointSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const nextErrors: Record<string, string> = {};
    if (appointMode === "existing") {
      if (!selectedUserId) {
        nextErrors.user_id = "Select a staff member to appoint as Principal.";
      }
    } else {
      Object.assign(nextErrors, validateNewUserFields(appointNewUser, "new_user."));
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
      const payload =
        appointMode === "existing"
          ? {
              user_id: selectedUserId,
              order_record: orderRecord.trim() || null,
            }
          : {
              new_user: buildNewUserPayload(appointNewUser),
              order_record: orderRecord.trim() || null,
            };

      const res = await client.identity.principal.appoint(payload);
      const appointedName =
        res.data.assignment.user?.name ??
        (appointMode === "create"
          ? appointNewUser.name.trim()
          : staffOptions.find((s) => s.id === selectedUserId)?.name) ??
        "Principal";

      if (res.data.temporary_password) {
        setRevealedTempPassword({
          recipientName: appointedName,
          payload: {
            temporary_password: res.data.temporary_password,
            expires_at: res.data.expires_at ?? null,
          },
        });
      }

      toast.success(`${appointedName} appointed as Principal.`);
      setSelectedUserId("");
      setAppointNewUser(EMPTY_NEW_USER);
      setOrderRecord("");
      await loadPrincipalData();
    } catch (err: unknown) {
      const mapped = mapProblemFieldErrors(err);
      if (Object.keys(mapped).length > 0) {
        setFieldErrors(mapped);
      }

      const status = problemStatus(err);
      if (status === 409) {
        setSubmitError(
          getGeneralErrorMessage(
            err,
            "An active Principal is already appointed for this institution."
          )
        );
        await loadPrincipalData();
      } else {
        setSubmitError(
          formatMutationError(
            err,
            "Could not complete Principal appointment.",
            appointMode === "create"
          )
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  function openReplaceDialog() {
    setReplaceMode("existing");
    setReplaceUserId("");
    setReplaceNewUser(EMPTY_NEW_USER);
    setReplaceReason("");
    setReplaceOrderRecord("");
    setReplaceFieldErrors({});
    setReplaceSubmitError(null);
    setReplaceOpen(true);
  }

  async function handleReplaceSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (replacing) return;

    const nextErrors: Record<string, string> = {};
    if (replaceMode === "existing") {
      if (!replaceUserId) {
        nextErrors.user_id = "Select a replacement staff member.";
      }
    } else {
      Object.assign(nextErrors, validateNewUserFields(replaceNewUser, "new_user."));
    }

    const trimmedReason = replaceReason.trim();
    if (trimmedReason.length < 5 || trimmedReason.length > 500) {
      nextErrors.reason = "Transition reason must be between 5 and 500 characters.";
    }

    if (Object.keys(nextErrors).length > 0) {
      setReplaceFieldErrors(nextErrors);
      setReplaceSubmitError(null);
      return;
    }

    setReplacing(true);
    setReplaceFieldErrors({});
    setReplaceSubmitError(null);

    try {
      const payload =
        replaceMode === "existing"
          ? {
              user_id: replaceUserId,
              reason: trimmedReason,
              order_record: replaceOrderRecord.trim() || null,
            }
          : {
              new_user: buildNewUserPayload(replaceNewUser),
              reason: trimmedReason,
              order_record: replaceOrderRecord.trim() || null,
            };

      const res = await client.identity.principal.replace(payload);
      const replacedName =
        res.data.assignment.user?.name ??
        (replaceMode === "create"
          ? replaceNewUser.name.trim()
          : staffOptions.find((s) => s.id === replaceUserId)?.name) ??
        "Principal";

      if (res.data.temporary_password) {
        setRevealedTempPassword({
          recipientName: replacedName,
          payload: {
            temporary_password: res.data.temporary_password,
            expires_at: res.data.expires_at ?? null,
          },
        });
      }

      toast.success(`Replaced Principal with ${replacedName}.`);
      setReplaceOpen(false);
      await loadPrincipalData();
    } catch (err: unknown) {
      const mapped = mapProblemFieldErrors(err);
      if (Object.keys(mapped).length > 0) {
        setReplaceFieldErrors(mapped);
      }

      const status = problemStatus(err);
      if (status === 409) {
        const msg = getGeneralErrorMessage(
          err,
          "Could not replace Principal due to a conflict."
        );
        setReplaceSubmitError(msg);
        await loadPrincipalData();
      } else {
        setReplaceSubmitError(
          formatMutationError(
            err,
            "Could not complete Principal replacement.",
            replaceMode === "create"
          )
        );
      }
    } finally {
      setReplacing(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Principal Management"
        description="Appoint or replace the institution Principal and review past Principal assignments."
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
                <StatusBadge
                  status={activePrincipal ? "success" : "warning"}
                  className={!activePrincipal ? "dark:text-foreground" : undefined}
                >
                  {activePrincipal ? "Active" : "Vacant"}
                </StatusBadge>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {activePrincipal ? (
                <div className="grid grid-cols-1 gap-4 rounded-lg border border-border bg-muted/30 p-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Person</p>
                    <p className="text-sm font-semibold text-foreground">
                      {activePrincipal.user?.name ?? activePrincipal.user_id}
                    </p>
                    {activePrincipal.user?.email && (
                      <p className="text-xs text-muted-foreground truncate">
                        {activePrincipal.user.email}
                      </p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Contact</p>
                    <p className="text-sm text-foreground">
                      {activePrincipal.user?.mobile ?? activePrincipal.user?.email ?? "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Effective From</p>
                    <p className="text-sm font-mono text-foreground">
                      {formatDisplayDateTime(activePrincipal.valid_from)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Scope</p>
                    <p className="text-sm font-mono text-foreground">
                      {activePrincipal.scope_label || activePrincipal.scope_type}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No active Principal is currently assigned. Use the appointment panel below to
                  appoint a Principal.
                </p>
              )}
            </CardContent>

            {activePrincipal && (
              <CardFooter className="border-t border-border/60 pt-4 flex flex-wrap items-center justify-end gap-2">
                <Button type="button" variant="outline" onClick={openReplaceDialog}>
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
                    onClick={() => {
                      setAppointMode("existing");
                      setFieldErrors({});
                      setSubmitError(null);
                    }}
                    className={cn(
                      "flex items-start justify-between gap-3 rounded-xl border p-4 text-left transition-colors",
                      "outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                      appointMode === "existing"
                        ? "border-primary bg-primary/5"
                        : "border-border bg-card hover:bg-muted/50"
                    )}
                  >
                    <div className="space-y-1">
                      <span className="text-sm font-semibold text-foreground">
                        Appoint existing staff user
                      </span>
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
                    aria-checked={appointMode === "create"}
                    data-selected={appointMode === "create" ? "true" : "false"}
                    onClick={() => {
                      setAppointMode("create");
                      setFieldErrors({});
                      setSubmitError(null);
                    }}
                    className={cn(
                      "flex items-start justify-between gap-3 rounded-xl border p-4 text-left transition-colors",
                      "outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                      appointMode === "create"
                        ? "border-primary bg-primary/5"
                        : "border-border bg-card hover:bg-muted/50"
                    )}
                  >
                    <div className="space-y-1">
                      <span className="text-sm font-semibold text-foreground">
                        Create new account &amp; appoint
                      </span>
                      <p className="text-xs text-muted-foreground">
                        Atomically create a new staff account with a one-time temporary password
                        and appoint as Principal.
                      </p>
                    </div>
                    {appointMode === "create" && (
                      <RiCheckLine
                        className="size-4 shrink-0 text-primary mt-0.5"
                        aria-hidden="true"
                      />
                    )}
                  </button>
                </div>

                <form onSubmit={handleAppointSubmit} noValidate className="space-y-4">
                  {submitError && (
                    <Alert variant="destructive">
                      <RiAlertLine className="size-4" aria-hidden="true" />
                      <AlertDescription>{submitError}</AlertDescription>
                    </Alert>
                  )}

                  {appointMode === "existing" ? (
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
                  ) : (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="appoint-new-name">Full Name</Label>
                        <Input
                          id="appoint-new-name"
                          value={appointNewUser.name}
                          onChange={(e) => {
                            setAppointNewUser((prev) => ({ ...prev, name: e.target.value }));
                            clearFieldError("new_user.name");
                          }}
                          placeholder="Dr. Meera Krishnan"
                          disabled={submitting}
                          aria-invalid={Boolean(fieldErrors["new_user.name"])}
                          aria-describedby={
                            fieldErrors["new_user.name"] ? "appoint-new-name-error" : undefined
                          }
                        />
                        {fieldErrors["new_user.name"] && (
                          <p id="appoint-new-name-error" className="text-xs text-destructive">
                            {fieldErrors["new_user.name"]}
                          </p>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="appoint-new-email">Email</Label>
                        <Input
                          id="appoint-new-email"
                          type="email"
                          value={appointNewUser.email}
                          onChange={(e) => {
                            setAppointNewUser((prev) => ({ ...prev, email: e.target.value }));
                            clearFieldError("new_user.email");
                          }}
                          placeholder="principal@college.edu"
                          disabled={submitting}
                          aria-invalid={Boolean(fieldErrors["new_user.email"])}
                          aria-describedby={
                            fieldErrors["new_user.email"] ? "appoint-new-email-error" : undefined
                          }
                        />
                        {fieldErrors["new_user.email"] && (
                          <p id="appoint-new-email-error" className="text-xs text-destructive">
                            {fieldErrors["new_user.email"]}
                          </p>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="appoint-new-mobile">Mobile (optional)</Label>
                        <Input
                          id="appoint-new-mobile"
                          value={appointNewUser.mobile}
                          onChange={(e) => {
                            setAppointNewUser((prev) => ({ ...prev, mobile: e.target.value }));
                            clearFieldError("new_user.mobile");
                          }}
                          placeholder="+919876543210"
                          disabled={submitting}
                          aria-invalid={Boolean(fieldErrors["new_user.mobile"])}
                          aria-describedby={
                            fieldErrors["new_user.mobile"]
                              ? "appoint-new-mobile-error"
                              : undefined
                          }
                        />
                        {fieldErrors["new_user.mobile"] && (
                          <p id="appoint-new-mobile-error" className="text-xs text-destructive">
                            {fieldErrors["new_user.mobile"]}
                          </p>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="appoint-new-regno">Staff ID (optional)</Label>
                        <Input
                          id="appoint-new-regno"
                          value={appointNewUser.registration_number}
                          onChange={(e) => {
                            setAppointNewUser((prev) => ({
                              ...prev,
                              registration_number: e.target.value,
                            }));
                            clearFieldError("new_user.registration_number");
                          }}
                          placeholder="STF-001"
                          disabled={submitting}
                          aria-invalid={Boolean(fieldErrors["new_user.registration_number"])}
                          aria-describedby={
                            fieldErrors["new_user.registration_number"]
                              ? "appoint-new-regno-error"
                              : undefined
                          }
                        />
                        {fieldErrors["new_user.registration_number"] && (
                          <p id="appoint-new-regno-error" className="text-xs text-destructive">
                            {fieldErrors["new_user.registration_number"]}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

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
                        {institutionScopeLabel ?? "Institution"}
                      </span>
                    </p>
                    <Button
                      type="submit"
                      disabled={
                        submitting ||
                        (appointMode === "existing" && staffOptions.length === 0)
                      }
                    >
                      {submitting ? (
                        <>
                          <RiLoader4Line className="size-4 animate-spin" aria-hidden="true" />
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
                          <TableHead>Order / Reason</TableHead>
                          <TableHead>Assigned By</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {assignments.map((row) => (
                          <TableRow key={row.id}>
                            <TableCell className="whitespace-normal">
                              <div className="font-medium text-foreground">
                                {row.user?.name ?? row.user_id}
                              </div>
                              {row.user?.email && (
                                <div className="text-xs text-muted-foreground">
                                  {row.user.email}
                                </div>
                              )}
                            </TableCell>
                            <TableCell>
                              <StatusBadge status={row.is_active ? "success" : "neutral"}>
                                {row.is_active ? "Active" : "Ended"}
                              </StatusBadge>
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {formatDisplayDateTime(row.valid_from)}
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {formatDisplayDateTime(row.valid_to)}
                            </TableCell>
                            <TableCell className="whitespace-normal text-xs">
                              {row.order_record && (
                                <div className="font-mono text-foreground">
                                  {row.order_record}
                                </div>
                              )}
                              {row.reason && (
                                <div className="text-muted-foreground">{row.reason}</div>
                              )}
                              {!row.order_record && !row.reason && (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {row.assigned_by?.name ?? "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Mobile cards (375px+) */}
                  <div className="space-y-3 md:hidden">
                    {assignments.map((row) => (
                      <div
                        key={row.id}
                        className="rounded-lg border border-border p-3.5 space-y-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">
                              {row.user?.name ?? row.user_id}
                            </p>
                            {row.user?.email && (
                              <p className="text-xs text-muted-foreground truncate">
                                {row.user.email}
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
                              {formatDisplayDateTime(row.valid_from)}
                            </span>
                          </div>
                          <div>
                            Ended:{" "}
                            <span className="font-mono text-foreground">
                              {formatDisplayDateTime(row.valid_to)}
                            </span>
                          </div>
                          {row.order_record && (
                            <div>
                              Order:{" "}
                              <span className="font-mono text-foreground">
                                {row.order_record}
                              </span>
                            </div>
                          )}
                          {row.reason && (
                            <div>
                              Reason:{" "}
                              <span className="text-foreground">{row.reason}</span>
                            </div>
                          )}
                          {row.assigned_by?.name && (
                            <div>
                              Assigned by:{" "}
                              <span className="text-foreground">{row.assigned_by.name}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Replace Principal Dialog */}
      <Dialog
        open={replaceOpen}
        onOpenChange={(open) => {
          if (!open && !replacing) setReplaceOpen(false);
        }}
      >
        <DialogContent className="max-w-xl">
          <form onSubmit={handleReplaceSubmit} noValidate className="space-y-4">
            <DialogHeader>
              <DialogTitle>Replace Principal</DialogTitle>
              <DialogDescription>
                Atomically end the current Principal assignment and appoint a replacement with
                a recorded transition reason.
              </DialogDescription>
            </DialogHeader>

            {replaceSubmitError && (
              <Alert variant="destructive">
                <RiAlertLine className="size-4" aria-hidden="true" />
                <AlertDescription className="space-y-2">
                  <p>{replaceSubmitError}</p>
                  {!activePrincipal && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setReplaceOpen(false)}
                    >
                      Go to Appoint Principal
                    </Button>
                  )}
                </AlertDescription>
              </Alert>
            )}

            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Replacement method">
              <Button
                type="button"
                size="sm"
                variant={replaceMode === "existing" ? "default" : "outline"}
                role="radio"
                aria-checked={replaceMode === "existing"}
                onClick={() => {
                  setReplaceMode("existing");
                  setReplaceFieldErrors({});
                  setReplaceSubmitError(null);
                }}
              >
                Existing staff user
              </Button>
              <Button
                type="button"
                size="sm"
                variant={replaceMode === "create" ? "default" : "outline"}
                role="radio"
                aria-checked={replaceMode === "create"}
                onClick={() => {
                  setReplaceMode("create");
                  setReplaceFieldErrors({});
                  setReplaceSubmitError(null);
                }}
              >
                Create new account
              </Button>
            </div>

            {replaceMode === "existing" ? (
              <div className="space-y-1.5">
                <Label htmlFor="replace-staff-select">Replacement staff user</Label>
                <Select
                  value={replaceUserId || null}
                  onValueChange={(value) => {
                    setReplaceUserId(typeof value === "string" ? value : "");
                    clearReplaceFieldError("user_id");
                  }}
                  items={staffSelectItems}
                  disabled={replacing || staffOptions.length === 0}
                >
                  <SelectTrigger
                    id="replace-staff-select"
                    className="w-full"
                    aria-invalid={Boolean(replaceFieldErrors.user_id)}
                    aria-describedby={
                      replaceFieldErrors.user_id ? "replace-user-error" : undefined
                    }
                  >
                    <SelectValue placeholder="Select replacement staff member..." />
                  </SelectTrigger>
                  <SelectContent>
                    {staffOptions.map((staff) => (
                      <SelectItem key={staff.id} value={staff.id}>
                        {staff.email ? `${staff.name} (${staff.email})` : staff.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {replaceFieldErrors.user_id && (
                  <p id="replace-user-error" className="text-xs text-destructive">
                    {replaceFieldErrors.user_id}
                  </p>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="replace-new-name">Full Name</Label>
                  <Input
                    id="replace-new-name"
                    value={replaceNewUser.name}
                    onChange={(e) => {
                      setReplaceNewUser((prev) => ({ ...prev, name: e.target.value }));
                      clearReplaceFieldError("new_user.name");
                    }}
                    disabled={replacing}
                    aria-invalid={Boolean(replaceFieldErrors["new_user.name"])}
                  />
                  {replaceFieldErrors["new_user.name"] && (
                    <p className="text-xs text-destructive">
                      {replaceFieldErrors["new_user.name"]}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="replace-new-email">Email</Label>
                  <Input
                    id="replace-new-email"
                    type="email"
                    value={replaceNewUser.email}
                    onChange={(e) => {
                      setReplaceNewUser((prev) => ({ ...prev, email: e.target.value }));
                      clearReplaceFieldError("new_user.email");
                    }}
                    disabled={replacing}
                    aria-invalid={Boolean(replaceFieldErrors["new_user.email"])}
                  />
                  {replaceFieldErrors["new_user.email"] && (
                    <p className="text-xs text-destructive">
                      {replaceFieldErrors["new_user.email"]}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="replace-new-mobile">Mobile (optional)</Label>
                  <Input
                    id="replace-new-mobile"
                    value={replaceNewUser.mobile}
                    onChange={(e) => {
                      setReplaceNewUser((prev) => ({ ...prev, mobile: e.target.value }));
                      clearReplaceFieldError("new_user.mobile");
                    }}
                    disabled={replacing}
                    aria-invalid={Boolean(replaceFieldErrors["new_user.mobile"])}
                  />
                  {replaceFieldErrors["new_user.mobile"] && (
                    <p className="text-xs text-destructive">
                      {replaceFieldErrors["new_user.mobile"]}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="replace-new-regno">Staff ID (optional)</Label>
                  <Input
                    id="replace-new-regno"
                    value={replaceNewUser.registration_number}
                    onChange={(e) => {
                      setReplaceNewUser((prev) => ({
                        ...prev,
                        registration_number: e.target.value,
                      }));
                      clearReplaceFieldError("new_user.registration_number");
                    }}
                    disabled={replacing}
                    aria-invalid={Boolean(replaceFieldErrors["new_user.registration_number"])}
                  />
                  {replaceFieldErrors["new_user.registration_number"] && (
                    <p className="text-xs text-destructive">
                      {replaceFieldErrors["new_user.registration_number"]}
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="replace-reason">Transition Reason</Label>
              <Textarea
                id="replace-reason"
                value={replaceReason}
                onChange={(e) => {
                  setReplaceReason(e.target.value);
                  clearReplaceFieldError("reason");
                }}
                placeholder="e.g. Retirement transition effective end of term"
                rows={3}
                maxLength={500}
                disabled={replacing}
                aria-invalid={Boolean(replaceFieldErrors.reason)}
                aria-describedby={
                  replaceFieldErrors.reason ? "replace-reason-error" : undefined
                }
              />
              {replaceFieldErrors.reason && (
                <p id="replace-reason-error" className="text-xs text-destructive">
                  {replaceFieldErrors.reason}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="replace-order-record">
                Official Order Reference (optional)
              </Label>
              <Input
                id="replace-order-record"
                value={replaceOrderRecord}
                onChange={(e) => {
                  setReplaceOrderRecord(e.target.value);
                  clearReplaceFieldError("order_record");
                }}
                placeholder="e.g. GO-2026-099"
                maxLength={255}
                disabled={replacing}
                aria-invalid={Boolean(replaceFieldErrors.order_record)}
              />
              {replaceFieldErrors.order_record && (
                <p className="text-xs text-destructive">
                  {replaceFieldErrors.order_record}
                </p>
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setReplaceOpen(false)}
                disabled={replacing}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={replacing}>
                {replacing ? (
                  <>
                    <RiLoader4Line className="size-4 animate-spin" aria-hidden="true" />
                    Replacing...
                  </>
                ) : (
                  "Confirm Replacement"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

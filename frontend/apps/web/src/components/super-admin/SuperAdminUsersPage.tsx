"use client";

import * as React from "react";
import type { components } from "@academic-suite/api-client";
import {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Label,
  PageHeader,
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  type SemanticStatus,
} from "@academic-suite/ui";
import {
  RiAlertLine,
  RiEditLine,
  RiForbidLine,
  RiKey2Line,
  RiLoader4Line,
  RiLockUnlockLine,
  RiMoreLine,
  RiRefreshLine,
  RiSearchLine,
  RiUserAddLine,
  RiUserFollowLine,
} from "@remixicon/react";
import { toast } from "sonner";
import { useApiClient, useSession } from "@/lib/auth/session-provider";
import { problemStatus } from "@/lib/auth/problem";
import { formatDisplayDate, formatDisplayDateTime } from "@/lib/format-date";
import { canResetTargetPassword } from "@/lib/workspaces/role-rank";
import {
  getGeneralErrorMessage,
  mapProblemFieldErrors,
} from "@/app/setup/logic/error-mapping";
import {
  TemporaryPasswordReveal,
  type TemporaryPasswordPayload,
} from "./TemporaryPasswordReveal";

type UserSchema = components["schemas"]["UserSchema"];
type PaginationMeta = components["schemas"]["PaginationMeta"];
type UserType = components["schemas"]["CreateUserInput"]["type"];

const TYPE_ITEMS = [
  { value: "all", label: "All types" },
  { value: "staff", label: "Staff" },
  { value: "student", label: "Student" },
  { value: "parent", label: "Parent" },
];

const CREATE_TYPE_ITEMS: Array<{ value: UserType; label: string }> = [
  { value: "staff", label: "Staff" },
  { value: "student", label: "Student" },
  { value: "parent", label: "Parent" },
];

const STATUS_ITEMS = [
  { value: "all", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "suspended", label: "Suspended" },
  { value: "pending", label: "Pending" },
];

function userStatusBadge(status: string): { semantic: SemanticStatus; label: string } {
  switch (status) {
    case "active":
      return { semantic: "success", label: "Active" };
    case "suspended":
      return { semantic: "danger", label: "Suspended" };
    case "pending":
      return { semantic: "warning", label: "Pending" };
    default:
      return { semantic: "neutral", label: status };
  }
}

export function SuperAdminUsersPage() {
  const client = useApiClient();
  const { state: sessionState } = useSession();

  const [users, setUsers] = React.useState<UserSchema[]>([]);
  const [meta, setMeta] = React.useState<PaginationMeta>({
    current_page: 1,
    last_page: 1,
    per_page: 25,
    total: 0,
  });
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);

  // Filters
  const [searchInput, setSearchInput] = React.useState("");
  const [appliedSearch, setAppliedSearch] = React.useState("");
  const [typeFilter, setTypeFilter] = React.useState("all");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [page, setPage] = React.useState(1);

  // Ephemeral one-time temporary password reveal (never persisted)
  const [revealedTempPassword, setRevealedTempPassword] = React.useState<{
    recipientName: string;
    payload: TemporaryPasswordPayload;
  } | null>(null);

  React.useEffect(() => {
    return () => {
      setRevealedTempPassword(null);
    };
  }, []);

  // Create User dialog state
  const [createOpen, setCreateOpen] = React.useState(false);
  const [createType, setCreateType] = React.useState<UserType>("staff");
  const [createName, setCreateName] = React.useState("");
  const [createEmail, setCreateEmail] = React.useState("");
  const [createMobile, setCreateMobile] = React.useState("");
  const [createRegNo, setCreateRegNo] = React.useState("");
  const [createFieldErrors, setCreateFieldErrors] = React.useState<Record<string, string>>({});
  const [createError, setCreateError] = React.useState<string | null>(null);
  const [createSubmitting, setCreateSubmitting] = React.useState(false);

  // Edit dialog state
  const [editingUser, setEditingUser] = React.useState<UserSchema | null>(null);
  const [editName, setEditName] = React.useState("");
  const [editEmail, setEditEmail] = React.useState("");
  const [editMobile, setEditMobile] = React.useState("");
  const [editRegNo, setEditRegNo] = React.useState("");
  const [editFieldErrors, setEditFieldErrors] = React.useState<Record<string, string>>({});
  const [editError, setEditError] = React.useState<string | null>(null);
  const [editSubmitting, setEditSubmitting] = React.useState(false);

  // Suspend dialog state
  const [suspendingUser, setSuspendingUser] = React.useState<UserSchema | null>(null);
  const [suspendReason, setSuspendReason] = React.useState("");
  const [suspendError, setSuspendError] = React.useState<string | null>(null);
  const [suspendSubmitting, setSuspendSubmitting] = React.useState(false);

  // Reactivate / Unlock / Reset Password confirmation dialogs
  const [reactivatingUser, setReactivatingUser] = React.useState<UserSchema | null>(null);
  const [unlockingUser, setUnlockingUser] = React.useState<UserSchema | null>(null);
  const [resettingUser, setResettingUser] = React.useState<UserSchema | null>(null);
  const [actionSubmitting, setActionSubmitting] = React.useState(false);

  const loadUsers = React.useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    try {
      const query: Record<string, string | number | boolean> = { page };
      if (appliedSearch.trim()) query.search = appliedSearch.trim();
      if (typeFilter !== "all") query.type = typeFilter;
      if (statusFilter !== "all") query.status = statusFilter;

      const res = await client.users.list(query);
      setUsers(res.data);
      setMeta(res.meta);
    } catch (err: unknown) {
      setLoadError(getGeneralErrorMessage(err, "Failed to load users directory."));
    } finally {
      setLoading(false);
    }
  }, [client, page, appliedSearch, typeFilter, statusFilter]);

  React.useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  function handleSearchSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setAppliedSearch(searchInput);
  }

  function openCreateDialog() {
    setCreateType("staff");
    setCreateName("");
    setCreateEmail("");
    setCreateMobile("");
    setCreateRegNo("");
    setCreateFieldErrors({});
    setCreateError(null);
    setCreateOpen(true);
  }

  async function handleCreateSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (createSubmitting) return;

    const errors: Record<string, string> = {};
    const name = createName.trim();
    const email = createEmail.trim();
    const mobile = createMobile.trim();
    const regNo = createRegNo.trim();

    if (name.length < 2) {
      errors.name = "Name must be at least 2 characters.";
    }
    if (!email && !mobile && !regNo) {
      errors.email =
        "Provide at least one identifier (email, mobile, or registration number).";
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = "Enter a valid email address.";
    }
    if (mobile && !/^[0-9+\-\s]{10,20}$/.test(mobile)) {
      errors.mobile = "Enter a valid mobile number (10-20 digits/symbols).";
    }
    if (regNo && !/^[a-zA-Z0-9\-_/]{3,32}$/.test(regNo)) {
      errors.registration_number = "Registration number must be 3-32 characters.";
    }

    if (Object.keys(errors).length > 0) {
      setCreateFieldErrors(errors);
      setCreateError(null);
      return;
    }

    setCreateSubmitting(true);
    setCreateFieldErrors({});
    setCreateError(null);

    try {
      const res = await client.users.create({
        type: createType,
        name,
        email: email || null,
        mobile: mobile || null,
        registration_number: regNo || null,
      });

      if (res.data.temporary_password) {
        setRevealedTempPassword({
          recipientName: res.data.name,
          payload: {
            temporary_password: res.data.temporary_password,
            expires_at: res.data.expires_at ?? null,
          },
        });
      }

      toast.success(`Created account for ${res.data.name}.`);
      setCreateOpen(false);
      await loadUsers();
    } catch (err: unknown) {
      const mapped = mapProblemFieldErrors(err);
      if (Object.keys(mapped).length > 0) {
        setCreateFieldErrors(mapped);
      }
      setCreateError(getGeneralErrorMessage(err, "Failed to create user account."));
    } finally {
      setCreateSubmitting(false);
    }
  }

  function openEditDialog(user: UserSchema) {
    setEditingUser(user);
    setEditName(user.name);
    setEditEmail(user.email ?? "");
    setEditMobile(user.mobile ?? "");
    setEditRegNo(user.registration_number ?? "");
    setEditFieldErrors({});
    setEditError(null);
  }

  async function handleEditSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingUser || editSubmitting) return;

    const errors: Record<string, string> = {};
    const trimmedName = editName.trim();
    const trimmedEmail = editEmail.trim();
    const trimmedMobile = editMobile.trim();
    const trimmedRegNo = editRegNo.trim();

    if (trimmedName.length < 2) {
      errors.name = "Name must be at least 2 characters.";
    }
    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      errors.email = "Enter a valid email address.";
    }
    if (trimmedMobile && !/^[0-9+\-\s]{10,20}$/.test(trimmedMobile)) {
      errors.mobile = "Enter a valid mobile number (10-20 digits/symbols).";
    }
    if (trimmedRegNo && !/^[a-zA-Z0-9\-_/]{3,32}$/.test(trimmedRegNo)) {
      errors.registration_number =
        "Registration number must be 3-32 letters, numbers, hyphens, or underscores.";
    }

    if (Object.keys(errors).length > 0) {
      setEditFieldErrors(errors);
      setEditError(null);
      return;
    }

    setEditSubmitting(true);
    setEditFieldErrors({});
    setEditError(null);

    try {
      await client.users.update(editingUser.id, {
        name: trimmedName,
        email: trimmedEmail || null,
        mobile: trimmedMobile || null,
        registration_number: trimmedRegNo || null,
      });
      toast.success(`Updated account for ${trimmedName}.`);
      setEditingUser(null);
      await loadUsers();
    } catch (err: unknown) {
      const mapped = mapProblemFieldErrors(err);
      if (Object.keys(mapped).length > 0) {
        setEditFieldErrors(mapped);
      }
      setEditError(getGeneralErrorMessage(err, "Failed to update user."));
    } finally {
      setEditSubmitting(false);
    }
  }

  async function handleSuspendSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!suspendingUser || suspendSubmitting) return;

    setSuspendSubmitting(true);
    setSuspendError(null);

    try {
      await client.users.suspend(
        suspendingUser.id,
        suspendReason.trim() ? suspendReason.trim() : undefined
      );
      toast.success(`Suspended ${suspendingUser.name}.`);
      setSuspendingUser(null);
      setSuspendReason("");
      await loadUsers();
    } catch (err: unknown) {
      setSuspendError(getGeneralErrorMessage(err, "Failed to suspend user."));
    } finally {
      setSuspendSubmitting(false);
    }
  }

  async function handleReactivateConfirm() {
    if (!reactivatingUser || actionSubmitting) return;
    setActionSubmitting(true);
    setActionError(null);

    try {
      await client.users.reactivate(reactivatingUser.id);
      toast.success(`Reactivated ${reactivatingUser.name}.`);
      setReactivatingUser(null);
      await loadUsers();
    } catch (err: unknown) {
      const msg = getGeneralErrorMessage(err, "Failed to reactivate user.");
      setActionError(msg);
      toast.error(msg);
    } finally {
      setActionSubmitting(false);
    }
  }

  async function handleUnlockConfirm() {
    if (!unlockingUser || actionSubmitting) return;
    setActionSubmitting(true);
    setActionError(null);

    try {
      await client.users.unlock(unlockingUser.id);
      toast.success(`Cleared login lockouts for ${unlockingUser.name}.`);
      setUnlockingUser(null);
      await loadUsers();
    } catch (err: unknown) {
      const msg = getGeneralErrorMessage(err, "Failed to unlock user account.");
      setActionError(msg);
      toast.error(msg);
    } finally {
      setActionSubmitting(false);
    }
  }

  async function handleResetPasswordConfirm() {
    if (!resettingUser || actionSubmitting) return;
    setActionSubmitting(true);
    setActionError(null);

    try {
      const res = await client.users.resetPassword(resettingUser.id);
      setRevealedTempPassword({
        recipientName: resettingUser.name,
        payload: {
          temporary_password: res.data.temporary_password,
          expires_at: res.data.expires_at ?? null,
        },
      });
      toast.success(`Issued new temporary password for ${resettingUser.name}.`);
      setResettingUser(null);
      await loadUsers();
    } catch (err: unknown) {
      const status = problemStatus(err);
      const msg =
        status === 403
          ? getGeneralErrorMessage(
              err,
              "You are not authorized to reset this user's password (target may be outside your scope or hold equal/higher authority)."
            )
          : getGeneralErrorMessage(err, "Failed to reset temporary password.");
      setActionError(msg);
      setResettingUser(null);
      toast.error(msg);
    } finally {
      setActionSubmitting(false);
    }
  }

  function renderUserActions(user: UserSchema) {
    const resetCheck = canResetTargetPassword(sessionState.user, user);

    const resetMenuItem = (
      <DropdownMenuItem
        disabled={!resetCheck.allowed}
        onClick={() => {
          if (resetCheck.allowed) {
            setActionError(null);
            setResettingUser(user);
          }
        }}
      >
        <RiKey2Line className="size-4" aria-hidden="true" />
        Reset temporary password
      </DropdownMenuItem>
    );

    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Actions for ${user.name}`}
            >
              <RiMoreLine className="size-4" aria-hidden="true" />
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Account Actions</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => openEditDialog(user)}>
              <RiEditLine className="size-4" aria-hidden="true" />
              Edit details
            </DropdownMenuItem>
            {resetCheck.allowed ? (
              resetMenuItem
            ) : (
              <Tooltip>
                <TooltipTrigger render={<div className="w-full" />}>
                  {resetMenuItem}
                </TooltipTrigger>
                <TooltipContent side="left">
                  {resetCheck.reason ?? "Reset not permitted"}
                </TooltipContent>
              </Tooltip>
            )}
            {user.is_locked && (
              <DropdownMenuItem onClick={() => setUnlockingUser(user)}>
                <RiLockUnlockLine className="size-4" aria-hidden="true" />
                Unlock account
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          {user.status === "suspended" ? (
            <DropdownMenuItem onClick={() => setReactivatingUser(user)}>
              <RiUserFollowLine className="size-4" aria-hidden="true" />
              Reactivate account
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              variant="destructive"
              onClick={() => {
                setSuspendingUser(user);
                setSuspendReason("");
                setSuspendError(null);
              }}
            >
              <RiForbidLine className="size-4" aria-hidden="true" />
              Suspend account
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  const pageNumbers = React.useMemo(() => {
    const pages: number[] = [];
    const totalPages = Math.max(1, meta.last_page);
    const start = Math.max(1, meta.current_page - 2);
    const end = Math.min(totalPages, start + 4);
    for (let i = start; i <= end; i += 1) {
      pages.push(i);
    }
    return pages;
  }, [meta.current_page, meta.last_page]);

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <PageHeader
          title="Users"
          description="Search and manage user accounts, roles, temporary passwords, and login lockouts."
          actions={
            <Button type="button" onClick={openCreateDialog}>
              <RiUserAddLine className="size-4" aria-hidden="true" />
              Create User
            </Button>
          }
        />

        {revealedTempPassword && (
          <TemporaryPasswordReveal
            recipientName={revealedTempPassword.recipientName}
            payload={revealedTempPassword.payload}
            onDismiss={() => setRevealedTempPassword(null)}
          />
        )}

        {actionError && (
          <Alert variant="destructive">
            <RiAlertLine className="size-4" aria-hidden="true" />
            <AlertTitle>Action could not be completed</AlertTitle>
            <AlertDescription>{actionError}</AlertDescription>
          </Alert>
        )}

        {/* Filter Bar */}
        <Card size="sm">
          <CardContent>
            <form
              onSubmit={handleSearchSubmit}
              className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-12"
            >
              <div className="lg:col-span-6 flex gap-2">
                <div className="relative flex-1 min-w-0">
                  <Label htmlFor="users-search" className="sr-only">
                    Search users
                  </Label>
                  <Input
                    id="users-search"
                    type="search"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="Search name, email, or registration number..."
                  />
                </div>
                <Button type="submit" variant="secondary">
                  <RiSearchLine className="size-4" aria-hidden="true" />
                  <span className="sr-only sm:not-sr-only">Search</span>
                </Button>
              </div>

              <div className="lg:col-span-3">
                <Label htmlFor="users-type-filter" className="sr-only">
                  Filter by user type
                </Label>
                <Select
                  value={typeFilter}
                  onValueChange={(value) => {
                    setTypeFilter(typeof value === "string" ? value : "all");
                    setPage(1);
                  }}
                  items={TYPE_ITEMS}
                >
                  <SelectTrigger id="users-type-filter" className="w-full">
                    <SelectValue placeholder="All types" />
                  </SelectTrigger>
                  <SelectContent>
                    {TYPE_ITEMS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="lg:col-span-3">
                <Label htmlFor="users-status-filter" className="sr-only">
                  Filter by account status
                </Label>
                <Select
                  value={statusFilter}
                  onValueChange={(value) => {
                    setStatusFilter(typeof value === "string" ? value : "all");
                    setPage(1);
                  }}
                  items={STATUS_ITEMS}
                >
                  <SelectTrigger id="users-status-filter" className="w-full">
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_ITEMS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </form>
          </CardContent>
        </Card>

        {loading && (
          <div className="space-y-3" aria-busy="true">
            <Skeleton className="h-12 w-full rounded-lg" />
            <Skeleton className="h-12 w-full rounded-lg" />
            <Skeleton className="h-12 w-full rounded-lg" />
          </div>
        )}

        {!loading && loadError && (
          <Alert variant="destructive">
            <RiAlertLine className="size-4" aria-hidden="true" />
            <AlertTitle>Unable to load users</AlertTitle>
            <AlertDescription className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <span>{loadError}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void loadUsers()}
              >
                <RiRefreshLine className="size-4" aria-hidden="true" />
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {!loading && !loadError && (
          <Card>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  Showing {users.length} of {meta.total} user account(s)
                </span>
                {meta.last_page > 1 && (
                  <span className="font-mono">
                    Page {meta.current_page} of {meta.last_page}
                  </span>
                )}
              </div>

              {users.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  No user accounts match the current filters.
                </div>
              ) : (
                <>
                  {/* Desktop table */}
                  <div className="hidden md:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Roles</TableHead>
                          <TableHead>Contact</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Last Login</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {users.map((user) => {
                          const badge = userStatusBadge(user.status);
                          return (
                            <TableRow key={user.id}>
                              <TableCell className="whitespace-normal">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-medium text-foreground">
                                    {user.name}
                                  </span>
                                  {user.must_change_password && (
                                    <Badge variant="outline" className="text-[11px]">
                                      Must change password
                                    </Badge>
                                  )}
                                  {user.is_locked && (
                                    <StatusBadge status="danger">Locked</StatusBadge>
                                  )}
                                </div>
                                {user.must_change_password &&
                                  user.temporary_password_expires_at && (
                                    <div className="text-[11px] text-muted-foreground">
                                      expires {formatDisplayDate(user.temporary_password_expires_at)}
                                    </div>
                                  )}
                                {user.registration_number && (
                                  <div className="text-xs font-mono text-muted-foreground">
                                    {user.registration_number}
                                  </div>
                                )}
                              </TableCell>
                              <TableCell>
                                <Badge variant="secondary" className="capitalize">
                                  {user.type}
                                </Badge>
                              </TableCell>
                              <TableCell className="whitespace-normal">
                                {user.assignments.length > 0 ? (
                                  <div className="flex flex-wrap gap-1">
                                    {user.assignments.map((a) => (
                                      <Badge
                                        key={a.id}
                                        variant="outline"
                                        className="text-[11px]"
                                      >
                                        {a.role_name || a.role_key}
                                      </Badge>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </TableCell>
                              <TableCell className="whitespace-normal">
                                <div className="text-sm text-foreground">
                                  {user.email ?? "—"}
                                </div>
                                {user.mobile && (
                                  <div className="text-xs font-mono text-muted-foreground">
                                    {user.mobile}
                                  </div>
                                )}
                              </TableCell>
                              <TableCell>
                                <StatusBadge status={badge.semantic}>
                                  {badge.label}
                                </StatusBadge>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {formatDisplayDateTime(user.last_login_at, "Never")}
                              </TableCell>
                              <TableCell className="text-right">
                                {renderUserActions(user)}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Mobile cards (375px+) */}
                  <div className="space-y-3 md:hidden">
                    {users.map((user) => {
                      const badge = userStatusBadge(user.status);
                      return (
                        <div
                          key={user.id}
                          className="rounded-lg border border-border p-3.5 space-y-2.5"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 space-y-1">
                              <p className="text-sm font-semibold text-foreground truncate">
                                {user.name}
                              </p>
                              <div className="flex flex-wrap items-center gap-1.5">
                                <Badge variant="secondary" className="capitalize text-[11px]">
                                  {user.type}
                                </Badge>
                                <StatusBadge status={badge.semantic}>
                                  {badge.label}
                                </StatusBadge>
                                {user.is_locked && (
                                  <StatusBadge status="danger">Locked</StatusBadge>
                                )}
                                {user.must_change_password && (
                                  <Badge variant="outline" className="text-[11px]">
                                    Must change password
                                  </Badge>
                                )}
                              </div>
                            </div>
                            {renderUserActions(user)}
                          </div>

                          {user.assignments.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {user.assignments.map((a) => (
                                <Badge
                                  key={a.id}
                                  variant="outline"
                                  className="text-[11px]"
                                >
                                  {a.role_name || a.role_key}
                                </Badge>
                              ))}
                            </div>
                          )}

                          <div className="space-y-1 text-xs text-muted-foreground">
                            {user.must_change_password &&
                              user.temporary_password_expires_at && (
                                <div>
                                  Temp password expires{" "}
                                  <span className="text-foreground">
                                    {formatDisplayDate(user.temporary_password_expires_at)}
                                  </span>
                                </div>
                              )}
                            <div className="truncate">
                              Email:{" "}
                              <span className="text-foreground">{user.email ?? "—"}</span>
                            </div>
                            {user.mobile && (
                              <div>
                                Mobile:{" "}
                                <span className="font-mono text-foreground">{user.mobile}</span>
                              </div>
                            )}
                            <div>
                              Last login:{" "}
                              <span className="text-foreground">
                                {formatDisplayDateTime(user.last_login_at, "Never")}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {meta.last_page > 1 && (
                <Pagination className="pt-2">
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        href={`?page=${Math.max(1, meta.current_page - 1)}`}
                        onClick={(e) => {
                          e.preventDefault();
                          if (meta.current_page > 1) {
                            setPage(meta.current_page - 1);
                          }
                        }}
                        aria-disabled={meta.current_page <= 1}
                        className={
                          meta.current_page <= 1 ? "pointer-events-none opacity-50" : undefined
                        }
                      />
                    </PaginationItem>

                    {pageNumbers.map((pageNum) => (
                      <PaginationItem key={pageNum}>
                        <PaginationLink
                          href={`?page=${pageNum}`}
                          isActive={pageNum === meta.current_page}
                          onClick={(e) => {
                            e.preventDefault();
                            setPage(pageNum);
                          }}
                        >
                          {pageNum}
                        </PaginationLink>
                      </PaginationItem>
                    ))}

                    <PaginationItem>
                      <PaginationNext
                        href={`?page=${Math.min(meta.last_page, meta.current_page + 1)}`}
                        onClick={(e) => {
                          e.preventDefault();
                          if (meta.current_page < meta.last_page) {
                            setPage(meta.current_page + 1);
                          }
                        }}
                        aria-disabled={meta.current_page >= meta.last_page}
                        className={
                          meta.current_page >= meta.last_page
                            ? "pointer-events-none opacity-50"
                            : undefined
                        }
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              )}
            </CardContent>
          </Card>
        )}

        {/* Create User Dialog */}
        <Dialog
          open={createOpen}
          onOpenChange={(open) => {
            if (!open && !createSubmitting) setCreateOpen(false);
          }}
        >
          <DialogContent>
            <form onSubmit={handleCreateSubmit} noValidate className="space-y-4">
              <DialogHeader>
                <DialogTitle>Create User Account</DialogTitle>
                <DialogDescription>
                  Create a new user account. A one-time temporary password will be generated by
                  the server and shown once upon creation.
                </DialogDescription>
              </DialogHeader>

              {createError && (
                <Alert variant="destructive">
                  <RiAlertLine className="size-4" aria-hidden="true" />
                  <AlertDescription>{createError}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="create-user-type">Account Type</Label>
                  <Select
                    value={createType}
                    onValueChange={(value) => {
                      if (value === "staff" || value === "student" || value === "parent") {
                        setCreateType(value);
                      }
                    }}
                    items={CREATE_TYPE_ITEMS}
                    disabled={createSubmitting}
                  >
                    <SelectTrigger id="create-user-type" className="w-full">
                      <SelectValue placeholder="Select account type" />
                    </SelectTrigger>
                    <SelectContent>
                      {CREATE_TYPE_ITEMS.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="create-user-name">Full Name</Label>
                  <Input
                    id="create-user-name"
                    value={createName}
                    onChange={(e) => {
                      setCreateName(e.target.value);
                      setCreateFieldErrors((prev) => ({ ...prev, name: "" }));
                    }}
                    disabled={createSubmitting}
                    aria-invalid={Boolean(createFieldErrors.name)}
                    aria-describedby={createFieldErrors.name ? "create-user-name-error" : undefined}
                  />
                  {createFieldErrors.name && (
                    <p id="create-user-name-error" className="text-xs text-destructive">
                      {createFieldErrors.name}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="create-user-email">Email</Label>
                  <Input
                    id="create-user-email"
                    type="email"
                    value={createEmail}
                    onChange={(e) => {
                      setCreateEmail(e.target.value);
                      setCreateFieldErrors((prev) => ({ ...prev, email: "" }));
                    }}
                    disabled={createSubmitting}
                    aria-invalid={Boolean(createFieldErrors.email)}
                    aria-describedby={
                      createFieldErrors.email ? "create-user-email-error" : undefined
                    }
                  />
                  {createFieldErrors.email && (
                    <p id="create-user-email-error" className="text-xs text-destructive">
                      {createFieldErrors.email}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="create-user-mobile">Mobile (optional)</Label>
                  <Input
                    id="create-user-mobile"
                    value={createMobile}
                    onChange={(e) => {
                      setCreateMobile(e.target.value);
                      setCreateFieldErrors((prev) => ({ ...prev, mobile: "" }));
                    }}
                    disabled={createSubmitting}
                    aria-invalid={Boolean(createFieldErrors.mobile)}
                    aria-describedby={
                      createFieldErrors.mobile ? "create-user-mobile-error" : undefined
                    }
                  />
                  {createFieldErrors.mobile && (
                    <p id="create-user-mobile-error" className="text-xs text-destructive">
                      {createFieldErrors.mobile}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="create-user-regno">Registration Number (optional)</Label>
                  <Input
                    id="create-user-regno"
                    value={createRegNo}
                    onChange={(e) => {
                      setCreateRegNo(e.target.value);
                      setCreateFieldErrors((prev) => ({ ...prev, registration_number: "" }));
                    }}
                    disabled={createSubmitting}
                    aria-invalid={Boolean(createFieldErrors.registration_number)}
                    aria-describedby={
                      createFieldErrors.registration_number
                        ? "create-user-regno-error"
                        : undefined
                    }
                  />
                  {createFieldErrors.registration_number && (
                    <p id="create-user-regno-error" className="text-xs text-destructive">
                      {createFieldErrors.registration_number}
                    </p>
                  )}
                </div>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCreateOpen(false)}
                  disabled={createSubmitting}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={createSubmitting}>
                  {createSubmitting ? (
                    <>
                      <RiLoader4Line className="size-4 animate-spin" aria-hidden="true" />
                      Creating...
                    </>
                  ) : (
                    "Create Account"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Edit User Dialog */}
        <Dialog
          open={editingUser !== null}
          onOpenChange={(open) => {
            if (!open && !editSubmitting) setEditingUser(null);
          }}
        >
          <DialogContent>
            <form onSubmit={handleEditSubmit} noValidate className="space-y-4">
              <DialogHeader>
                <DialogTitle>Edit User Account</DialogTitle>
                <DialogDescription>
                  Update identity attributes for {editingUser?.name}.
                </DialogDescription>
              </DialogHeader>

              {editError && (
                <Alert variant="destructive">
                  <RiAlertLine className="size-4" aria-hidden="true" />
                  <AlertDescription>{editError}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-user-name">Full Name</Label>
                  <Input
                    id="edit-user-name"
                    value={editName}
                    onChange={(e) => {
                      setEditName(e.target.value);
                      setEditFieldErrors((prev) => ({ ...prev, name: "" }));
                    }}
                    disabled={editSubmitting}
                    aria-invalid={Boolean(editFieldErrors.name)}
                    aria-describedby={editFieldErrors.name ? "edit-user-name-error" : undefined}
                  />
                  {editFieldErrors.name && (
                    <p id="edit-user-name-error" className="text-xs text-destructive">
                      {editFieldErrors.name}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="edit-user-email">Email</Label>
                  <Input
                    id="edit-user-email"
                    type="email"
                    value={editEmail}
                    onChange={(e) => {
                      setEditEmail(e.target.value);
                      setEditFieldErrors((prev) => ({ ...prev, email: "" }));
                    }}
                    disabled={editSubmitting}
                    aria-invalid={Boolean(editFieldErrors.email)}
                    aria-describedby={editFieldErrors.email ? "edit-user-email-error" : undefined}
                  />
                  {editFieldErrors.email && (
                    <p id="edit-user-email-error" className="text-xs text-destructive">
                      {editFieldErrors.email}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="edit-user-mobile">Mobile</Label>
                  <Input
                    id="edit-user-mobile"
                    value={editMobile}
                    onChange={(e) => {
                      setEditMobile(e.target.value);
                      setEditFieldErrors((prev) => ({ ...prev, mobile: "" }));
                    }}
                    disabled={editSubmitting}
                    aria-invalid={Boolean(editFieldErrors.mobile)}
                    aria-describedby={editFieldErrors.mobile ? "edit-user-mobile-error" : undefined}
                  />
                  {editFieldErrors.mobile && (
                    <p id="edit-user-mobile-error" className="text-xs text-destructive">
                      {editFieldErrors.mobile}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="edit-user-regno">Registration Number</Label>
                  <Input
                    id="edit-user-regno"
                    value={editRegNo}
                    onChange={(e) => {
                      setEditRegNo(e.target.value);
                      setEditFieldErrors((prev) => ({ ...prev, registration_number: "" }));
                    }}
                    disabled={editSubmitting}
                    aria-invalid={Boolean(editFieldErrors.registration_number)}
                    aria-describedby={
                      editFieldErrors.registration_number ? "edit-user-regno-error" : undefined
                    }
                  />
                  {editFieldErrors.registration_number && (
                    <p id="edit-user-regno-error" className="text-xs text-destructive">
                      {editFieldErrors.registration_number}
                    </p>
                  )}
                </div>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditingUser(null)}
                  disabled={editSubmitting}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={editSubmitting}>
                  {editSubmitting ? (
                    <>
                      <RiLoader4Line className="size-4 animate-spin" aria-hidden="true" />
                      Saving...
                    </>
                  ) : (
                    "Save Changes"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Suspend User Dialog */}
        <Dialog
          open={suspendingUser !== null}
          onOpenChange={(open) => {
            if (!open && !suspendSubmitting) setSuspendingUser(null);
          }}
        >
          <DialogContent>
            <form onSubmit={handleSuspendSubmit} noValidate className="space-y-4">
              <DialogHeader>
                <DialogTitle>Suspend User Account</DialogTitle>
                <DialogDescription>
                  Suspending {suspendingUser?.name} will revoke all active access tokens
                  immediately.
                </DialogDescription>
              </DialogHeader>

              {suspendError && (
                <Alert variant="destructive">
                  <RiAlertLine className="size-4" aria-hidden="true" />
                  <AlertDescription>{suspendError}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="suspend-reason">Reason (optional)</Label>
                <Input
                  id="suspend-reason"
                  value={suspendReason}
                  onChange={(e) => setSuspendReason(e.target.value)}
                  placeholder="Reason for suspension"
                  disabled={suspendSubmitting}
                />
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSuspendingUser(null)}
                  disabled={suspendSubmitting}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="destructive" disabled={suspendSubmitting}>
                  {suspendSubmitting ? "Suspending..." : "Suspend Account"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Reset Temporary Password AlertDialog */}
        <AlertDialog
          open={resettingUser !== null}
          onOpenChange={(open) => {
            if (!open && !actionSubmitting) setResettingUser(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reset Temporary Password</AlertDialogTitle>
              <AlertDialogDescription>
                Generate a new one-time temporary password for {resettingUser?.name}? Their
                previous password and active sessions will be invalidated immediately.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={actionSubmitting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={actionSubmitting}
                onClick={() => void handleResetPasswordConfirm()}
              >
                {actionSubmitting ? "Resetting..." : "Reset Password"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Reactivate User AlertDialog */}
        <AlertDialog
          open={reactivatingUser !== null}
          onOpenChange={(open) => {
            if (!open && !actionSubmitting) setReactivatingUser(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reactivate User Account</AlertDialogTitle>
              <AlertDialogDescription>
                Restore active sign-in access for {reactivatingUser?.name}?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={actionSubmitting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={actionSubmitting}
                onClick={() => void handleReactivateConfirm()}
              >
                {actionSubmitting ? "Reactivating..." : "Reactivate"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Unlock User AlertDialog */}
        <AlertDialog
          open={unlockingUser !== null}
          onOpenChange={(open) => {
            if (!open && !actionSubmitting) setUnlockingUser(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Unlock User Account</AlertDialogTitle>
              <AlertDialogDescription>
                Clear failed-login rate-limit lockouts for {unlockingUser?.name}?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={actionSubmitting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={actionSubmitting}
                onClick={() => void handleUnlockConfirm()}
              >
                {actionSubmitting ? "Unlocking..." : "Unlock Account"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}

"use client";

import * as React from "react";
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
  type SemanticStatus,
} from "@academic-suite/ui";
import {
  RiAlertLine,
  RiEditLine,
  RiForbidLine,
  RiLoader4Line,
  RiLockUnlockLine,
  RiMoreLine,
  RiRefreshLine,
  RiSearchLine,
  RiUserAddLine,
  RiUserFollowLine,
} from "@remixicon/react";
import { toast } from "sonner";
import { useApiClient } from "@/lib/auth/session-provider";
import {
  parsePaginatedUsers,
  type PaginationMeta,
  type UserRecord,
} from "@/lib/api-narrowing";
import {
  getGeneralErrorMessage,
  mapProblemFieldErrors,
} from "@/app/setup/logic/error-mapping";

const TYPE_ITEMS = [
  { value: "all", label: "All types" },
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

function formatDateTime(value: string | null): string {
  if (!value) return "Never";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

export function SuperAdminUsersPage() {
  const client = useApiClient();

  const [users, setUsers] = React.useState<UserRecord[]>([]);
  const [meta, setMeta] = React.useState<PaginationMeta>({
    current_page: 1,
    last_page: 1,
    per_page: 25,
    total: 0,
  });
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  // Filters
  const [searchInput, setSearchInput] = React.useState("");
  const [appliedSearch, setAppliedSearch] = React.useState("");
  const [typeFilter, setTypeFilter] = React.useState("all");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [page, setPage] = React.useState(1);

  // Edit dialog state
  const [editingUser, setEditingUser] = React.useState<UserRecord | null>(null);
  const [editName, setEditName] = React.useState("");
  const [editEmail, setEditEmail] = React.useState("");
  const [editMobile, setEditMobile] = React.useState("");
  const [editRegNo, setEditRegNo] = React.useState("");
  const [editFieldErrors, setEditFieldErrors] = React.useState<Record<string, string>>({});
  const [editError, setEditError] = React.useState<string | null>(null);
  const [editSubmitting, setEditSubmitting] = React.useState(false);

  // Suspend dialog state
  const [suspendingUser, setSuspendingUser] = React.useState<UserRecord | null>(null);
  const [suspendReason, setSuspendReason] = React.useState("");
  const [suspendError, setSuspendError] = React.useState<string | null>(null);
  const [suspendSubmitting, setSuspendSubmitting] = React.useState(false);

  // Reactivate / Unlock confirmation dialogs
  const [reactivatingUser, setReactivatingUser] = React.useState<UserRecord | null>(null);
  const [unlockingUser, setUnlockingUser] = React.useState<UserRecord | null>(null);
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
      const parsed = parsePaginatedUsers(res);
      setUsers(parsed.data);
      setMeta(parsed.meta);
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

  function openEditDialog(user: UserRecord) {
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
    if (trimmedRegNo && !/^[a-zA-Z0-9\-_]{3,32}$/.test(trimmedRegNo)) {
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

    try {
      await client.users.reactivate(reactivatingUser.id);
      toast.success(`Reactivated ${reactivatingUser.name}.`);
      setReactivatingUser(null);
      await loadUsers();
    } catch (err: unknown) {
      toast.error(getGeneralErrorMessage(err, "Failed to reactivate user."));
    } finally {
      setActionSubmitting(false);
    }
  }

  async function handleUnlockConfirm() {
    if (!unlockingUser || actionSubmitting) return;
    setActionSubmitting(true);

    try {
      await client.users.unlock(unlockingUser.id);
      toast.success(`Cleared login lockouts for ${unlockingUser.name}.`);
      setUnlockingUser(null);
    } catch (err: unknown) {
      toast.error(getGeneralErrorMessage(err, "Failed to unlock user account."));
    } finally {
      setActionSubmitting(false);
    }
  }

  function renderUserActions(user: UserRecord) {
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
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Account Actions</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => openEditDialog(user)}>
              <RiEditLine className="size-4" aria-hidden="true" />
              Edit details
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setUnlockingUser(user)}>
              <RiLockUnlockLine className="size-4" aria-hidden="true" />
              Unlock account
            </DropdownMenuItem>
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
    <div className="space-y-6">
      <PageHeader
        title="Users"
        description="Search and manage user account status, contact details, and login lockouts."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">Awaiting backend support</Badge>
            <Button type="button" disabled>
              <RiUserAddLine className="size-4" aria-hidden="true" />
              Create User
            </Button>
          </div>
        }
      />

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
                              </div>
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
                              {formatDateTime(user.last_login_at)}
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
                              {user.must_change_password && (
                                <Badge variant="outline" className="text-[11px]">
                                  Must change password
                                </Badge>
                              )}
                            </div>
                          </div>
                          {renderUserActions(user)}
                        </div>

                        <div className="space-y-1 text-xs text-muted-foreground">
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
                              {formatDateTime(user.last_login_at)}
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
  );
}


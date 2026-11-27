"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
  buttonVariants,
  Card,
  CardContent,
  Checkbox,
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
  Tabs,
  TabsList,
  TabsTrigger,
  Textarea,
  type SemanticStatus,
} from "@academic-suite/ui";
import {
  RiAlertLine,
  RiCheckDoubleLine,
  RiCheckLine,
  RiCloseLine,
  RiEditLine,
  RiForbidLine,
  RiKey2Line,
  RiLoader4Line,
  RiLockUnlockLine,
  RiMoreLine,
  RiRefreshLine,
  RiSearchLine,
  RiShieldUserLine,
  RiUploadCloud2Line,
  RiUserAddLine,
  RiUserFollowLine,
  RiUserUnfollowLine,
} from "@remixicon/react";
import { toast } from "sonner";
import {
  STALE_TIME_LIST_MS,
  STALE_TIME_REFERENCE_MS,
  useApiMutation,
  useApiQuery,
} from "@/lib/query/api-query";
import { useSession } from "@/lib/auth/session-provider";
import { problemStatus } from "@/lib/auth/problem";
import { formatDisplayDate, formatDisplayDateTime } from "@/lib/format-date";
import {
  getGeneralErrorMessage,
  mapProblemFieldErrors,
} from "@/app/setup/logic/error-mapping";
import {
  TemporaryPasswordReveal,
  type TemporaryPasswordPayload,
} from "@/components/super-admin/TemporaryPasswordReveal";
import { LeadershipAppointDialog } from "@/components/principal/LeadershipAppointDialog";

type UserSchema = components["schemas"]["UserSchema"];
type PaginationMeta = components["schemas"]["PaginationMeta"];
type UserType = components["schemas"]["CreateUserInput"]["type"];
type BulkApproveData = components["schemas"]["BulkApproveEnvelope"]["data"];

interface DepartmentLookup {
  id: string;
  code: string;
  name: string;
}

export interface UserDirectoryProps {
  title?: string;
  description?: string;
}

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
  { value: "pending", label: "Pending" },
  { value: "suspended", label: "Suspended" },
  { value: "deactivated", label: "Deactivated" },
  { value: "rejected", label: "Rejected" },
];

const USER_INVALIDATE_KEYS = [
  ["users", "directory"],
  ["users", "pending-count"],
  ["super-admin", "overview"],
  ["principal", "overview"],
  ["principal", "departments"],
] as const;

function userStatusBadge(status: string): {
  semantic: SemanticStatus;
  label: string;
  className?: string;
} {
  switch (status) {
    case "active":
      return { semantic: "success", label: "Active" };
    case "pending":
      return { semantic: "warning", label: "Pending", className: "dark:text-foreground" };
    case "suspended":
      return { semantic: "danger", label: "Suspended" };
    case "deactivated":
      return { semantic: "neutral", label: "Deactivated" };
    case "rejected":
      return { semantic: "danger", label: "Rejected" };
    default:
      return { semantic: "neutral", label: status };
  }
}

function bulkStatusBadge(status: string): SemanticStatus {
  switch (status) {
    case "approved":
      return "success";
    case "skipped":
      return "warning";
    case "forbidden":
    case "not_found":
      return "danger";
    default:
      return "neutral";
  }
}

import { validateAuditedReason } from "@/components/common/AuditedReasonDialog";

function validateReasonRange(reason: string): string | null {
  return validateAuditedReason(reason);
}

export function UserDirectory({
  title = "Users",
  description = "Search and manage user accounts, roles, temporary passwords, and login lockouts.",
}: UserDirectoryProps) {
  const { state: sessionState } = useSession();
  const pathname = usePathname();
  const importHref = pathname?.startsWith("/w/super-admin")
    ? "/w/super-admin/users/import"
    : "/w/principal/users/import";

  const capabilities = React.useMemo(
    () => new Set(sessionState.user?.capabilities ?? []),
    [sessionState.user?.capabilities]
  );

  const canCreateUser = capabilities.has("identity.user.create");
  const canImportStaff = capabilities.has("identity.user.import");
  const canAppointRole = capabilities.has("identity.role_assignment.create");
  const canResetPassword = capabilities.has("identity.user.reset_password");
  const canApproveFromCapabilities =
    capabilities.has("identity.user.approve") ||
    capabilities.has("identity.user.reject");

  const [actionError, setActionError] = React.useState<string | null>(null);

  // Filters
  const [searchInput, setSearchInput] = React.useState("");
  const [appliedSearch, setAppliedSearch] = React.useState("");
  const [typeFilter, setTypeFilter] = React.useState("all");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [directoryTab, setDirectoryTab] = React.useState<"all" | "pending" | "not_activated">("all");
  const [expiredTempOnly, setExpiredTempOnly] = React.useState(false);
  const [page, setPage] = React.useState(1);

  // Bulk selection & results for Pending view
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(() => new Set());
  const [bulkResult, setBulkResult] = React.useState<BulkApproveData | null>(null);
  const [appointingUser, setAppointingUser] = React.useState<UserSchema | null>(null);

  const {
    data: usersData,
    isPending: loading,
    error: queryError,
    refetch,
  } = useApiQuery<{ data: UserSchema[]; meta: PaginationMeta }>({
    queryKey: [
      "users",
      "directory",
      {
        page,
        search: appliedSearch.trim(),
        type: typeFilter,
        status: statusFilter,
        tab: directoryTab,
        expiredTempOnly,
      },
    ],
    staleTime: STALE_TIME_LIST_MS,
    queryFn: async (api) => {
      const apiUsers = api.identity?.users ?? api.users;
      const query: Record<string, string | number | boolean> = { page };
      if (appliedSearch.trim()) query.search = appliedSearch.trim();
      if (typeFilter !== "all") query.type = typeFilter;
      if (directoryTab === "pending") {
        query.status = "pending";
      } else if (directoryTab === "not_activated") {
        query.must_change_password = true;
        if (expiredTempOnly) {
          query.expired_temp_password = true;
        }
      } else if (statusFilter !== "all") {
        query.status = statusFilter;
      }
      return apiUsers.list(query);
    },
  });

  const users = React.useMemo(() => usersData?.data ?? [], [usersData?.data]);
  const meta: PaginationMeta = usersData?.meta ?? {
    current_page: 1,
    last_page: 1,
    per_page: 25,
    total: 0,
  };
  const loadError = queryError
    ? getGeneralErrorMessage(queryError, "Failed to load users directory.")
    : null;

  const hasApproverAbilityInRows = React.useMemo(
    () => users.some((u) => u.abilities?.approve || u.abilities?.reject),
    [users]
  );
  const showPendingTab = canApproveFromCapabilities || hasApproverAbilityInRows || directoryTab === "pending";
  const showNotActivatedTab =
    canResetPassword ||
    users.some((u) => u.abilities?.reset_password) ||
    directoryTab === "not_activated";
  const isPendingTab = directoryTab === "pending";
  const isNotActivatedTab = directoryTab === "not_activated";

  const { data: departmentsData } = useApiQuery<{ data: DepartmentLookup[] }>({
    queryKey: ["organisation", "departments"],
    staleTime: STALE_TIME_REFERENCE_MS,
    enabled: isPendingTab,
    queryFn: async (api) => {
      const apiDepts = api.organisation?.departments ?? api.departments;
      if (!apiDepts?.list) return { data: [] };
      return apiDepts.list() as Promise<{ data: DepartmentLookup[] }>;
    },
  });

  const departmentById = React.useMemo(() => {
    const map = new Map<string, DepartmentLookup>();
    for (const d of departmentsData?.data ?? []) {
      map.set(d.id, d);
    }
    return map;
  }, [departmentsData?.data]);

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

  // Edit dialog state
  const [editingUser, setEditingUser] = React.useState<UserSchema | null>(null);
  const [editName, setEditName] = React.useState("");
  const [editEmail, setEditEmail] = React.useState("");
  const [editMobile, setEditMobile] = React.useState("");
  const [editRegNo, setEditRegNo] = React.useState("");
  const [editFieldErrors, setEditFieldErrors] = React.useState<Record<string, string>>({});
  const [editError, setEditError] = React.useState<string | null>(null);

  // Suspend dialog state
  const [suspendingUser, setSuspendingUser] = React.useState<UserSchema | null>(null);
  const [suspendReason, setSuspendReason] = React.useState("");
  const [suspendError, setSuspendError] = React.useState<string | null>(null);

  // Reject dialog state
  const [rejectingUser, setRejectingUser] = React.useState<UserSchema | null>(null);
  const [rejectReason, setRejectReason] = React.useState("");
  const [rejectFieldErrors, setRejectFieldErrors] = React.useState<Record<string, string>>({});
  const [rejectError, setRejectError] = React.useState<string | null>(null);

  // Deactivate dialog state
  const [deactivatingUser, setDeactivatingUser] = React.useState<UserSchema | null>(null);
  const [deactivateReason, setDeactivateReason] = React.useState("");
  const [deactivateFieldErrors, setDeactivateFieldErrors] = React.useState<Record<string, string>>(
    {}
  );
  const [deactivateError, setDeactivateError] = React.useState<string | null>(null);

  // Confirmation AlertDialogs
  const [approvingUser, setApprovingUser] = React.useState<UserSchema | null>(null);
  const [reactivatingUser, setReactivatingUser] = React.useState<UserSchema | null>(null);
  const [unlockingUser, setUnlockingUser] = React.useState<UserSchema | null>(null);
  const [resettingUser, setResettingUser] = React.useState<UserSchema | null>(null);

  // Mutations via TanStack Query
  const createMutation = useApiMutation({
    mutationFn: (api, body: components["schemas"]["CreateUserInput"]) =>
      (api.identity?.users ?? api.users).create(body),
    invalidateKeys: USER_INVALIDATE_KEYS,
  });

  const updateMutation = useApiMutation({
    mutationFn: (
      api,
      vars: { id: string; body: components["schemas"]["UpdateUserInput"] }
    ) => (api.identity?.users ?? api.users).update(vars.id, vars.body),
    invalidateKeys: USER_INVALIDATE_KEYS,
  });

  const suspendMutation = useApiMutation({
    mutationFn: (api, vars: { id: string; reason?: string }) =>
      (api.identity?.users ?? api.users).suspend(vars.id, vars.reason),
    invalidateKeys: USER_INVALIDATE_KEYS,
  });

  const reactivateMutation = useApiMutation({
    mutationFn: (api, id: string) =>
      (api.identity?.users ?? api.users).reactivate(id),
    invalidateKeys: USER_INVALIDATE_KEYS,
  });

  const unlockMutation = useApiMutation({
    mutationFn: (api, id: string) =>
      (api.identity?.users ?? api.users).unlock(id),
    invalidateKeys: USER_INVALIDATE_KEYS,
  });

  const resetPasswordMutation = useApiMutation({
    mutationFn: (api, id: string) =>
      (api.identity?.users ?? api.users).resetPassword(id),
    invalidateKeys: USER_INVALIDATE_KEYS,
  });

  const approveMutation = useApiMutation({
    mutationFn: (api, id: string) =>
      (api.identity?.users ?? api.users).approve(id),
    invalidateKeys: USER_INVALIDATE_KEYS,
  });

  const rejectMutation = useApiMutation({
    mutationFn: (api, vars: { id: string; reason: string }) =>
      (api.identity?.users ?? api.users).reject(vars.id, { reason: vars.reason }),
    invalidateKeys: USER_INVALIDATE_KEYS,
  });

  const deactivateMutation = useApiMutation({
    mutationFn: (api, vars: { id: string; reason: string }) =>
      (api.identity?.users ?? api.users).deactivate(vars.id, { reason: vars.reason }),
    invalidateKeys: USER_INVALIDATE_KEYS,
  });

  const bulkApproveMutation = useApiMutation({
    mutationFn: (api, userIds: string[]) =>
      (api.identity?.users ?? api.users).bulkApprove({ user_ids: userIds }),
    invalidateKeys: USER_INVALIDATE_KEYS,
  });

  const actionSubmitting =
    approveMutation.isPending ||
    reactivateMutation.isPending ||
    unlockMutation.isPending ||
    resetPasswordMutation.isPending;

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
    if (createMutation.isPending) return;

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

    setCreateFieldErrors({});
    setCreateError(null);

    try {
      const res = await createMutation.mutateAsync({
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
    } catch (err: unknown) {
      const mapped = mapProblemFieldErrors(err);
      if (Object.keys(mapped).length > 0) {
        setCreateFieldErrors(mapped);
      }
      setCreateError(getGeneralErrorMessage(err, "Failed to create user account."));
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
    if (!editingUser || updateMutation.isPending) return;

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

    setEditFieldErrors({});
    setEditError(null);

    try {
      await updateMutation.mutateAsync({
        id: editingUser.id,
        body: {
          name: trimmedName,
          email: trimmedEmail || null,
          mobile: trimmedMobile || null,
          registration_number: trimmedRegNo || null,
        },
      });
      toast.success(`Updated account for ${trimmedName}.`);
      setEditingUser(null);
    } catch (err: unknown) {
      const mapped = mapProblemFieldErrors(err);
      if (Object.keys(mapped).length > 0) {
        setEditFieldErrors(mapped);
      }
      setEditError(getGeneralErrorMessage(err, "Failed to update user."));
    }
  }

  async function handleSuspendSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!suspendingUser || suspendMutation.isPending) return;

    setSuspendError(null);

    try {
      await suspendMutation.mutateAsync({
        id: suspendingUser.id,
        reason: suspendReason.trim() ? suspendReason.trim() : undefined,
      });
      toast.success(`Suspended ${suspendingUser.name}.`);
      setSuspendingUser(null);
      setSuspendReason("");
    } catch (err: unknown) {
      setSuspendError(getGeneralErrorMessage(err, "Failed to suspend user."));
    }
  }

  async function handleApproveConfirm() {
    if (!approvingUser || approveMutation.isPending) return;
    setActionError(null);

    try {
      await approveMutation.mutateAsync(approvingUser.id);
      const approved = approvingUser;
      setApprovingUser(null);
      toast.success(
        `Approved ${approved.name}.`,
        canAppointRole
          ? {
              action: {
                label: "Appoint Role",
                onClick: () => setAppointingUser(approved),
              },
            }
          : undefined
      );
    } catch (err: unknown) {
      const msg = getGeneralErrorMessage(err, "Failed to approve user.");
      setActionError(msg);
      setApprovingUser(null);
      toast.error(msg);
    }
  }

  async function handleRejectSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!rejectingUser || rejectMutation.isPending) return;

    const reasonError = validateReasonRange(rejectReason);
    if (reasonError) {
      setRejectFieldErrors({ reason: reasonError });
      setRejectError(null);
      return;
    }

    setRejectFieldErrors({});
    setRejectError(null);

    try {
      await rejectMutation.mutateAsync({
        id: rejectingUser.id,
        reason: rejectReason.trim(),
      });
      toast.success(`Rejected ${rejectingUser.name}.`);
      setRejectingUser(null);
      setRejectReason("");
    } catch (err: unknown) {
      const mapped = mapProblemFieldErrors(err);
      if (Object.keys(mapped).length > 0) {
        setRejectFieldErrors(mapped);
      }
      setRejectError(getGeneralErrorMessage(err, "Failed to reject user."));
    }
  }

  async function handleDeactivateSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!deactivatingUser || deactivateMutation.isPending) return;

    const reasonError = validateReasonRange(deactivateReason);
    if (reasonError) {
      setDeactivateFieldErrors({ reason: reasonError });
      setDeactivateError(null);
      return;
    }

    setDeactivateFieldErrors({});
    setDeactivateError(null);

    try {
      await deactivateMutation.mutateAsync({
        id: deactivatingUser.id,
        reason: deactivateReason.trim(),
      });
      toast.success(`Deactivated ${deactivatingUser.name}.`);
      setDeactivatingUser(null);
      setDeactivateReason("");
    } catch (err: unknown) {
      const mapped = mapProblemFieldErrors(err);
      if (Object.keys(mapped).length > 0) {
        setDeactivateFieldErrors(mapped);
      }
      const status = problemStatus(err);
      const fallback =
        status === 409
          ? "Cannot deactivate this account (e.g. last active Super Admin)."
          : status === 403
            ? "You are not authorized to deactivate this user."
            : "Failed to deactivate user.";
      setDeactivateError(getGeneralErrorMessage(err, fallback));
    }
  }

  async function handleReactivateConfirm() {
    if (!reactivatingUser || reactivateMutation.isPending) return;
    setActionError(null);

    try {
      await reactivateMutation.mutateAsync(reactivatingUser.id);
      toast.success(`Reactivated ${reactivatingUser.name}.`);
      setReactivatingUser(null);
    } catch (err: unknown) {
      const msg = getGeneralErrorMessage(err, "Failed to reactivate user.");
      setActionError(msg);
      setReactivatingUser(null);
      toast.error(msg);
    }
  }

  async function handleUnlockConfirm() {
    if (!unlockingUser || unlockMutation.isPending) return;
    setActionError(null);

    try {
      await unlockMutation.mutateAsync(unlockingUser.id);
      toast.success(`Cleared login lockouts for ${unlockingUser.name}.`);
      setUnlockingUser(null);
    } catch (err: unknown) {
      const msg = getGeneralErrorMessage(err, "Failed to unlock user account.");
      setActionError(msg);
      setUnlockingUser(null);
      toast.error(msg);
    }
  }

  async function handleResetPasswordConfirm() {
    if (!resettingUser || resetPasswordMutation.isPending) return;
    setActionError(null);

    try {
      const res = await resetPasswordMutation.mutateAsync(resettingUser.id);
      setRevealedTempPassword({
        recipientName: resettingUser.name,
        payload: {
          temporary_password: res.data.temporary_password,
          expires_at: res.data.expires_at ?? null,
        },
      });
      toast.success(`Issued new temporary password for ${resettingUser.name}.`);
      setResettingUser(null);
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
    }
  }

  async function handleBulkApprove() {
    if (selectedIds.size === 0 || bulkApproveMutation.isPending) return;
    setActionError(null);
    setBulkResult(null);

    try {
      const res = await bulkApproveMutation.mutateAsync(Array.from(selectedIds));
      setBulkResult(res.data);
      setSelectedIds(new Set());
      toast.success(
        `Bulk approval complete: ${res.data.summary.approved} approved, ${res.data.summary.failed} not approved.`
      );
    } catch (err: unknown) {
      const msg = getGeneralErrorMessage(err, "Failed to bulk approve selected users.");
      setActionError(msg);
      toast.error(msg);
    }
  }

  const approvableUsers = React.useMemo(
    () => users.filter((u) => Boolean(u.abilities?.approve)),
    [users]
  );

  const allApprovableSelected =
    approvableUsers.length > 0 &&
    approvableUsers.every((u) => selectedIds.has(u.id));

  function toggleSelectAll(checked: boolean) {
    if (checked) {
      setSelectedIds(new Set(approvableUsers.map((u) => u.id)));
    } else {
      setSelectedIds(new Set());
    }
  }

  function toggleRowSelection(userId: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(userId);
      } else {
        next.delete(userId);
      }
      return next;
    });
  }

  function renderUserActions(user: UserSchema) {
    const abilities = user.abilities;
    if (!abilities) {
      return <span className="text-xs text-muted-foreground">—</span>;
    }

    const showEdit = Boolean(abilities.update);
    const showReset = Boolean(abilities.reset_password);
    const showUnlock = Boolean(abilities.unlock && user.is_locked);
    const showApprove = Boolean(abilities.approve);
    const showReject = Boolean(abilities.reject);
    const showReactivate = Boolean(abilities.reactivate);
    const showSuspend = Boolean(abilities.suspend);
    const showDeactivate = Boolean(abilities.deactivate);

    const showAppoint =
      canAppointRole && user.type === "staff" && user.status === "active";

    const hasAnyAction =
      showEdit ||
      showReset ||
      showUnlock ||
      showApprove ||
      showReject ||
      showReactivate ||
      showSuspend ||
      showDeactivate ||
      showAppoint;

    if (!hasAnyAction) {
      return <span className="text-xs text-muted-foreground">—</span>;
    }

    return (
      <div className="inline-flex items-center justify-end gap-1">
        {isPendingTab && showApprove && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setActionError(null);
              setApprovingUser(user);
            }}
          >
            <RiCheckLine className="size-4" aria-hidden="true" />
            Approve
          </Button>
        )}
        {isPendingTab && showReject && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setRejectingUser(user);
              setRejectReason("");
              setRejectFieldErrors({});
              setRejectError(null);
            }}
          >
            <RiCloseLine className="size-4" aria-hidden="true" />
            Reject
          </Button>
        )}
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
              {showApprove && (
                <DropdownMenuItem
                  onClick={() => {
                    setActionError(null);
                    setApprovingUser(user);
                  }}
                >
                  <RiCheckLine className="size-4" aria-hidden="true" />
                  Approve account
                </DropdownMenuItem>
              )}
              {showReject && (
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => {
                    setRejectingUser(user);
                    setRejectReason("");
                    setRejectFieldErrors({});
                    setRejectError(null);
                  }}
                >
                  <RiCloseLine className="size-4" aria-hidden="true" />
                  Reject account
                </DropdownMenuItem>
              )}
              {showEdit && (
                <DropdownMenuItem onClick={() => openEditDialog(user)}>
                  <RiEditLine className="size-4" aria-hidden="true" />
                  Edit details
                </DropdownMenuItem>
              )}
              {showReset && (
                <DropdownMenuItem
                  onClick={() => {
                    setActionError(null);
                    setResettingUser(user);
                  }}
                >
                  <RiKey2Line className="size-4" aria-hidden="true" />
                  Reset temporary password
                </DropdownMenuItem>
              )}
              {showAppoint && (
                <DropdownMenuItem
                  onClick={() => {
                    setActionError(null);
                    setAppointingUser(user);
                  }}
                >
                  <RiShieldUserLine className="size-4" aria-hidden="true" />
                  Appoint role
                </DropdownMenuItem>
              )}
              {showUnlock && (
                <DropdownMenuItem
                  onClick={() => {
                    setActionError(null);
                    setUnlockingUser(user);
                  }}
                >
                  <RiLockUnlockLine className="size-4" aria-hidden="true" />
                  Unlock account
                </DropdownMenuItem>
              )}
            </DropdownMenuGroup>
            {(showReactivate || showSuspend || showDeactivate) && (
              <>
                <DropdownMenuSeparator />
                {showReactivate && (
                  <DropdownMenuItem
                    onClick={() => {
                      setActionError(null);
                      setReactivatingUser(user);
                    }}
                  >
                    <RiUserFollowLine className="size-4" aria-hidden="true" />
                    Reactivate account
                  </DropdownMenuItem>
                )}
                {showSuspend && (
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
                {showDeactivate && (
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => {
                      setDeactivatingUser(user);
                      setDeactivateReason("");
                      setDeactivateFieldErrors({});
                      setDeactivateError(null);
                    }}
                  >
                    <RiUserUnfollowLine className="size-4" aria-hidden="true" />
                    Deactivate account
                  </DropdownMenuItem>
                )}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  function renderRequestedProfileInfo(user: UserSchema) {
    const profile = user.staff_profile;
    if (!profile) return null;
    const dept = profile.requested_department_id
      ? departmentById.get(profile.requested_department_id)
      : undefined;
    const deptLabel = dept
      ? `${dept.name} (${dept.code})`
      : profile.requested_department_id;

    const expiryIso = user.temporary_password_expires_at;
    const isExpired =
      typeof expiryIso === "string" && new Date(expiryIso).getTime() <= Date.now();

    if (!deptLabel && !profile?.designation && !isNotActivatedTab) return null;

    return (
      <div className="text-xs text-muted-foreground space-y-0.5">
        {profile?.designation && <div>Designation: {profile.designation}</div>}
        {deptLabel && <div>Requested dept: {deptLabel}</div>}
        {isNotActivatedTab && (
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            <StatusBadge status={isExpired ? "danger" : "warning"}>
              {isExpired ? "Expired" : "Pending activation"}
            </StatusBadge>
            <span>
              {expiryIso ? `Expires ${formatDisplayDateTime(expiryIso)}` : "No expiry set"}
            </span>
          </div>
        )}
      </div>
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
        title={title}
        description={description}
        actions={
          canImportStaff || canCreateUser ? (
            <div className="flex flex-wrap items-center gap-2">
              {canImportStaff && (
                <Link href={importHref} className={buttonVariants({ variant: "outline" })}>
                  <RiUploadCloud2Line className="size-4" aria-hidden="true" />
                  Import staff
                </Link>
              )}
              {canCreateUser && (
                <Button type="button" onClick={openCreateDialog}>
                  <RiUserAddLine className="size-4" aria-hidden="true" />
                  Create User
                </Button>
              )}
            </div>
          ) : undefined
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

      {bulkResult && (
        <Alert>
          <RiCheckDoubleLine className="size-4" aria-hidden="true" />
          <AlertTitle>
            Bulk Approval Summary: {bulkResult.summary.approved} approved,{" "}
            {bulkResult.summary.failed} not approved
          </AlertTitle>
          <AlertDescription>
            <ul className="mt-2 space-y-1 text-xs">
              {bulkResult.results.map((r) => (
                <li key={r.user_id} className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={bulkStatusBadge(r.status)}>{r.status}</StatusBadge>
                  <span className="font-mono">{r.user_id}</span>
                  {r.message && <span className="text-muted-foreground">{r.message}</span>}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {(showPendingTab || showNotActivatedTab) && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs
            value={directoryTab}
            onValueChange={(val) => {
              setPage(1);
              setSelectedIds(new Set());
              setBulkResult(null);
              if (val === "pending") {
                setDirectoryTab("pending");
                setStatusFilter("pending");
              } else if (val === "not_activated") {
                setDirectoryTab("not_activated");
                setStatusFilter("all");
              } else {
                setDirectoryTab("all");
                setStatusFilter("all");
                setExpiredTempOnly(false);
              }
            }}
          >
            <TabsList>
              <TabsTrigger value="all">All Users</TabsTrigger>
              {showPendingTab && (
                <TabsTrigger value="pending">Pending Approval</TabsTrigger>
              )}
              {showNotActivatedTab && (
                <TabsTrigger value="not_activated">Not Activated</TabsTrigger>
              )}
            </TabsList>
          </Tabs>

          {isNotActivatedTab && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="users-expired-temp-only"
                checked={expiredTempOnly}
                onCheckedChange={(checked) => {
                  setPage(1);
                  setExpiredTempOnly(checked === true);
                }}
              />
              <Label htmlFor="users-expired-temp-only" className="text-sm font-normal">
                Expired temporary password only
              </Label>
            </div>
          )}
        </div>
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
                  setSelectedIds(new Set());
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

      {isPendingTab && selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3">
          <span className="text-sm font-medium">
            {selectedIds.size} pending account(s) selected
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSelectedIds(new Set())}
              disabled={bulkApproveMutation.isPending}
            >
              Clear selection
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => void handleBulkApprove()}
              disabled={bulkApproveMutation.isPending}
            >
              <RiCheckDoubleLine className="size-4" aria-hidden="true" />
              {bulkApproveMutation.isPending
                ? "Approving..."
                : `Approve selected (${selectedIds.size})`}
            </Button>
          </div>
        </div>
      )}

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
              onClick={() => void refetch()}
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
                        {isPendingTab && (
                          <TableHead className="w-10">
                            <Checkbox
                              aria-label="Select all pending users"
                              checked={allApprovableSelected}
                              disabled={approvableUsers.length === 0}
                              onCheckedChange={(checked) => toggleSelectAll(checked === true)}
                            />
                          </TableHead>
                        )}
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
                            {isPendingTab && (
                              <TableCell>
                                {user.abilities?.approve ? (
                                  <Checkbox
                                    aria-label={`Select ${user.name}`}
                                    checked={selectedIds.has(user.id)}
                                    onCheckedChange={(checked) =>
                                      toggleRowSelection(user.id, checked === true)
                                    }
                                  />
                                ) : null}
                              </TableCell>
                            )}
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
                              {renderRequestedProfileInfo(user)}
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
                              <StatusBadge status={badge.semantic} className={badge.className}>
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
                          <div className="flex items-start gap-2 min-w-0">
                            {isPendingTab && user.abilities?.approve && (
                              <Checkbox
                                className="mt-0.5"
                                aria-label={`Select ${user.name}`}
                                checked={selectedIds.has(user.id)}
                                onCheckedChange={(checked) =>
                                  toggleRowSelection(user.id, checked === true)
                                }
                              />
                            )}
                            <div className="min-w-0 space-y-1">
                              <p className="text-sm font-semibold text-foreground truncate">
                                {user.name}
                              </p>
                              <div className="flex flex-wrap items-center gap-1.5">
                                <Badge variant="secondary" className="capitalize text-[11px]">
                                  {user.type}
                                </Badge>
                                <StatusBadge status={badge.semantic} className={badge.className}>
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
                          </div>
                          {renderUserActions(user)}
                        </div>

                        {renderRequestedProfileInfo(user)}

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

      {/* Create User Dialog (no role assignment fields) */}
      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          if (!open && !createMutation.isPending) setCreateOpen(false);
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
                  disabled={createMutation.isPending}
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
                  disabled={createMutation.isPending}
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
                  disabled={createMutation.isPending}
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
                  disabled={createMutation.isPending}
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
                  disabled={createMutation.isPending}
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
                disabled={createMutation.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? (
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
          if (!open && !updateMutation.isPending) setEditingUser(null);
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
                  disabled={updateMutation.isPending}
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
                  disabled={updateMutation.isPending}
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
                  disabled={updateMutation.isPending}
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
                  disabled={updateMutation.isPending}
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
                disabled={updateMutation.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? (
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
          if (!open && !suspendMutation.isPending) setSuspendingUser(null);
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
                disabled={suspendMutation.isPending}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setSuspendingUser(null)}
                disabled={suspendMutation.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" variant="destructive" disabled={suspendMutation.isPending}>
                {suspendMutation.isPending ? "Suspending..." : "Suspend Account"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Reject User Dialog */}
      <Dialog
        open={rejectingUser !== null}
        onOpenChange={(open) => {
          if (!open && !rejectMutation.isPending) setRejectingUser(null);
        }}
      >
        <DialogContent>
          <form onSubmit={handleRejectSubmit} noValidate className="space-y-4">
            <DialogHeader>
              <DialogTitle>Reject Registration</DialogTitle>
              <DialogDescription>
                Reject the pending account for {rejectingUser?.name}. Rejected accounts cannot
                be reactivated.
              </DialogDescription>
            </DialogHeader>

            {rejectError && (
              <Alert variant="destructive">
                <RiAlertLine className="size-4" aria-hidden="true" />
                <AlertDescription>{rejectError}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="reject-reason">Reason</Label>
              <Textarea
                id="reject-reason"
                value={rejectReason}
                onChange={(e) => {
                  setRejectReason(e.target.value);
                  setRejectFieldErrors((prev) => ({ ...prev, reason: "" }));
                }}
                placeholder="Provide a reason (5-500 characters)"
                disabled={rejectMutation.isPending}
                aria-invalid={Boolean(rejectFieldErrors.reason)}
                aria-describedby={rejectFieldErrors.reason ? "reject-reason-error" : undefined}
              />
              {rejectFieldErrors.reason && (
                <p id="reject-reason-error" className="text-xs text-destructive">
                  {rejectFieldErrors.reason}
                </p>
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setRejectingUser(null)}
                disabled={rejectMutation.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" variant="destructive" disabled={rejectMutation.isPending}>
                {rejectMutation.isPending ? "Rejecting..." : "Reject Account"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Deactivate User Dialog */}
      <Dialog
        open={deactivatingUser !== null}
        onOpenChange={(open) => {
          if (!open && !deactivateMutation.isPending) setDeactivatingUser(null);
        }}
      >
        <DialogContent>
          <form onSubmit={handleDeactivateSubmit} noValidate className="space-y-4">
            <DialogHeader>
              <DialogTitle>Deactivate User Account</DialogTitle>
              <DialogDescription>
                Deactivating {deactivatingUser?.name} immediately revokes sign-in access and
                ends all active role assignments. If this user is a sitting HOD or
                coordinator, that department or role will become vacant.
              </DialogDescription>
            </DialogHeader>

            {deactivateError && (
              <Alert variant="destructive">
                <RiAlertLine className="size-4" aria-hidden="true" />
                <AlertDescription>{deactivateError}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="deactivate-reason">Reason</Label>
              <Textarea
                id="deactivate-reason"
                value={deactivateReason}
                onChange={(e) => {
                  setDeactivateReason(e.target.value);
                  setDeactivateFieldErrors((prev) => ({ ...prev, reason: "" }));
                }}
                placeholder="Provide a reason (5-500 characters)"
                disabled={deactivateMutation.isPending}
                aria-invalid={Boolean(deactivateFieldErrors.reason)}
                aria-describedby={
                  deactivateFieldErrors.reason ? "deactivate-reason-error" : undefined
                }
              />
              {deactivateFieldErrors.reason && (
                <p id="deactivate-reason-error" className="text-xs text-destructive">
                  {deactivateFieldErrors.reason}
                </p>
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDeactivatingUser(null)}
                disabled={deactivateMutation.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" variant="destructive" disabled={deactivateMutation.isPending}>
                {deactivateMutation.isPending ? "Deactivating..." : "Deactivate Account"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Approve User AlertDialog */}
      <AlertDialog
        open={approvingUser !== null}
        onOpenChange={(open) => {
          if (!open && !actionSubmitting) setApprovingUser(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve User Account</AlertDialogTitle>
            <AlertDialogDescription>
              Approve {approvingUser?.name} and activate their institutional sign-in access?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionSubmitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={actionSubmitting}
              onClick={() => void handleApproveConfirm()}
            >
              {approveMutation.isPending ? "Approving..." : "Approve"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
              {resetPasswordMutation.isPending ? "Resetting..." : "Reset Password"}
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
              {reactivatingUser?.status === "deactivated"
                ? `Restoring ${reactivatingUser.name} re-enables sign-in only. Previously ended role assignments remain ended and must be reassigned separately.`
                : `Restore active sign-in access for ${reactivatingUser?.name}?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionSubmitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={actionSubmitting}
              onClick={() => void handleReactivateConfirm()}
            >
              {reactivateMutation.isPending ? "Reactivating..." : "Reactivate"}
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
              {unlockMutation.isPending ? "Unlocking..." : "Unlock Account"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <LeadershipAppointDialog
        user={appointingUser}
        onOpenChange={(open) => {
          if (!open) setAppointingUser(null);
        }}
      />
    </div>
  );
}

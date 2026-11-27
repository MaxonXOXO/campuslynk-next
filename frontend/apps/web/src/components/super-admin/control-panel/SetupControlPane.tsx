"use client";

import * as React from "react";
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
  Switch,
} from "@academic-suite/ui";
import {
  RiAlertLine,
  RiCheckLine,
  RiLoader4Line,
  RiLockLine,
  RiLockUnlockLine,
} from "@remixicon/react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/auth/session-provider";
import {
  STALE_TIME_LIST_MS,
  scopedQueryKey,
  useApiQuery,
  useQueryScope,
} from "@/lib/query/api-query";
import { problemStatus } from "@/lib/auth/problem";
import {
  AuditedReasonDialog,
  type AuditedReasonOption,
} from "@/components/common/AuditedReasonDialog";
import {
  VALID_WEEKDAYS,
  type Weekday,
} from "@/app/setup/logic/validation";

export type LockableSetupSection =
  | "institution_profile"
  | "calendar_basics"
  | "signup_policy";

const LOCKABLE_SECTION_OPTIONS: readonly AuditedReasonOption[] = [
  {
    id: "institution_profile",
    label: "Institution Profile",
    description: "Name, short code, contact email, and website.",
  },
  {
    id: "calendar_basics",
    label: "Calendar Basics",
    description: "Working days, periods per day, and day-order format.",
  },
  {
    id: "signup_policy",
    label: "Registration Policy",
    description: "Student and parent self-registration and approval mode.",
  },
] as const;

const SECTION_LABELS: Record<LockableSetupSection, string> = {
  institution_profile: "Institution Profile",
  calendar_basics: "Calendar Basics",
  signup_policy: "Registration Policy",
};

function readString(obj: Record<string, unknown> | undefined, key: string): string {
  const value = obj?.[key];
  return typeof value === "string" ? value : "";
}

function readBoolean(obj: Record<string, unknown> | undefined, key: string): boolean {
  return obj?.[key] === true;
}

export function SetupControlPane() {
  const client = useApiClient();
  const scope = useQueryScope();
  const queryClient = useQueryClient();

  const statusQueryKey = React.useMemo(
    () => scopedQueryKey(scope, "organisation", "setup", "status"),
    [scope]
  );

  const setupStatusQuery = useApiQuery({
    queryKey: statusQueryKey,
    queryFn: () => client.organisation.setup.status(),
    staleTime: STALE_TIME_LIST_MS,
  });

  const streamsQuery = useApiQuery({
    queryKey: scopedQueryKey(scope, "organisation", "streams", "list"),
    queryFn: () => client.organisation.streams.list(),
    staleTime: STALE_TIME_LIST_MS,
  });

  const departmentsQuery = useApiQuery({
    queryKey: scopedQueryKey(scope, "organisation", "departments", "list"),
    queryFn: () => client.organisation.departments.list(),
    staleTime: STALE_TIME_LIST_MS,
  });

  const academicYearsQuery = useApiQuery({
    queryKey: scopedQueryKey(scope, "organisation", "academic-years", "list"),
    queryFn: () => client.organisation.academicYears.list(),
    staleTime: STALE_TIME_LIST_MS,
  });

  const setupData = setupStatusQuery.data?.data;
  const isCompleted = setupData?.is_completed === true;
  const unlockedSections = React.useMemo<LockableSetupSection[]>(() => {
    const raw: unknown = setupData?.unlocked_sections;
    const keys: unknown[] = Array.isArray(raw)
      ? raw
      : raw && typeof raw === "object"
        ? Object.keys(raw)
        : [];
    return keys.filter(
      (item): item is LockableSetupSection =>
        item === "institution_profile" ||
        item === "calendar_basics" ||
        item === "signup_policy"
    );
  }, [setupData?.unlocked_sections]);

  const isSectionEditable = React.useCallback(
    (section: LockableSetupSection) =>
      !isCompleted || unlockedSections.includes(section),
    [isCompleted, unlockedSections]
  );

  const [unlockOpen, setUnlockOpen] = React.useState(false);
  const [locking, setLocking] = React.useState(false);

  // Institution Profile state
  const profileStep = setupData?.steps?.institution_profile as
    | Record<string, unknown>
    | undefined;
  const [profileName, setProfileName] = React.useState("");
  const [profileShortCode, setProfileShortCode] = React.useState("");
  const [profileEmail, setProfileEmail] = React.useState("");
  const [profileWebsite, setProfileWebsite] = React.useState("");
  const [savingProfile, setSavingProfile] = React.useState(false);
  const [profileError, setProfileError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setProfileName(readString(profileStep, "name"));
    setProfileShortCode(readString(profileStep, "short_code"));
    setProfileEmail(readString(profileStep, "contact_email"));
    setProfileWebsite(readString(profileStep, "website"));
  }, [profileStep]);

  // Calendar Basics state
  const calendarStep = setupData?.steps?.calendar_basics as
    | Record<string, unknown>
    | undefined;
  const [workingDays, setWorkingDays] = React.useState<Weekday[]>([
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
  ]);
  const [dayOrderFormat, setDayOrderFormat] = React.useState<
    "roman" | "numeric" | "alpha"
  >("numeric");
  const [savingCalendar, setSavingCalendar] = React.useState(false);
  const [calendarError, setCalendarError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const rawDays = calendarStep?.working_days;
    if (Array.isArray(rawDays) && rawDays.length > 0) {
      const valid = rawDays.filter((d): d is Weekday =>
        typeof d === "string" && (VALID_WEEKDAYS as readonly string[]).includes(d)
      );
      if (valid.length > 0) {
        setWorkingDays(valid);
      }
    }
    const rawFormat = calendarStep?.day_order_format;
    if (rawFormat === "roman" || rawFormat === "numeric" || rawFormat === "alpha") {
      setDayOrderFormat(rawFormat);
    }
  }, [calendarStep]);

  // Registration Policy state
  const signupStep = setupData?.steps?.signup_policy as
    | Record<string, unknown>
    | undefined;
  const [studentSelfReg, setStudentSelfReg] = React.useState(false);
  const [parentSelfReg, setParentSelfReg] = React.useState(false);
  const [approvalMode, setApprovalMode] = React.useState<"manual" | "auto">(
    "manual"
  );
  const [savingSignup, setSavingSignup] = React.useState(false);
  const [signupError, setSignupError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setStudentSelfReg(readBoolean(signupStep, "student_self_registration_enabled"));
    setParentSelfReg(readBoolean(signupStep, "parent_self_registration_enabled"));
    const mode = signupStep?.approval_mode;
    if (mode === "manual" || mode === "auto") {
      setApprovalMode(mode);
    }
  }, [signupStep]);

  async function refreshSetupStatus() {
    await queryClient.invalidateQueries({ queryKey: statusQueryKey });
    await setupStatusQuery.refetch();
  }

  async function handleUnlock({
    reason,
    selectedOptions,
  }: {
    reason: string;
    selectedOptions: string[];
  }) {
    const sections = selectedOptions.filter(
      (item): item is LockableSetupSection =>
        item === "institution_profile" ||
        item === "calendar_basics" ||
        item === "signup_policy"
    );
    await client.organisation.setup.unlock({ sections, reason });
    toast.success("Selected setup sections unlocked for editing.");
    setUnlockOpen(false);
    await refreshSetupStatus();
  }

  async function handleLockNow() {
    setLocking(true);
    try {
      await client.organisation.setup.lock({});
      toast.success("All setup sections locked.");
      await refreshSetupStatus();
    } catch {
      toast.error("Could not lock setup sections.");
    } finally {
      setLocking(false);
    }
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    setProfileError(null);
    try {
      await client.organisation.setup.saveStep("institution_profile", {
        name: profileName.trim(),
        short_code: profileShortCode.trim(),
        contact_email: profileEmail.trim() || null,
        website: profileWebsite.trim() || null,
      });
      toast.success("Institution Profile saved.");
      await refreshSetupStatus();
    } catch (err: unknown) {
      if (problemStatus(err) === 423) {
        setProfileError(
          "Institution Profile is locked. Unlock it with an audited reason before saving."
        );
      } else {
        setProfileError("Could not save Institution Profile.");
      }
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleSaveCalendar(e: React.FormEvent) {
    e.preventDefault();
    setSavingCalendar(true);
    setCalendarError(null);
    try {
      const existingPeriods = Array.isArray(calendarStep?.periods)
        ? calendarStep.periods
        : [
            { index: 1, start: "09:00", end: "10:00" },
            { index: 2, start: "10:00", end: "11:00" },
          ];
      const periodsPerDay =
        typeof calendarStep?.periods_per_day === "number"
          ? calendarStep.periods_per_day
          : existingPeriods.length;

      await client.organisation.setup.saveStep("calendar_basics", {
        working_days: workingDays,
        periods_per_day: periodsPerDay,
        periods: existingPeriods,
        day_order_format: dayOrderFormat,
      });
      toast.success("Calendar Basics saved.");
      await refreshSetupStatus();
    } catch (err: unknown) {
      if (problemStatus(err) === 423) {
        setCalendarError(
          "Calendar Basics is locked. Unlock it with an audited reason before saving."
        );
      } else {
        setCalendarError("Could not save Calendar Basics.");
      }
    } finally {
      setSavingCalendar(false);
    }
  }

  async function handleSaveSignupPolicy(e: React.FormEvent) {
    e.preventDefault();
    setSavingSignup(true);
    setSignupError(null);
    try {
      await client.organisation.setup.saveStep("signup_policy", {
        student_self_registration_enabled: studentSelfReg,
        parent_self_registration_enabled: parentSelfReg,
        approval_mode: approvalMode,
      });
      toast.success("Registration Policy saved.");
      await refreshSetupStatus();
    } catch (err: unknown) {
      if (problemStatus(err) === 423) {
        setSignupError(
          "Registration Policy is locked. Unlock it with an audited reason before saving."
        );
      } else {
        setSignupError("Could not save Registration Policy.");
      }
    } finally {
      setSavingSignup(false);
    }
  }

  if (setupStatusQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  if (setupStatusQuery.isError) {
    return (
      <Alert variant="destructive">
        <RiAlertLine className="size-4" aria-hidden="true" />
        <AlertTitle>Unable to load setup configuration</AlertTitle>
        <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
          <span>Could not retrieve setup lock state and baseline settings.</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void setupStatusQuery.refetch()}
          >
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  const profileEditable = isSectionEditable("institution_profile");
  const calendarEditable = isSectionEditable("calendar_basics");
  const signupEditable = isSectionEditable("signup_policy");

  const streamsData = (streamsQuery.data as { data?: unknown[] } | undefined)?.data;
  const departmentsData = (departmentsQuery.data as { data?: unknown[] } | undefined)?.data;
  const academicYearsData = (academicYearsQuery.data as { data?: unknown[] } | undefined)?.data;
  const streamsCount = Array.isArray(streamsData) ? streamsData.length : 0;
  const departmentsCount = Array.isArray(departmentsData) ? departmentsData.length : 0;
  const academicYearsCount = Array.isArray(academicYearsData) ? academicYearsData.length : 0;

  return (
    <div className="space-y-6">
      {/* Header action bar for post-completion lock management */}
      {isCompleted && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-foreground">
              Setup Lock Governance
            </h2>
            <p className="text-xs text-muted-foreground">
              Completed setup sections are locked by default. Unlock specific sections with an audited reason to make updates.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => setUnlockOpen(true)}
          >
            <RiLockUnlockLine className="size-4" aria-hidden="true" />
            Unlock sections
          </Button>
        </div>
      )}

      {/* Persistent banner when any section is unlocked */}
      {isCompleted && unlockedSections.length > 0 && (
        <Alert role="status" aria-live="polite">
          <RiLockUnlockLine className="size-4" aria-hidden="true" />
          <AlertTitle>Unlocked for editing</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>
              Currently unlocked:{" "}
              {unlockedSections.map((s) => SECTION_LABELS[s]).join(", ")}. Saving a
              section locks it again automatically.
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void handleLockNow()}
              disabled={locking}
            >
              {locking ? (
                <RiLoader4Line className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <RiLockLine className="size-4" aria-hidden="true" />
              )}
              Lock now
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Institution Profile */}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">Institution Profile</CardTitle>
            <CardDescription>
              Core institutional identity, contact email, and website.
            </CardDescription>
          </div>
          {isCompleted && (
            <StatusBadge status={profileEditable ? "warning" : "neutral"}>
              {profileEditable ? "Unlocked" : "Locked"}
            </StatusBadge>
          )}
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void handleSaveProfile(e)} className="space-y-4">
            {profileError && (
              <Alert variant="destructive">
                <RiAlertLine className="size-4" aria-hidden="true" />
                <AlertDescription>{profileError}</AlertDescription>
              </Alert>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cp-inst-name">Institution Name</Label>
                <Input
                  id="cp-inst-name"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  disabled={!profileEditable || savingProfile}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cp-inst-code">Short Code</Label>
                <Input
                  id="cp-inst-code"
                  value={profileShortCode}
                  onChange={(e) => setProfileShortCode(e.target.value)}
                  disabled={!profileEditable || savingProfile}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cp-inst-email">Contact Email</Label>
                <Input
                  id="cp-inst-email"
                  type="email"
                  value={profileEmail}
                  onChange={(e) => setProfileEmail(e.target.value)}
                  disabled={!profileEditable || savingProfile}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cp-inst-website">Website</Label>
                <Input
                  id="cp-inst-website"
                  value={profileWebsite}
                  onChange={(e) => setProfileWebsite(e.target.value)}
                  disabled={!profileEditable || savingProfile}
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={!profileEditable || savingProfile}
              >
                {savingProfile && (
                  <RiLoader4Line className="size-4 animate-spin" aria-hidden="true" />
                )}
                Save Institution Profile
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Calendar Basics */}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">Calendar Basics</CardTitle>
            <CardDescription>
              Working days and day-order naming format used across timetables.
            </CardDescription>
          </div>
          {isCompleted && (
            <StatusBadge status={calendarEditable ? "warning" : "neutral"}>
              {calendarEditable ? "Unlocked" : "Locked"}
            </StatusBadge>
          )}
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void handleSaveCalendar(e)} className="space-y-4">
            {calendarError && (
              <Alert variant="destructive">
                <RiAlertLine className="size-4" aria-hidden="true" />
                <AlertDescription>{calendarError}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label>Working Days</Label>
              <div className="flex flex-wrap gap-2">
                {VALID_WEEKDAYS.map((day) => {
                  const active = workingDays.includes(day);
                  return (
                    <Button
                      key={day}
                      type="button"
                      size="sm"
                      variant={active ? "default" : "outline"}
                      disabled={!calendarEditable || savingCalendar}
                      aria-pressed={active}
                      onClick={() =>
                        setWorkingDays((prev) =>
                          prev.includes(day)
                            ? prev.filter((d) => d !== day)
                            : [...prev, day]
                        )
                      }
                    >
                      {active && <RiCheckLine className="size-3.5" aria-hidden="true" />}
                      {day.slice(0, 3).toUpperCase()}
                    </Button>
                  );
                })}
              </div>
            </div>
            <div className="max-w-xs space-y-1.5">
              <Label htmlFor="cp-day-order-format">Day Order Format</Label>
              <Select
                value={dayOrderFormat}
                onValueChange={(value) => {
                  if (value === "roman" || value === "numeric" || value === "alpha") {
                    setDayOrderFormat(value);
                  }
                }}
                disabled={!calendarEditable || savingCalendar}
              >
                <SelectTrigger id="cp-day-order-format">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="numeric">Numeric (Day 1, Day 2)</SelectItem>
                  <SelectItem value="roman">Roman (Day I, Day II)</SelectItem>
                  <SelectItem value="alpha">Alphabetic (Day A, Day B)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={!calendarEditable || savingCalendar || workingDays.length === 0}
              >
                {savingCalendar && (
                  <RiLoader4Line className="size-4 animate-spin" aria-hidden="true" />
                )}
                Save Calendar Basics
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Organisation Basics — strictly read-only */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Organisation Basics</CardTitle>
          <CardDescription>
            Read-only structural summary. The Principal manages departments and academic years.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {streamsQuery.isLoading ||
          departmentsQuery.isLoading ||
          academicYearsQuery.isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-border p-3">
                <div className="text-xs text-muted-foreground">Streams</div>
                <div className="mt-1 text-xl font-semibold text-foreground">
                  {streamsCount}
                </div>
              </div>
              <div className="rounded-lg border border-border p-3">
                <div className="text-xs text-muted-foreground">Departments</div>
                <div className="mt-1 text-xl font-semibold text-foreground">
                  {departmentsCount}
                </div>
              </div>
              <div className="rounded-lg border border-border p-3">
                <div className="text-xs text-muted-foreground">Academic Years</div>
                <div className="mt-1 text-xl font-semibold text-foreground">
                  {academicYearsCount}
                </div>
              </div>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            The Principal manages departments and academic years.
          </p>
        </CardContent>
      </Card>

      {/* Registration Policy */}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">Registration Policy</CardTitle>
            <CardDescription>
              Student and parent self-registration and onboarding approval workflow.
            </CardDescription>
          </div>
          {isCompleted && (
            <StatusBadge status={signupEditable ? "warning" : "neutral"}>
              {signupEditable ? "Unlocked" : "Locked"}
            </StatusBadge>
          )}
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void handleSaveSignupPolicy(e)} className="space-y-4">
            {signupError && (
              <Alert variant="destructive">
                <RiAlertLine className="size-4" aria-hidden="true" />
                <AlertDescription>{signupError}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
                <div>
                  <Label htmlFor="cp-student-self-reg">
                    Student self-registration
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Allow students to submit self-registration requests.
                  </p>
                </div>
                <Switch
                  id="cp-student-self-reg"
                  checked={studentSelfReg}
                  onCheckedChange={setStudentSelfReg}
                  disabled={!signupEditable || savingSignup}
                />
              </div>

              <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
                <div>
                  <Label htmlFor="cp-parent-self-reg">
                    Parent self-registration
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Allow parents or guardians to submit self-registration requests.
                  </p>
                </div>
                <Switch
                  id="cp-parent-self-reg"
                  checked={parentSelfReg}
                  onCheckedChange={setParentSelfReg}
                  disabled={!signupEditable || savingSignup}
                />
              </div>

              <div className="max-w-xs space-y-1.5">
                <Label htmlFor="cp-approval-mode">Approval Mode</Label>
                <Select
                  value={approvalMode}
                  onValueChange={(value) => {
                    if (value === "manual" || value === "auto") {
                      setApprovalMode(value);
                    }
                  }}
                  disabled={!signupEditable || savingSignup}
                >
                  <SelectTrigger id="cp-approval-mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual review</SelectItem>
                    <SelectItem value="auto">Automatic approval</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={!signupEditable || savingSignup}>
                {savingSignup && (
                  <RiLoader4Line className="size-4 animate-spin" aria-hidden="true" />
                )}
                Save Registration Policy
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <AuditedReasonDialog
        open={unlockOpen}
        onOpenChange={setUnlockOpen}
        title="Unlock setup sections"
        description="Select the completed setup sections you need to update and record an audit reason."
        notice="Saving an unlocked section locks it again automatically."
        options={[...LOCKABLE_SECTION_OPTIONS]}
        optionsLabel="Sections to unlock"
        requireAtLeastOneOption
        reasonLabel="Unlock reason"
        reasonPlaceholder="e.g. Correcting official contact email after domain migration"
        confirmLabel="Unlock selected"
        onConfirm={handleUnlock}
      />
    </div>
  );
}

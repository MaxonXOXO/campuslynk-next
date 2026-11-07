"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Skeleton,
  Button,
  Alert,
  AlertDescription,
  Badge,
} from "@academic-suite/ui";
import { toast } from "sonner";
import {
  RiRefreshLine,
  RiAlertLine,
  RiShieldKeyholeLine,
  RiCheckboxCircleFill,
  RiInformationLine,
  RiNodeTree,
} from "@remixicon/react";
import { AuthGuard } from "@/lib/auth/auth-guard";
import { useApiClient } from "@/lib/auth/session-provider";

import {
  WIZARD_STEPS,
  deriveCurrentStep,
  deriveStepStates,
  isValidStepId,
  type StepId,
  type SetupStatusData,
} from "./logic/step-derivation";
import {
  isImpersonationError,
  isWrongRoleForbiddenError,
  isSetupAlreadyCompletedError,
} from "./logic/role-routing";
import {
  mapProblemFieldErrors,
  extractMissingPrerequisites,
  getGeneralErrorMessage,
} from "./logic/error-mapping";

import { Stepper } from "./components/Stepper";
import {
  InstitutionProfileStep,
} from "./components/InstitutionProfileStep";
import type { InstitutionProfileFormValues } from "./logic/validation";
import {
  OrganisationBasicsStep,
  type StreamItem,
  type DepartmentItem,
  type AcademicYearItem,
} from "./components/OrganisationBasicsStep";
import {
  CalendarStep,
  type CalendarFormValues,
} from "./components/CalendarStep";
import {
  SignupPolicyStep,
} from "./components/SignupPolicyStep";
import type { SignupPolicyFormValues } from "./logic/validation";
import { ReviewFinishStep } from "./components/ReviewFinishStep";
import { CompletedSummary } from "./components/CompletedSummary";
import { ImpersonationState } from "./components/ImpersonationState";
import { ForbiddenState } from "./components/ForbiddenState";
import { DirtyStepWarningDialog } from "./components/DirtyStepWarningDialog";

function SetupWizardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedStepParam = searchParams.get("step");

  // API Client instance
  const client = useApiClient();

  // Wizard Lifecycle & Data State
  const [status, setStatus] = React.useState<SetupStatusData | null>(null);
  const [currentStep, setCurrentStep] = React.useState<StepId>("institution_profile");
  const [viewingSummary, setViewingSummary] = React.useState(false);

  // Structural Prerequisite Collections
  const [streams, setStreams] = React.useState<StreamItem[]>([]);
  const [departments, setDepartments] = React.useState<DepartmentItem[]>([]);
  const [academicYears, setAcademicYears] = React.useState<AcademicYearItem[]>([]);

  // Cached Step Values for Review Summary
  const [profileValues, setProfileValues] = React.useState<Partial<InstitutionProfileFormValues>>({});
  const [calendarValues, setCalendarValues] = React.useState<Partial<CalendarFormValues>>({});
  const [signupValues, setSignupValues] = React.useState<Partial<SignupPolicyFormValues>>({});

  // Loading & Saving States
  const [isLoadingStatus, setIsLoadingStatus] = React.useState(true);
  const [isSavingStep, setIsSavingStep] = React.useState(false);
  const [isFinishing, setIsFinishing] = React.useState(false);

  // Security & Error States
  const [securityBlock, setSecurityBlock] = React.useState<"impersonation" | "forbidden" | null>(null);
  const [generalError, setGeneralError] = React.useState<string | null>(null);
  const [stepServerErrors, setStepServerErrors] = React.useState<Record<string, string>>({});
  const [missingPrerequisites, setMissingPrerequisites] = React.useState<string[]>([]);

  // Dirty State & Navigation Guard
  const [isDirty, setIsDirty] = React.useState(false);
  const [pendingStepNavigation, setPendingStepNavigation] = React.useState<StepId | null>(null);
  const [dirtyWarningOpen, setDirtyWarningOpen] = React.useState(false);

  const initialRequestedStepRef = React.useRef<string | null>(requestedStepParam);

  // Fetch status and prerequisite entities
  const loadSetupStatus = React.useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = options?.silent === true;
      if (!silent) {
        setIsLoadingStatus(true);
        setGeneralError(null);
        setSecurityBlock(null);
      }

      try {
        const res = await client.setup.status();
        const statusData = res.data as SetupStatusData;
        setStatus(statusData);

        if (statusData.steps?.institution_profile?.values) {
          setProfileValues(
            statusData.steps.institution_profile.values as Partial<InstitutionProfileFormValues>
          );
        }
        if (statusData.steps?.calendar_basics?.values) {
          setCalendarValues(
            statusData.steps.calendar_basics.values as Partial<CalendarFormValues>
          );
        }
        if (statusData.steps?.signup_policy?.values) {
          setSignupValues(
            statusData.steps.signup_policy.values as Partial<SignupPolicyFormValues>
          );
        }

        // Fetch structural collections
        try {
          const [streamsRes, deptsRes, yearsRes] = await Promise.all([
            client.organisation.streams.list(),
            client.organisation.departments.list(),
            client.organisation.academicYears.list(),
          ]);
          setStreams(((streamsRes as { data?: unknown })?.data as StreamItem[]) || []);
          setDepartments(((deptsRes as { data?: unknown })?.data as DepartmentItem[]) || []);
          setAcademicYears(((yearsRes as { data?: unknown })?.data as AcademicYearItem[]) || []);
        } catch {
          // Fall back gracefully if individual entity lists fail
        }

        if (!silent) {
          const initialStep = initialRequestedStepRef.current;
          // If already completed and user didn't request an explicit step, show summary
          if (statusData.completed_at && !initialStep) {
            setViewingSummary(true);
          } else {
            const derived = deriveCurrentStep(statusData, initialStep);
            setCurrentStep(derived);
          }
        }
      } catch (err: unknown) {
        if (!silent) {
          if (isImpersonationError(err)) {
            setSecurityBlock("impersonation");
          } else if (isWrongRoleForbiddenError(err)) {
            setSecurityBlock("forbidden");
          } else {
            setGeneralError(getGeneralErrorMessage(err, "Failed to load institutional setup status."));
          }
        }
      } finally {
        if (!silent) {
          setIsLoadingStatus(false);
        }
      }
    },
    [client]
  );

  const refreshSetupStatusSilently = React.useCallback(async () => {
    await loadSetupStatus({ silent: true });
  }, [loadSetupStatus]);

  React.useEffect(() => {
    void loadSetupStatus();
  }, [loadSetupStatus]);

  // Synchronize currentStep if URL ?step= query parameter changes (e.g. browser Back/Forward)
  React.useEffect(() => {
    if (requestedStepParam && isValidStepId(requestedStepParam)) {
      setViewingSummary(false);
      setCurrentStep(requestedStepParam);
    }
  }, [requestedStepParam]);

  // Handle URL step synchronization
  const navigateToStep = (targetStep: StepId, force = false) => {
    if (isDirty && !force) {
      setPendingStepNavigation(targetStep);
      setDirtyWarningOpen(true);
      return;
    }

    setIsDirty(false);
    setStepServerErrors({});
    setGeneralError(null);
    setViewingSummary(false);
    setCurrentStep(targetStep);

    // Sync query parameter
    const params = new URLSearchParams(window.location.search);
    params.set("step", targetStep);
    router.push(`/setup?${params.toString()}`);
  };

  const handleConfirmLeaveDirty = () => {
    setDirtyWarningOpen(false);
    if (pendingStepNavigation) {
      navigateToStep(pendingStepNavigation, true);
      setPendingStepNavigation(null);
    }
  };

  // STEP 1: SAVE INSTITUTION PROFILE
  const handleSaveProfile = async (values: InstitutionProfileFormValues): Promise<boolean> => {
    setIsSavingStep(true);
    setStepServerErrors({});
    setGeneralError(null);

    try {
      const res = await client.setup.saveStep("institution_profile", values as unknown as Record<string, unknown>);
      setStatus(res.data as SetupStatusData);
      setProfileValues(values);
      toast.success("Institution profile saved successfully.");
      setIsDirty(false);
      return true;
    } catch (err: unknown) {
      const fieldErrors = mapProblemFieldErrors(err);
      if (Object.keys(fieldErrors).length > 0) {
        setStepServerErrors(fieldErrors);
      } else {
        setGeneralError(getGeneralErrorMessage(err, "Failed to save institution profile."));
      }
      return false;
    } finally {
      setIsSavingStep(false);
    }
  };

  // STEP 2: ORGANISATION ENTITY HANDLERS
  const handleCreateStream = async (code: string, name: string): Promise<boolean> => {
    try {
      await client.organisation.streams.create({ code, name });
      toast.success(`Stream "${name}" created.`);
      return true;
    } catch (err: unknown) {
      toast.error(getGeneralErrorMessage(err, "Failed to create stream."));
      return false;
    }
  };

  const handleRenameStream = async (id: string, name: string): Promise<boolean> => {
    try {
      await client.organisation.streams.update(id, { name });
      toast.success("Stream renamed successfully.");
      return true;
    } catch (err: unknown) {
      toast.error(getGeneralErrorMessage(err, "Failed to rename stream."));
      return false;
    }
  };

  const handleDeleteStream = async (id: string): Promise<{ success: boolean; error?: string }> => {
    try {
      await client.organisation.streams.delete(id);
      toast.success("Stream deleted successfully.");
      return { success: true };
    } catch (err: unknown) {
      const msg = getGeneralErrorMessage(err, "Cannot delete stream in use.");
      toast.error(msg);
      return { success: false, error: msg };
    }
  };

  const handleCreateDepartment = async (data: {
    stream_id: string;
    code: string;
    name: string;
    kind: "academic" | "general" | "administrative";
  }): Promise<boolean> => {
    try {
      await client.organisation.departments.create(data);
      toast.success(`Department "${data.name}" created.`);
      return true;
    } catch (err: unknown) {
      toast.error(getGeneralErrorMessage(err, "Failed to create department."));
      return false;
    }
  };

  const handleDeleteDepartment = async (
    id: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      await client.organisation.departments.delete(id);
      toast.success("Department deleted successfully.");
      return { success: true };
    } catch (err: unknown) {
      const msg = getGeneralErrorMessage(err, "Cannot delete department in use.");
      toast.error(msg);
      return { success: false, error: msg };
    }
  };

  const handleCreateAcademicYear = async (data: {
    label: string;
    start_date: string;
    end_date: string;
    is_current?: boolean;
  }): Promise<boolean> => {
    try {
      await client.organisation.academicYears.create(data);
      toast.success(`Academic Year "${data.label}" created.`);
      return true;
    } catch (err: unknown) {
      toast.error(getGeneralErrorMessage(err, "Failed to create academic year."));
      return false;
    }
  };

  // STEP 3: SAVE CALENDAR
  const handleSaveCalendar = async (values: CalendarFormValues): Promise<boolean> => {
    setIsSavingStep(true);
    setStepServerErrors({});
    setGeneralError(null);

    try {
      const res = await client.setup.saveStep("calendar_basics", values as unknown as Record<string, unknown>);
      setStatus(res.data as SetupStatusData);
      setCalendarValues(values);
      toast.success("Academic calendar basics saved.");
      setIsDirty(false);
      return true;
    } catch (err: unknown) {
      const fieldErrors = mapProblemFieldErrors(err);
      if (Object.keys(fieldErrors).length > 0) {
        setStepServerErrors(fieldErrors);
      } else {
        setGeneralError(getGeneralErrorMessage(err, "Failed to save calendar basics."));
      }
      return false;
    } finally {
      setIsSavingStep(false);
    }
  };

  // STEP 4: SAVE SIGN-UP POLICY
  const handleSaveSignupPolicy = async (values: SignupPolicyFormValues): Promise<boolean> => {
    setIsSavingStep(true);
    setStepServerErrors({});
    setGeneralError(null);

    try {
      const res = await client.setup.saveStep("signup_policy", values as unknown as Record<string, unknown>);
      setStatus(res.data as SetupStatusData);
      setSignupValues(values);
      toast.success("Sign-up policy preferences saved.");
      setIsDirty(false);
      return true;
    } catch (err: unknown) {
      const fieldErrors = mapProblemFieldErrors(err);
      if (Object.keys(fieldErrors).length > 0) {
        setStepServerErrors(fieldErrors);
      } else {
        setGeneralError(getGeneralErrorMessage(err, "Failed to save sign-up policy."));
      }
      return false;
    } finally {
      setIsSavingStep(false);
    }
  };

  // STEP 5: FINISH SETUP
  const handleFinishSetup = async () => {
    setIsFinishing(true);
    setGeneralError(null);
    setMissingPrerequisites([]);

    try {
      const res = await client.setup.complete();
      const updatedStatus = res.data as SetupStatusData;
      setStatus(updatedStatus);
      toast.success("First-run setup finalized successfully!");
      setViewingSummary(true);
    } catch (err: unknown) {
      if (isSetupAlreadyCompletedError(err)) {
        // Prompt item 10: "On 409 setup-already-completed, route to the completed summary, not an error screen."
        toast.info("Setup was already finalized.");
        setViewingSummary(true);
      } else {
        const missing = extractMissingPrerequisites(err);
        if (missing.length > 0) {
          setMissingPrerequisites(missing);
        }
        setGeneralError(
          getGeneralErrorMessage(
            err,
            "Cannot finalize setup. Please ensure all steps and prerequisite counts are satisfied."
          )
        );
      }
    } finally {
      setIsFinishing(false);
    }
  };

  // Render Security Blocks if detected
  if (securityBlock === "impersonation") {
    return <ImpersonationState onBackToHome={() => router.push("/home")} />;
  }

  if (securityBlock === "forbidden") {
    return <ForbiddenState onBackToHome={() => router.push("/home")} />;
  }

  // Loading Skeleton State
  if (isLoadingStatus) {
    return (
      <main className="min-h-screen bg-background text-foreground py-6 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
          <div className="lg:col-span-4 xl:col-span-4 space-y-4">
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-80 w-full rounded-xl" />
          </div>
          <div className="lg:col-span-8 xl:col-span-8 space-y-4">
            <Skeleton className="h-14 w-full rounded-xl" />
            <Skeleton className="h-[520px] w-full rounded-xl" />
          </div>
        </div>
      </main>
    );
  }

  // General Error Screen with Retry
  if (generalError && !status) {
    return (
      <main className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-4">
        <Card className="max-w-md w-full border-destructive/30 shadow-md">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto size-12 rounded-full bg-destructive/10 flex items-center justify-center text-destructive mb-3">
              <RiAlertLine className="size-6" aria-hidden="true" />
            </div>
            <CardTitle className="text-lg font-bold">Failed to Load Setup</CardTitle>
            <CardDescription className="text-xs text-muted-foreground mt-1">
              Could not resolve first-run setup state from the backend.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Alert variant="destructive" className="text-left text-xs">
              <AlertDescription>{generalError}</AlertDescription>
            </Alert>
          </CardContent>
          <div className="p-4 pt-0 flex justify-center">
            <Button type="button" onClick={() => void loadSetupStatus()}>
              <RiRefreshLine className="size-4 mr-1.5" aria-hidden="true" /> Retry Connection
            </Button>
          </div>
        </Card>
      </main>
    );
  }

  const stepStates = deriveStepStates(status, currentStep);
  const activeStepMeta =
    WIZARD_STEPS.find((s) => s.id === currentStep) ?? WIZARD_STEPS[0]!;

  // Calculate overall completed count for sidebar progress bar
  const isOrgReady =
    (status?.prerequisites?.streams_count ?? 0) >= 1 &&
    (status?.prerequisites?.departments_count ?? 0) >= 1 &&
    (status?.prerequisites?.academic_years_count ?? 0) >= 1;

  const completedStepsCount = [
    Boolean(status?.steps?.institution_profile?.is_completed),
    isOrgReady,
    Boolean(status?.steps?.calendar_basics?.is_completed),
    Boolean(status?.steps?.signup_policy?.is_completed),
    Boolean(status?.is_completed),
  ].filter(Boolean).length;

  const progressPercentage = Math.round((completedStepsCount / WIZARD_STEPS.length) * 100);

  return (
    <main className="min-h-screen bg-muted/20 text-foreground py-6 px-4 sm:px-6 lg:py-8 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
          {/* LEFT GUIDED SIDEBAR RAIL */}
          <aside
            aria-label="Setup Wizard Navigation Sidebar"
            className="lg:col-span-4 xl:col-span-4 lg:sticky lg:top-6 space-y-4"
          >
            <Card className="border-border shadow-xs overflow-hidden">
              {/* Brand / Wizard Identity Header */}
              <div className="p-5 border-b border-border bg-card">
                <div className="flex items-start gap-3">
                  <div className="size-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                    <RiShieldKeyholeLine className="size-5" aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h1 className="text-base font-bold tracking-tight text-foreground leading-snug">
                      Institutional Onboarding Wizard
                    </h1>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      First-Run Setup • Super Administrator Scope
                    </p>
                  </div>
                </div>

                {/* Progress Meter */}
                <div className="mt-4 pt-4 border-t border-border/60 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-muted-foreground">
                      Setup Completion
                    </span>
                    <span className="font-mono font-semibold text-foreground">
                      {completedStepsCount} of {WIZARD_STEPS.length} steps ({progressPercentage}%)
                    </span>
                  </div>
                  <div
                    className="h-2 w-full rounded-full bg-muted overflow-hidden"
                    role="progressbar"
                    aria-valuenow={progressPercentage}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="Overall setup completion progress"
                  >
                    <div
                      className="h-full bg-primary transition-all duration-300 rounded-full"
                      style={{ width: `${progressPercentage}%` }}
                    />
                  </div>
                </div>

                {/* Completed Summary Toggle Button */}
                {status?.completed_at && (
                  <div className="mt-4 pt-3 border-t border-border/60">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full justify-center"
                      onClick={() => setViewingSummary(!viewingSummary)}
                    >
                      {viewingSummary ? "Open Wizard Steps" : "View Read-only Summary"}
                    </Button>
                  </div>
                )}
              </div>

              {/* Guided Vertical Stepper (Visible when not in full summary mode) */}
              {!viewingSummary && (
                <div className="p-3 sm:p-4 bg-card/50">
                  <div className="px-2 pb-2 flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Guided Setup Steps
                    </span>
                    {isDirty && (
                      <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-primary/40 text-primary">
                        Unsaved edits
                      </Badge>
                    )}
                  </div>
                  <Stepper
                    currentStep={currentStep}
                    stepStates={stepStates}
                    onStepClick={(step) => navigateToStep(step)}
                    disabled={isSavingStep || isFinishing}
                  />
                </div>
              )}

              {/* Structural Prerequisite Live Counter Footer */}
              <div className="p-4 border-t border-border bg-muted/30 space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
                    <RiNodeTree className="size-3.5 text-primary" aria-hidden="true" />
                    Structural Entities
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    Min 1 each
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg border border-border/80 bg-card px-2 py-1.5">
                    <div className="text-xs font-mono font-bold text-foreground">
                      {status?.prerequisites?.streams_count ?? streams.length}
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      Streams
                    </div>
                  </div>
                  <div className="rounded-lg border border-border/80 bg-card px-2 py-1.5">
                    <div className="text-xs font-mono font-bold text-foreground">
                      {status?.prerequisites?.departments_count ?? departments.length}
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      Departments
                    </div>
                  </div>
                  <div className="rounded-lg border border-border/80 bg-card px-2 py-1.5">
                    <div className="text-xs font-mono font-bold text-foreground">
                      {status?.prerequisites?.academic_years_count ?? academicYears.length}
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      Acad. Years
                    </div>
                  </div>
                </div>
              </div>
            </Card>

            {/* Guided Help Note Card (Desktop Sidebar) */}
            <div className="hidden lg:flex items-start gap-2.5 rounded-xl border border-border/80 bg-card/80 p-3.5 text-xs text-muted-foreground shadow-2xs">
              <RiInformationLine className="size-4 text-primary shrink-0 mt-0.5" aria-hidden="true" />
              <p className="leading-relaxed">
                Progress is saved per step to your tenant database. You can revisit any step before finalizing institutional onboarding.
              </p>
            </div>
          </aside>

          {/* RIGHT MAIN WORKSPACE PANE */}
          <div className="lg:col-span-8 xl:col-span-8 space-y-4 min-w-0">
            {/* Contextual Workspace Top Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl border border-border bg-card px-5 py-3.5 shadow-2xs">
              {viewingSummary ? (
                <div className="flex items-center gap-2">
                  <RiCheckboxCircleFill className="size-4 text-primary shrink-0" aria-hidden="true" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                    Onboarding Finalized
                  </span>
                  <span className="text-xs text-muted-foreground">
                    • Institutional Setup Summary
                  </span>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="font-mono text-xs">
                    Step 0{activeStepMeta.stepNumber} of 0{WIZARD_STEPS.length}
                  </Badge>
                  <span className="text-sm font-semibold text-foreground">
                    {activeStepMeta.title}
                  </span>
                  <span className="hidden sm:inline text-xs text-muted-foreground">
                    — {activeStepMeta.description}
                  </span>
                </div>
              )}

              <div className="flex items-center gap-2 self-start sm:self-auto">
                {status?.is_completed ? (
                  <Badge variant="default" className="text-xs">
                    Setup Complete
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs text-muted-foreground">
                    In Progress
                  </Badge>
                )}
              </div>
            </div>

            {/* Active Step Card Surface */}
            <Card className="border-border shadow-xs">
              <CardContent className="p-6 sm:p-8">
                {viewingSummary && status ? (
                  <CompletedSummary
                    status={status}
                    profileValues={profileValues}
                    calendarValues={calendarValues}
                    signupValues={signupValues}
                    onEditStep={(step) => {
                      setViewingSummary(false);
                      navigateToStep(step);
                    }}
                    onGoToDashboard={() => router.push("/")}
                  />
                ) : (
                  <>
                    {currentStep === "institution_profile" && (
                      <InstitutionProfileStep
                        initialValues={profileValues}
                        isSaving={isSavingStep}
                        serverErrors={stepServerErrors}
                        generalError={generalError}
                        onSave={handleSaveProfile}
                        onNext={() => navigateToStep("organisation_basics")}
                        onDirtyChange={setIsDirty}
                      />
                    )}

                    {currentStep === "organisation_basics" && (
                      <OrganisationBasicsStep
                        streams={streams}
                        departments={departments}
                        academicYears={academicYears}
                        onRefresh={refreshSetupStatusSilently}
                        onCreateStream={handleCreateStream}
                        onRenameStream={handleRenameStream}
                        onDeleteStream={handleDeleteStream}
                        onCreateDepartment={handleCreateDepartment}
                        onDeleteDepartment={handleDeleteDepartment}
                        onCreateAcademicYear={handleCreateAcademicYear}
                        onNext={() => navigateToStep("calendar_basics")}
                        onBack={() => navigateToStep("institution_profile")}
                      />
                    )}

                    {currentStep === "calendar_basics" && (
                      <CalendarStep
                        initialValues={calendarValues}
                        isSaving={isSavingStep}
                        serverErrors={stepServerErrors}
                        generalError={generalError}
                        onSave={handleSaveCalendar}
                        onNext={() => navigateToStep("signup_policy")}
                        onBack={() => navigateToStep("organisation_basics")}
                        onDirtyChange={setIsDirty}
                      />
                    )}

                    {currentStep === "signup_policy" && (
                      <SignupPolicyStep
                        initialValues={signupValues}
                        isSaving={isSavingStep}
                        serverErrors={stepServerErrors}
                        generalError={generalError}
                        onSave={handleSaveSignupPolicy}
                        onNext={() => navigateToStep("review_finish")}
                        onBack={() => navigateToStep("calendar_basics")}
                        onDirtyChange={setIsDirty}
                      />
                    )}

                    {currentStep === "review_finish" && (
                      <ReviewFinishStep
                        status={status}
                        profileValues={profileValues}
                        calendarValues={calendarValues}
                        signupValues={signupValues}
                        isFinishing={isFinishing}
                        missingPrerequisites={missingPrerequisites}
                        generalError={generalError}
                        onEditStep={(step) => navigateToStep(step)}
                        onFinish={handleFinishSetup}
                        onBack={() => navigateToStep("signup_policy")}
                      />
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* DIRTY STEP NAVIGATION DIALOG */}
      <DirtyStepWarningDialog
        open={dirtyWarningOpen}
        onConfirm={handleConfirmLeaveDirty}
        onCancel={() => {
          setDirtyWarningOpen(false);
          setPendingStepNavigation(null);
        }}
      />
    </main>
  );
}

function SetupWizardFallback() {
  return (
    <main className="min-h-screen bg-background text-foreground py-6 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
        <div className="lg:col-span-4 space-y-4">
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-80 w-full rounded-xl" />
        </div>
        <div className="lg:col-span-8 space-y-4">
          <Skeleton className="h-14 w-full rounded-xl" />
          <Skeleton className="h-96 w-full rounded-xl" />
        </div>
      </div>
    </main>
  );
}

export default function SetupWizardPage() {
  return (
    <AuthGuard>
      <React.Suspense fallback={<SetupWizardFallback />}>
        <SetupWizardContent />
      </React.Suspense>
    </AuthGuard>
  );
}

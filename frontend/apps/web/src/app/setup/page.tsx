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
  deriveSetupProgress,
  isValidStepId,
  type StepId,
  type SetupStatusData,
} from "./logic/step-derivation";
import { useSetupNavigation } from "./logic/use-setup-navigation";
import {
  isImpersonationError,
  isWrongRoleForbiddenError,
  isSetupAlreadyCompletedError,
  isSetupCompletionConflictError,
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
  type OrganisationSection,
  type OrganisationLoadStates,
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
  const statusRef = React.useRef<SetupStatusData | null>(null);
  const [currentStep, setCurrentStep] = React.useState<StepId>("institution_profile");
  const currentStepRef = React.useRef<StepId>("institution_profile");
  const [viewingSummary, setViewingSummary] = React.useState(false);

  // Structural Prerequisite Collections
  const [streams, setStreams] = React.useState<StreamItem[]>([]);
  const [departments, setDepartments] = React.useState<DepartmentItem[]>([]);
  const [academicYears, setAcademicYears] = React.useState<AcademicYearItem[]>([]);
  const [organisationLoadStates, setOrganisationLoadStates] = React.useState<OrganisationLoadStates>({
    streams: { isLoading: true, error: null },
    departments: { isLoading: true, error: null },
    academicYears: { isLoading: true, error: null },
  });
  const organisationRequestIds = React.useRef<Record<OrganisationSection, number>>({
    streams: 0,
    departments: 0,
    academicYears: 0,
  });

  // Cached Step Values for Review Summary
  const [profileValues, setProfileValues] = React.useState<Partial<InstitutionProfileFormValues>>({});
  const [calendarValues, setCalendarValues] = React.useState<Partial<CalendarFormValues>>({});
  const [signupValues, setSignupValues] = React.useState<Partial<SignupPolicyFormValues>>({});

  // Loading & Saving States
  const [isLoadingStatus, setIsLoadingStatus] = React.useState(true);
  const [isSavingStep, setIsSavingStep] = React.useState(false);
  const savingStepRef = React.useRef(false);
  const [isSavingOrganisation, setIsSavingOrganisation] = React.useState(false);
  const savingOrganisationRef = React.useRef(false);
  const [isFinishing, setIsFinishing] = React.useState(false);
  const finishingRef = React.useRef(false);
  const [completionRetry, setCompletionRetry] = React.useState<"complete" | "status" | null>(null);

  // Security & Error States
  const [securityBlock, setSecurityBlock] = React.useState<"impersonation" | "forbidden" | null>(null);
  const [generalError, setGeneralError] = React.useState<string | null>(null);
  const [stepServerErrors, setStepServerErrors] = React.useState<Record<string, string>>({});
  const [missingPrerequisites, setMissingPrerequisites] = React.useState<string[]>([]);

  // Dirty State & Navigation Guard
  const [dirtySteps, setDirtySteps] = React.useState<Record<StepId, boolean>>({
    institution_profile: false,
    organisation_basics: false,
    calendar_basics: false,
    signup_policy: false,
    review_finish: false,
  });
  const dirtyStepsRef = React.useRef(dirtySteps);
  const [draftVersion, setDraftVersion] = React.useState(0);
  const isDirty = dirtySteps[currentStep];
  const isAnySaving = isSavingStep || isSavingOrganisation || isFinishing;

  const setActiveStep = React.useCallback((step: StepId) => {
    currentStepRef.current = step;
    setCurrentStep(step);
  }, []);

  const setStepDirty = React.useCallback((step: StepId, dirty: boolean) => {
    dirtyStepsRef.current = { ...dirtyStepsRef.current, [step]: dirty };
    setDirtySteps((prev) => prev[step] === dirty ? prev : { ...prev, [step]: dirty });
  }, []);

  const dirtyChangeHandlers = React.useMemo(() => ({
    institution_profile: (dirty: boolean) => setStepDirty("institution_profile", dirty),
    organisation_basics: (dirty: boolean) => setStepDirty("organisation_basics", dirty),
    calendar_basics: (dirty: boolean) => setStepDirty("calendar_basics", dirty),
    signup_policy: (dirty: boolean) => setStepDirty("signup_policy", dirty),
  }), [setStepDirty]);

  const isNavigationSaving = React.useCallback(() =>
    savingStepRef.current || savingOrganisationRef.current || finishingRef.current, []);

  const hasUnsavedChanges = React.useCallback(() =>
    dirtyStepsRef.current[currentStepRef.current], []);

  const handleOrganisationSavingChange = React.useCallback((saving: boolean) => {
    savingOrganisationRef.current = saving;
    setIsSavingOrganisation(saving);
  }, []);

  const initialRequestedStepRef = React.useRef<string | null>(requestedStepParam);

  const navigation = useSetupNavigation({
    hasUnsavedChanges,
    isSaving: isNavigationSaving,
    protectDocument: isDirty || isAnySaving,
    onDiscard: () => {
      setStepDirty(currentStepRef.current, false);
      setDraftVersion((prev) => prev + 1);
      setStepServerErrors({});
      setGeneralError(null);
    },
    onHistoryNavigate: (url) => {
      if (url.pathname !== "/setup") return;
      const requestedStep = url.searchParams.get("step");
      // A traversal during the initial GET must remain the resume target when it resolves.
      initialRequestedStepRef.current = requestedStep;
      setStepDirty(currentStepRef.current, false);
      setStepServerErrors({});
      setGeneralError(null);
      setViewingSummary(Boolean(statusRef.current?.completed_at && !requestedStep));
      setActiveStep(deriveCurrentStep(statusRef.current, requestedStep));
    },
  });
  const isNavigationDisabled = isAnySaving || navigation.isRestoringHistory;

  const updateSetupStatus = React.useCallback((statusData: SetupStatusData) => {
    statusRef.current = statusData;
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
  }, []);

  const refreshOrganisationCollections = React.useCallback(async (section?: OrganisationSection) => {
    const sections: OrganisationSection[] = section
      ? [section]
      : ["streams", "departments", "academicYears"];
    const requests = {
      streams: () => client.organisation.streams.list(),
      departments: () => client.organisation.departments.list(),
      academicYears: () => client.organisation.academicYears.list(),
    };
    const labels = { streams: "streams", departments: "departments", academicYears: "academic years" };

    await Promise.allSettled(sections.map(async (key) => {
      const requestId = ++organisationRequestIds.current[key];
      setOrganisationLoadStates((prev) => ({
        ...prev,
        [key]: { isLoading: true, error: null },
      }));

      try {
        const res = await requests[key]();
        if (organisationRequestIds.current[key] !== requestId) return;

        const data = (res as { data?: unknown }).data;
        if (key === "streams") setStreams((data as StreamItem[]) || []);
        if (key === "departments") setDepartments((data as DepartmentItem[]) || []);
        if (key === "academicYears") setAcademicYears((data as AcademicYearItem[]) || []);
        setOrganisationLoadStates((prev) => ({
          ...prev,
          [key]: { isLoading: false, error: null },
        }));
      } catch (err: unknown) {
        if (organisationRequestIds.current[key] !== requestId) return;

        if (key === "streams") setStreams([]);
        if (key === "departments") setDepartments([]);
        if (key === "academicYears") setAcademicYears([]);
        const fallback = `Failed to load ${labels[key]}.`;
        setOrganisationLoadStates((prev) => ({
          ...prev,
          [key]: { isLoading: false, error: getGeneralErrorMessage(err, fallback) || fallback },
        }));
        throw err;
      }
    }));
  }, [client]);

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
        updateSetupStatus(statusData);

        if (!silent) {
          const initialStep = initialRequestedStepRef.current;
          // If already completed and user didn't request an explicit step, show summary
          if (statusData.completed_at && !initialStep) {
            setViewingSummary(true);
          } else {
            const derived = deriveCurrentStep(statusData, initialStep);
            setActiveStep(derived);
          }
          // Collection loading is shown independently in the organisation sections.
          setIsLoadingStatus(false);
        }

        await refreshOrganisationCollections();
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
    [client, updateSetupStatus, refreshOrganisationCollections, setActiveStep]
  );

  const refreshSetupStatusSilently = React.useCallback(async () => {
    await loadSetupStatus({ silent: true });
  }, [loadSetupStatus]);

  React.useEffect(() => {
    void loadSetupStatus();
  }, [loadSetupStatus]);

  // Native-history changes reach this effect only after the traversal is allowed.
  React.useEffect(() => {
    if (requestedStepParam && isValidStepId(requestedStepParam) &&
      requestedStepParam === new URLSearchParams(window.location.search).get("step") &&
      !navigation.isRestoringHistory && !isNavigationSaving() && !hasUnsavedChanges()) {
      setViewingSummary(false);
      setActiveStep(requestedStepParam);
    }
  }, [requestedStepParam, navigation.isRestoringHistory, isNavigationSaving, hasUnsavedChanges, setActiveStep]);

  // Handle URL step synchronization
  const navigateToStep = (targetStep: StepId, afterSave = false) => {
    if (targetStep === currentStepRef.current && !viewingSummary) return;
    navigation.requestNavigation(() => {
      setStepDirty(currentStepRef.current, false);
      setStepServerErrors({});
      setGeneralError(null);
      setViewingSummary(false);
      setActiveStep(targetStep);
      navigation.pushStep(targetStep);
      // Native query navigation does not provide router.push's scroll handling.
      window.scrollTo({ top: 0, behavior: "auto" });
    }, afterSave);
  };

  // STEP 1: SAVE INSTITUTION PROFILE
  const handleSaveProfile = async (values: InstitutionProfileFormValues): Promise<boolean> => {
    if (isNavigationSaving()) return false;
    savingStepRef.current = true;
    setIsSavingStep(true);
    setStepServerErrors({});
    setGeneralError(null);

    try {
      const res = await client.setup.saveStep("institution_profile", values as unknown as Record<string, unknown>);
      statusRef.current = res.data as SetupStatusData;
      setStatus(statusRef.current);
      setProfileValues((statusRef.current.steps?.institution_profile?.values as Partial<InstitutionProfileFormValues> | null) ?? values);
      toast.success("Institution profile saved successfully.");
      setStepDirty("institution_profile", false);
      return true;
    } catch (err: unknown) {
      const fieldErrors = mapProblemFieldErrors(err);
      if (Object.keys(fieldErrors).length > 0) {
        setStepServerErrors(fieldErrors);
      }
      setGeneralError(getGeneralErrorMessage(err, "Failed to save institution profile.") || "Failed to save institution profile.");
      return false;
    } finally {
      savingStepRef.current = false;
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
    if (isNavigationSaving()) return false;
    savingStepRef.current = true;
    setIsSavingStep(true);
    setStepServerErrors({});
    setGeneralError(null);

    try {
      const res = await client.setup.saveStep("calendar_basics", values as unknown as Record<string, unknown>);
      statusRef.current = res.data as SetupStatusData;
      setStatus(statusRef.current);
      setCalendarValues((statusRef.current.steps?.calendar_basics?.values as Partial<CalendarFormValues> | null) ?? values);
      toast.success("Academic calendar basics saved.");
      setStepDirty("calendar_basics", false);
      return true;
    } catch (err: unknown) {
      const fieldErrors = mapProblemFieldErrors(err);
      if (Object.keys(fieldErrors).length > 0) {
        setStepServerErrors(fieldErrors);
      }
      setGeneralError(getGeneralErrorMessage(err, "Failed to save calendar basics.") || "Failed to save calendar basics.");
      return false;
    } finally {
      savingStepRef.current = false;
      setIsSavingStep(false);
    }
  };

  // STEP 4: SAVE SIGN-UP POLICY
  const handleSaveSignupPolicy = async (values: SignupPolicyFormValues): Promise<boolean> => {
    if (isNavigationSaving()) return false;
    savingStepRef.current = true;
    setIsSavingStep(true);
    setStepServerErrors({});
    setGeneralError(null);

    try {
      const res = await client.setup.saveStep("signup_policy", values as unknown as Record<string, unknown>);
      statusRef.current = res.data as SetupStatusData;
      setStatus(statusRef.current);
      setSignupValues((statusRef.current.steps?.signup_policy?.values as Partial<SignupPolicyFormValues> | null) ?? values);
      toast.success("Sign-up policy preferences saved.");
      setStepDirty("signup_policy", false);
      return true;
    } catch (err: unknown) {
      const fieldErrors = mapProblemFieldErrors(err);
      if (Object.keys(fieldErrors).length > 0) {
        setStepServerErrors(fieldErrors);
      }
      setGeneralError(getGeneralErrorMessage(err, "Failed to save sign-up policy.") || "Failed to save sign-up policy.");
      return false;
    } finally {
      savingStepRef.current = false;
      setIsSavingStep(false);
    }
  };

  // STEP 5: FINISH SETUP
  const handleFinishSetup = async (refreshStatusOnly = false) => {
    if (isNavigationSaving()) return;
    finishingRef.current = true;
    let isRefreshingCompletedStatus = refreshStatusOnly;
    setIsFinishing(true);
    setGeneralError(null);
    setMissingPrerequisites([]);
    setCompletionRetry(null);

    try {
      if (!isRefreshingCompletedStatus) {
        try {
          const res = await client.setup.complete();
          const updatedStatus = res.data as SetupStatusData;
          statusRef.current = updatedStatus;
          setStatus(updatedStatus);
          toast.success("First-run setup finalized successfully!");
          setViewingSummary(true);
          return;
        } catch (err: unknown) {
          if (!isSetupAlreadyCompletedError(err)) throw err;
          isRefreshingCompletedStatus = true;
        }
      }

      const res = await client.setup.status();
      const refreshedStatus = res.data as SetupStatusData;
      if (!refreshedStatus.is_completed || !refreshedStatus.completed_at) {
        throw new Error("Setup completion could not be confirmed. Please retry.");
      }
      updateSetupStatus(refreshedStatus);
      toast.info("Setup was already finalized.");
      setViewingSummary(true);
    } catch (err: unknown) {
      const isConflict = isSetupCompletionConflictError(err);
      if (isRefreshingCompletedStatus || isConflict) {
        setCompletionRetry(isRefreshingCompletedStatus ? "status" : "complete");
      }
      const missing = extractMissingPrerequisites(err);
      if (missing.length > 0) {
        setMissingPrerequisites(missing);
      }
      const fallback = isRefreshingCompletedStatus
        ? "Failed to refresh completed setup status. Please retry."
        : isConflict
          ? "Setup could not be finalized because of a conflict. Please retry."
          : "Cannot finalize setup. Please ensure all steps and prerequisite counts are satisfied.";
      const message = getGeneralErrorMessage(err, fallback);
      setGeneralError(isRefreshingCompletedStatus || isConflict ? message || fallback : message);
    } finally {
      finishingRef.current = false;
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

  const progress = deriveSetupProgress(status);

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
                      Prerequisite Progress
                    </span>
                    <span className="font-mono font-semibold text-foreground">
                      {progress.completedRequirements} of {progress.totalRequirements} prerequisite steps ({progress.percentage}%)
                    </span>
                  </div>
                  <div
                    className="h-2 w-full rounded-full bg-muted overflow-hidden"
                    role="progressbar"
                    aria-valuenow={progress.percentage}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="Setup prerequisite progress"
                    aria-valuetext={`${progress.completedRequirements} of ${progress.totalRequirements} prerequisite steps ready`}
                  >
                    <div
                      className="h-full bg-primary transition-all duration-300 rounded-full"
                      style={{ width: `${progress.percentage}%` }}
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
                      onClick={() => navigation.requestNavigation(() => setViewingSummary(!viewingSummary))}
                      disabled={isNavigationDisabled}
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
                    disabled={isNavigationDisabled}
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
                {progress.completionState === "completed" ? (
                  <Badge variant="default" className="text-xs">
                    Setup Complete
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs text-muted-foreground">
                    {progress.completionState === "ready_to_finalize" ? "Ready to Finalize" : "In Progress"}
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
                    onEditStep={(step) => navigateToStep(step)}
                    onGoToDashboard={() => navigation.requestNavigation(() => router.push("/home"))}
                  />
                ) : (
                  <>
                    {currentStep === "institution_profile" && (
                      <InstitutionProfileStep
                        key={`profile-${draftVersion}`}
                        initialValues={profileValues}
                        isSaving={isAnySaving}
                        isPersisted={Boolean(status?.steps.institution_profile.is_completed && status.steps.institution_profile.settings_exist)}
                        navigationDisabled={isNavigationDisabled}
                        serverErrors={stepServerErrors}
                        generalError={generalError}
                        onSave={handleSaveProfile}
                        onNext={() => navigateToStep("organisation_basics", true)}
                        onDirtyChange={dirtyChangeHandlers.institution_profile}
                      />
                    )}

                    {currentStep === "organisation_basics" && (
                      <OrganisationBasicsStep
                        key={`organisation-${draftVersion}`}
                        streams={streams}
                        departments={departments}
                        academicYears={academicYears}
                        loadStates={organisationLoadStates}
                        onRetryLoad={refreshOrganisationCollections}
                        onRefresh={refreshSetupStatusSilently}
                        onCreateStream={handleCreateStream}
                        onRenameStream={handleRenameStream}
                        onDeleteStream={handleDeleteStream}
                        onCreateDepartment={handleCreateDepartment}
                        onDeleteDepartment={handleDeleteDepartment}
                        onCreateAcademicYear={handleCreateAcademicYear}
                        onNext={() => navigateToStep("calendar_basics")}
                        onBack={() => navigateToStep("institution_profile")}
                        navigationDisabled={isNavigationDisabled}
                        onSavingChange={handleOrganisationSavingChange}
                        onDirtyChange={dirtyChangeHandlers.organisation_basics}
                      />
                    )}

                    {currentStep === "calendar_basics" && (
                      <CalendarStep
                        key={`calendar-${draftVersion}`}
                        initialValues={calendarValues}
                        isSaving={isAnySaving}
                        isPersisted={Boolean(status?.steps.calendar_basics.is_completed && status.steps.calendar_basics.settings_exist)}
                        navigationDisabled={isNavigationDisabled}
                        serverErrors={stepServerErrors}
                        generalError={generalError}
                        onSave={handleSaveCalendar}
                        onNext={() => navigateToStep("signup_policy", true)}
                        onBack={() => navigateToStep("organisation_basics")}
                        onDirtyChange={dirtyChangeHandlers.calendar_basics}
                      />
                    )}

                    {currentStep === "signup_policy" && (
                      <SignupPolicyStep
                        key={`signup-${draftVersion}`}
                        initialValues={signupValues}
                        isSaving={isAnySaving}
                        isPersisted={Boolean(status?.steps.signup_policy.is_completed && status.steps.signup_policy.settings_exist)}
                        navigationDisabled={isNavigationDisabled}
                        serverErrors={stepServerErrors}
                        generalError={generalError}
                        onSave={handleSaveSignupPolicy}
                        onNext={() => navigateToStep("review_finish", true)}
                        onBack={() => navigateToStep("calendar_basics")}
                        onDirtyChange={dirtyChangeHandlers.signup_policy}
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
                        onFinish={() => handleFinishSetup()}
                        onRetry={completionRetry ? () => handleFinishSetup(completionRetry === "status") : undefined}
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
        open={navigation.warningOpen}
        disabled={isNavigationDisabled}
        onConfirm={navigation.confirmDiscard}
        onCancel={navigation.cancelNavigation}
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

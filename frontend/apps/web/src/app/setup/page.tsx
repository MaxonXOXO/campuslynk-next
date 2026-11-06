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
} from "@academic-suite/ui";
import { toast } from "sonner";
import { RiRefreshLine, RiAlertLine, RiShieldKeyholeLine } from "@remixicon/react";
import { AuthGuard } from "@/lib/auth/auth-guard";
import { useApiClient } from "@/lib/auth/session-provider";

import {
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
      <main className="min-h-screen bg-background text-foreground flex flex-col items-center p-4 sm:p-8">
        <div className="max-w-4xl w-full space-y-6">
          <div className="flex items-center justify-between">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-6 w-32" />
          </div>
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-96 w-full rounded-xl" />
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

  return (
    <main className="min-h-screen bg-background text-foreground flex flex-col items-center py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl w-full space-y-6">
        {/* WIZARD HEADER */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-4">
          <div className="flex items-center gap-2.5">
            <div className="size-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <RiShieldKeyholeLine className="size-5" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-foreground">
                Institutional Onboarding Wizard
              </h1>
              <p className="text-xs text-muted-foreground">
                First-Run Setup • Super Administrator Scope
              </p>
            </div>
          </div>
          {status?.completed_at && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setViewingSummary(!viewingSummary)}
            >
              {viewingSummary ? "Open Wizard Steps" : "View Read-only Summary"}
            </Button>
          )}
        </header>

        {/* STEPPER (Visible when not in full summary mode) */}
        {!viewingSummary && (
          <Stepper
            currentStep={currentStep}
            stepStates={stepStates}
            onStepClick={(step) => navigateToStep(step)}
            disabled={isSavingStep || isFinishing}
          />
        )}

        {/* CARD CONTAINER */}
        <Card className="border-border shadow-sm">
          <CardContent className="p-6">
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
    <main className="min-h-screen bg-background text-foreground py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-96 w-full" />
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

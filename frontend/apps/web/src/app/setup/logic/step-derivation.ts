/**
 * First-Run Setup Wizard Step Derivation Logic
 */

export type StepId =
  | 'institution_profile'
  | 'organisation_basics'
  | 'calendar_basics'
  | 'signup_policy'
  | 'review_finish';

export type StepState = 'not_started' | 'saved' | 'current';

export interface StepItem {
  id: StepId;
  title: string;
  shortTitle: string;
  description: string;
  stepNumber: number;
}

export const WIZARD_STEPS: StepItem[] = [
  {
    id: 'institution_profile',
    title: 'Institution Profile',
    shortTitle: 'Profile',
    description: 'Identity, board affiliation & contact details',
    stepNumber: 1,
  },
  {
    id: 'organisation_basics',
    title: 'Organisation Basics',
    shortTitle: 'Organisation',
    description: 'Streams, departments & academic sessions',
    stepNumber: 2,
  },
  {
    id: 'calendar_basics',
    title: 'Academic Calendar',
    shortTitle: 'Calendar',
    description: 'Working days, periods & day-order cycle',
    stepNumber: 3,
  },
  {
    id: 'signup_policy',
    title: 'Sign-up Policy',
    shortTitle: 'Sign-up',
    description: 'Student & guardian registration rules',
    stepNumber: 4,
  },
  {
    id: 'review_finish',
    title: 'Review and Finish',
    shortTitle: 'Review',
    description: 'Verify prerequisites & activate portal',
    stepNumber: 5,
  },
];

export interface SetupStatusData {
  completed_at: string | null;
  is_completed: boolean;
  steps: {
    institution_profile: {
      completed_at: string | null;
      is_completed: boolean;
      settings_exist: boolean;
      values?: Record<string, unknown> | null;
    };
    calendar_basics: {
      completed_at: string | null;
      is_completed: boolean;
      settings_exist: boolean;
      values?: Record<string, unknown> | null;
    };
    signup_policy: {
      completed_at: string | null;
      is_completed: boolean;
      settings_exist: boolean;
      values?: Record<string, unknown> | null;
    };
  };
  prerequisites: {
    streams_count: number;
    departments_count: number;
    academic_years_count: number;
  };
}

export function isValidStepId(step: unknown): step is StepId {
  return (
    step === 'institution_profile' ||
    step === 'organisation_basics' ||
    step === 'calendar_basics' ||
    step === 'signup_policy' ||
    step === 'review_finish'
  );
}

export function deriveCurrentStep(
  status: SetupStatusData | null | undefined,
  requestedStep?: string | null
): StepId {
  if (requestedStep && isValidStepId(requestedStep)) {
    return requestedStep;
  }

  if (!status) {
    return 'institution_profile';
  }

  if (!status.steps.institution_profile?.is_completed) {
    return 'institution_profile';
  }

  const { streams_count = 0, departments_count = 0, academic_years_count = 0 } =
    status.prerequisites || {};

  if (streams_count < 1 || departments_count < 1 || academic_years_count < 1) {
    return 'organisation_basics';
  }

  if (!status.steps.calendar_basics?.is_completed) {
    return 'calendar_basics';
  }

  if (!status.steps.signup_policy?.is_completed) {
    return 'signup_policy';
  }

  return 'review_finish';
}

export function deriveStepStates(
  status: SetupStatusData | null | undefined,
  currentStep: StepId
): Record<StepId, StepState> {
  const isOrgSaved =
    (status?.prerequisites?.streams_count ?? 0) >= 1 &&
    (status?.prerequisites?.departments_count ?? 0) >= 1 &&
    (status?.prerequisites?.academic_years_count ?? 0) >= 1;

  const states: Record<StepId, StepState> = {
    institution_profile: status?.steps?.institution_profile?.is_completed
      ? 'saved'
      : 'not_started',
    organisation_basics: isOrgSaved ? 'saved' : 'not_started',
    calendar_basics: status?.steps?.calendar_basics?.is_completed
      ? 'saved'
      : 'not_started',
    signup_policy: status?.steps?.signup_policy?.is_completed
      ? 'saved'
      : 'not_started',
    review_finish: status?.is_completed ? 'saved' : 'not_started',
  };

  states[currentStep] = 'current';

  return states;
}

export interface SetupProgress {
  completedRequirements: number;
  totalRequirements: number;
  percentage: number;
  completionState: 'in_progress' | 'ready_to_finalize' | 'completed';
}

/** Finalization is a state, not an additional portion of prerequisite progress. */
export function deriveSetupProgress(status: SetupStatusData | null | undefined): SetupProgress {
  const organisationReady =
    (status?.prerequisites?.streams_count ?? 0) >= 1 &&
    (status?.prerequisites?.departments_count ?? 0) >= 1 &&
    (status?.prerequisites?.academic_years_count ?? 0) >= 1;
  const requirements = [
    Boolean(status?.steps?.institution_profile?.is_completed),
    organisationReady,
    Boolean(status?.steps?.calendar_basics?.is_completed),
    Boolean(status?.steps?.signup_policy?.is_completed),
  ];
  const completedRequirements = requirements.filter(Boolean).length;
  const totalRequirements = requirements.length;

  return {
    completedRequirements,
    totalRequirements,
    percentage: Math.round((completedRequirements / totalRequirements) * 100),
    completionState: status?.is_completed
      ? 'completed'
      : completedRequirements === totalRequirements ? 'ready_to_finalize' : 'in_progress',
  };
}

export function isFinishEnabled(status: SetupStatusData | null | undefined): boolean {
  if (!status) return false;

  const profileComplete = Boolean(status.steps?.institution_profile?.is_completed);
  const calendarComplete = Boolean(status.steps?.calendar_basics?.is_completed);
  const signupComplete = Boolean(status.steps?.signup_policy?.is_completed);

  const streamsOk = (status.prerequisites?.streams_count ?? 0) >= 1;
  const deptsOk = (status.prerequisites?.departments_count ?? 0) >= 1;
  const yearsOk = (status.prerequisites?.academic_years_count ?? 0) >= 1;

  return (
    profileComplete &&
    calendarComplete &&
    signupComplete &&
    streamsOk &&
    deptsOk &&
    yearsOk
  );
}

export interface PrerequisiteCheckItem {
  id: string;
  label: string;
  satisfied: boolean;
  stepTarget: StepId;
}

export function getPrerequisiteChecklist(
  status: SetupStatusData | null | undefined
): PrerequisiteCheckItem[] {
  return [
    {
      id: 'profile',
      label: 'Institution Profile configured and saved',
      satisfied: Boolean(status?.steps?.institution_profile?.is_completed),
      stepTarget: 'institution_profile',
    },
    {
      id: 'streams',
      label: `At least one Stream created (${status?.prerequisites?.streams_count ?? 0} existing)`,
      satisfied: (status?.prerequisites?.streams_count ?? 0) >= 1,
      stepTarget: 'organisation_basics',
    },
    {
      id: 'departments',
      label: `At least one Department created (${status?.prerequisites?.departments_count ?? 0} existing)`,
      satisfied: (status?.prerequisites?.departments_count ?? 0) >= 1,
      stepTarget: 'organisation_basics',
    },
    {
      id: 'academic_years',
      label: `At least one Academic Year created (${status?.prerequisites?.academic_years_count ?? 0} existing)`,
      satisfied: (status?.prerequisites?.academic_years_count ?? 0) >= 1,
      stepTarget: 'organisation_basics',
    },
    {
      id: 'calendar',
      label: 'Academic Calendar basics configured and saved',
      satisfied: Boolean(status?.steps?.calendar_basics?.is_completed),
      stepTarget: 'calendar_basics',
    },
    {
      id: 'signup_policy',
      label: 'Sign-up Policy preferences configured and saved',
      satisfied: Boolean(status?.steps?.signup_policy?.is_completed),
      stepTarget: 'signup_policy',
    },
  ];
}

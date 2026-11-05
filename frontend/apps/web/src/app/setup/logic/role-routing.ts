/**
 * Role-Based Routing and Access Control Logic for First-Run Setup
 */

export interface UserRoleAssignment {
  role_key: string;
  scope_type: string;
  is_active?: boolean;
}

export interface UserWithAssignments {
  assignments?: UserRoleAssignment[];
}

export interface SetupStatusCheck {
  completed_at: string | null;
  is_completed?: boolean;
}

export function isSuperAdminAtInstitutionScope(user: UserWithAssignments | null | undefined): boolean {
  if (!user || !Array.isArray(user.assignments)) {
    return false;
  }

  return user.assignments.some(
    (a) => a.role_key === 'super_admin' && a.scope_type === 'institution' && a.is_active !== false
  );
}

export function shouldRedirectToSetup(
  user: UserWithAssignments | null | undefined,
  setupStatus: SetupStatusCheck | null | undefined
): boolean {
  if (!isSuperAdminAtInstitutionScope(user)) {
    return false;
  }

  return setupStatus?.completed_at === null || setupStatus?.completed_at === undefined;
}

export interface ProblemLikeError {
  status?: number;
  type?: string;
  detail?: string;
  problem?: {
    status?: number;
    type?: string;
    detail?: string;
  };
}

export function isImpersonationError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const err = error as ProblemLikeError;
  const status = err.status ?? err.problem?.status;
  const typeUri = err.type ?? err.problem?.type ?? '';

  if (status !== 403) return false;

  // Machine-readable RFC 7807 problem type check (NO string-matching on detail text)
  return (
    typeUri === 'https://errors.campuslynk.net/impersonation-not-allowed' ||
    typeUri.endsWith('/impersonation-not-allowed')
  );
}

export function isWrongRoleForbiddenError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const err = error as ProblemLikeError;
  const status = err.status ?? err.problem?.status;

  if (status !== 403) return false;

  return !isImpersonationError(error);
}

export function isSetupAlreadyCompletedError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const err = error as ProblemLikeError;
  const status = err.status ?? err.problem?.status;
  const typeUri = err.type ?? err.problem?.type ?? '';

  return (
    status === 409 ||
    typeUri === 'https://errors.campuslynk.net/setup-already-completed' ||
    typeUri.endsWith('/setup-already-completed')
  );
}


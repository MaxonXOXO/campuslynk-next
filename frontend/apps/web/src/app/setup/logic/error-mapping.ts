/**
 * RFC 7807 Problem Details Error Mapping Utilities
 */

export interface ProblemLikePayload {
  status?: number;
  type?: string;
  title?: string;
  detail?: string;
  errors?: Record<string, string[] | string>;
  invalid_params?: Array<{ name: string; reason: string }>;
  problem?: ProblemLikePayload;
  message?: string;
}

export function mapProblemFieldErrors(error: unknown): Record<string, string> {
  const result: Record<string, string> = {};
  if (!error || typeof error !== 'object') return result;

  const err = error as ProblemLikePayload;
  const errorsObj = err.errors ?? err.problem?.errors;

  if (errorsObj && typeof errorsObj === 'object') {
    for (const [field, messages] of Object.entries(errorsObj)) {
      if (Array.isArray(messages) && messages.length > 0) {
        result[field] = String(messages[0]);
      } else if (typeof messages === 'string') {
        result[field] = messages;
      }
    }
  }

  const invalidParams = err.invalid_params ?? err.problem?.invalid_params;
  if (Array.isArray(invalidParams)) {
    for (const param of invalidParams) {
      if (param.name && param.reason) {
        result[param.name] = param.reason;
      }
    }
  }

  return result;
}

export function extractMissingPrerequisites(error: unknown): string[] {
  if (!error || typeof error !== 'object') return [];

  const err = error as ProblemLikePayload & { missing?: string[] };
  const errorsObj = err.errors ?? err.problem?.errors;

  if (errorsObj && Array.isArray(errorsObj.missing)) {
    return errorsObj.missing.map(String);
  }

  if (Array.isArray(err.missing)) {
    return err.missing.map(String);
  }

  return [];
}

export function getGeneralErrorMessage(error: unknown, fallback = 'An unexpected error occurred.'): string {
  if (!error) return fallback;
  if (typeof error === 'string') return error;

  const err = error as ProblemLikePayload;
  return err.detail ?? err.problem?.detail ?? err.message ?? err.title ?? fallback;
}


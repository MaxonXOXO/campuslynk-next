import type { paths, operations, components } from './generated/schema.js';

export type { paths, operations, components };

/**
 * RFC 7807 Problem Details for HTTP APIs.
 */
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  invalid_params?: Array<{
    name: string;
    reason: string;
  }>;
  [key: string]: unknown;
}

/**
 * Standard Envelope structure for successful API responses.
 */
export interface ApiResponseEnvelope<T, M = Record<string, unknown>> {
  data: T;
  meta?: M;
  links?: Record<string, string>;
}

/**
 * Typed API Error wrapping RFC 7807 Problem Details.
 */
export class ApiError extends Error {
  public readonly status: number;
  public readonly problem: ProblemDetails;

  constructor(problem: ProblemDetails) {
    super(problem.detail || problem.title || `API error with status ${problem.status}`);
    this.name = 'ApiError';
    this.status = problem.status;
    this.problem = problem;
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

/**
 * Configuration options for creating an Academic Suite API client instance.
 */
export interface ApiClientConfig {
  baseUrl: string;
  getAccessToken?: () => string | null | undefined | Promise<string | null | undefined>;
  getTenantDomain?: () => string | null | undefined | Promise<string | null | undefined>;
  fetchFn?: typeof fetch;
}

/**
 * Request options for API client calls.
 */
export interface RequestOptions extends Omit<RequestInit, 'body'> {
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
}

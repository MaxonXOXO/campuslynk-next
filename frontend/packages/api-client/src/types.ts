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
  errors?: Record<string, string[]>;
  invalid_params?: Array<{
    name: string;
    reason: string;
  }>;
  [key: string]: unknown;
}

/**
 * Standard Envelope structure for successful API responses.
 */
export interface ApiResponseEnvelope<T, M = Record<string, unknown>, L = Record<string, string>> {
  data: T;
  meta?: M;
  links?: L;
}

export type Envelope<T, M = Record<string, unknown>, L = Record<string, string>> = ApiResponseEnvelope<T, M, L>;

/**
 * Typed API Error wrapping RFC 7807 Problem Details.
 */
export class ApiError extends Error {
  public readonly status: number;
  public readonly type: string;
  public readonly title: string;
  public readonly detail?: string;
  public readonly errors?: Record<string, string[]> | Array<{ name: string; reason: string }>;
  public readonly problem: ProblemDetails;

  constructor(problem: ProblemDetails) {
    super(problem.detail || problem.title || `API error with status ${problem.status}`);
    this.name = 'ApiError';
    this.status = problem.status;
    this.type = problem.type || 'about:blank';
    this.title = problem.title || `HTTP Error ${problem.status}`;
    this.detail = problem.detail;
    this.errors = problem.errors || (problem.invalid_params as unknown as Record<string, string[]>);
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
  idempotencyKey?: string;
}

/**
 * Typed API client placeholder for Academic Suite.
 * Real typed fetchers generated via Orval from OpenAPI contract will reside here in later steps.
 */
export const API_CLIENT_VERSION = '0.1.0';

export interface ApiResponseEnvelope<T, M = Record<string, unknown>> {
  data: T;
  meta?: M;
  links?: Record<string, string>;
}

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'error';
}

/**
 * @academic-suite/api-client
 * Strongly typed OpenAPI client for Academic Suite.
 */

export const API_CLIENT_VERSION = '0.1.0';

export { createApiClient } from './client.js';
export {
  ApiError,
  type ProblemDetails,
  type ApiResponseEnvelope,
  type ApiClientConfig,
  type RequestOptions,
  type paths,
  type operations,
  type components,
} from './types.js';

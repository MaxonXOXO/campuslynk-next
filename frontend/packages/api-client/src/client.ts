import { ApiError, type ProblemDetails, type ApiClientConfig, type RequestOptions } from './types.js';
import type { operations } from './generated/schema.js';

type OperationResponse<T> = T extends { responses: { 200: { content: { 'application/json': infer R } } } }
  ? R
  : T extends { responses: { 201: { content: { 'application/json': infer R } } } }
    ? R
    : unknown;

type OperationRequestBody<T> = T extends { requestBody: { content: { 'application/json': infer B } } }
  ? B
  : T extends { requestBody?: { content: { 'application/json': infer B } } }
    ? B
    : Record<string, unknown>;

type CreateDepartmentPayload =
  | OperationRequestBody<operations['createDepartment']>
  | {
      name: string;
      code: string;
      stream_id: string;
      kind?: 'academic' | 'general' | 'administrative';
      is_active?: boolean;
    };

export function createApiClient(config: ApiClientConfig) {
  const fetchFn = config.fetchFn ?? fetch;
  const baseUrl = config.baseUrl.replace(/\/+$/, '');

  async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const { query, body, headers: customHeaders, idempotencyKey, ...init } = options;

    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const url = new URL(`${baseUrl}${normalizedPath}`);

    if (query) {
      for (const [key, val] of Object.entries(query)) {
        if (val !== undefined && val !== null) {
          url.searchParams.set(key, String(val));
        }
      }
    }

    const headers = new Headers(customHeaders);

    if (!headers.has('Accept')) {
      headers.set('Accept', 'application/json, application/problem+json');
    }

    if (body !== undefined && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    if (idempotencyKey && !headers.has('Idempotency-Key')) {
      headers.set('Idempotency-Key', idempotencyKey);
    }

    if (config.getAccessToken && !headers.has('Authorization')) {
      const token = await config.getAccessToken();
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }
    }

    if (config.getTenantDomain && !headers.has('X-Tenant')) {
      const tenant = await config.getTenantDomain();
      if (tenant) {
        headers.set('X-Tenant', tenant);
      }
    }

    const response = await fetchFn(url.toString(), {
      ...init,
      headers,
      body: body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
    });

    if (!response.ok) {
      const contentType = response.headers.get('content-type') || '';
      let problem: ProblemDetails;

      if (contentType.includes('application/problem+json') || contentType.includes('application/json')) {
        try {
          const json = await response.json();
          problem = {
            type: json.type || 'about:blank',
            title: json.title || response.statusText || 'Error',
            status: json.status || response.status,
            detail: json.detail,
            instance: json.instance,
            errors: json.errors,
            invalid_params: json.invalid_params,
            ...json,
          };
        } catch {
          problem = {
            type: 'about:blank',
            title: response.statusText || 'Error',
            status: response.status,
          };
        }
      } else {
        const text = await response.text();
        problem = {
          type: 'about:blank',
          title: response.statusText || 'Error',
          status: response.status,
          detail: text || undefined,
        };
      }

      throw new ApiError(problem);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return (await response.json()) as T;
    }

    return (await response.text()) as unknown as T;
  }

  // --- Auth Helper Group ---
  const auth = {
    login: (body: OperationRequestBody<operations['login']>, options?: RequestOptions) =>
      request<OperationResponse<operations['login']>>('/auth/login', {
        method: 'POST',
        body,
        ...options,
      }),
    logout: (options?: RequestOptions) =>
      request<OperationResponse<operations['logout']>>('/auth/logout', {
        method: 'POST',
        ...options,
      }),
    changePassword: (body: OperationRequestBody<operations['changePassword']>, options?: RequestOptions) =>
      request<OperationResponse<operations['changePassword']>>('/auth/password/change', {
        method: 'POST',
        body,
        ...options,
      }),
    me: (options?: RequestOptions) =>
      request<OperationResponse<operations['getCurrentUser']>>('/me', {
        method: 'GET',
        ...options,
      }),
  };

  // --- Identity Sub-Helpers ---
  const users = {
    list: (query?: Record<string, string | number | boolean>, options?: RequestOptions) =>
      request<OperationResponse<operations['listUsers']>>('/users', {
        method: 'GET',
        query,
        ...options,
      }),
    create: (body: OperationRequestBody<operations['createUser']>, options?: RequestOptions) =>
      request<OperationResponse<operations['createUser']>>('/users', {
        method: 'POST',
        body,
        ...options,
      }),
    get: (id: string, options?: RequestOptions) =>
      request<OperationResponse<operations['getUser']>>(`/users/${id}`, {
        method: 'GET',
        ...options,
      }),
    update: (id: string, body: OperationRequestBody<operations['updateUser']>, options?: RequestOptions) =>
      request<OperationResponse<operations['updateUser']>>(`/users/${id}`, {
        method: 'PUT',
        body,
        ...options,
      }),
    suspend: (id: string, reason?: string, options?: RequestOptions) =>
      request<OperationResponse<operations['suspendUserAccount']>>(`/users/${id}/suspend`, {
        method: 'POST',
        body: { reason },
        ...options,
      }),
    reactivate: (id: string, options?: RequestOptions) =>
      request<OperationResponse<operations['reactivateUserAccount']>>(`/users/${id}/reactivate`, {
        method: 'POST',
        ...options,
      }),
    unlock: (id: string, options?: RequestOptions) =>
      request<OperationResponse<operations['unlockUserAccount']>>(`/users/${id}/unlock`, {
        method: 'POST',
        ...options,
      }),
  };

  const roles = {
    list: (options?: RequestOptions) =>
      request<OperationResponse<operations['listRoles']>>('/roles', {
        method: 'GET',
        ...options,
      }),
  };

  const roleAssignments = {
    list: (query?: Record<string, string | number | boolean>, options?: RequestOptions) =>
      request<OperationResponse<operations['listRoleAssignments']>>('/role-assignments', {
        method: 'GET',
        query,
        ...options,
      }),
    create: (body: OperationRequestBody<operations['createRoleAssignment']>, options?: RequestOptions) =>
      request<OperationResponse<operations['createRoleAssignment']>>('/role-assignments', {
        method: 'POST',
        body,
        ...options,
      }),
    delete: (id: string, options?: RequestOptions) =>
      request<void>(`/role-assignments/${id}`, {
        method: 'DELETE',
        ...options,
      }),
  };

  const impersonation = {
    start: (body: OperationRequestBody<operations['startImpersonation']>, options?: RequestOptions) =>
      request<OperationResponse<operations['startImpersonation']>>('/impersonation', {
        method: 'POST',
        body,
        ...options,
      }),
    stop: (options?: RequestOptions) =>
      request<OperationResponse<operations['stopImpersonation']>>('/impersonation/stop', {
        method: 'POST',
        ...options,
      }),
  };

  const identity = {
    users,
    roles,
    roleAssignments,
    impersonation,
  };

  // --- Organisation Sub-Helpers ---
  const streams = {
    list: (options?: RequestOptions) =>
      request<OperationResponse<operations['listStreams']>>('/streams', {
        method: 'GET',
        ...options,
      }),
    create: (body: OperationRequestBody<operations['createStream']>, options?: RequestOptions) =>
      request<OperationResponse<operations['createStream']>>('/streams', {
        method: 'POST',
        body,
        ...options,
      }),
    update: (id: string, body: OperationRequestBody<operations['updateStream']>, options?: RequestOptions) =>
      request<OperationResponse<operations['updateStream']>>(`/streams/${id}`, {
        method: 'PATCH',
        body,
        ...options,
      }),
    delete: (id: string, options?: RequestOptions) =>
      request<OperationResponse<operations['deleteStream']>>(`/streams/${id}`, {
        method: 'DELETE',
        ...options,
      }),
  };

  const departments = {
    list: (options?: RequestOptions) =>
      request<OperationResponse<operations['listDepartments']>>('/departments', {
        method: 'GET',
        ...options,
      }),
    create: (body: CreateDepartmentPayload, options?: RequestOptions) =>
      request<OperationResponse<operations['createDepartment']>>('/departments', {
        method: 'POST',
        body: body as Record<string, unknown>,
        ...options,
      }),
    get: (id: string, options?: RequestOptions) =>
      request<OperationResponse<operations['getDepartment']>>(`/departments/${id}`, {
        method: 'GET',
        ...options,
      }),
    update: (id: string, body: OperationRequestBody<operations['updateDepartment']>, options?: RequestOptions) =>
      request<OperationResponse<operations['updateDepartment']>>(`/departments/${id}`, {
        method: 'PUT',
        body,
        ...options,
      }),
  };

  const programs = {
    list: (options?: RequestOptions) =>
      request<OperationResponse<operations['listPrograms']>>('/programs', {
        method: 'GET',
        ...options,
      }),
    create: (body: OperationRequestBody<operations['createProgram']>, options?: RequestOptions) =>
      request<OperationResponse<operations['createProgram']>>('/programs', {
        method: 'POST',
        body,
        ...options,
      }),
    get: (id: string, options?: RequestOptions) =>
      request<OperationResponse<operations['getProgram']>>(`/programs/${id}`, {
        method: 'GET',
        ...options,
      }),
    update: (id: string, body: OperationRequestBody<operations['updateProgram']>, options?: RequestOptions) =>
      request<OperationResponse<operations['updateProgram']>>(`/programs/${id}`, {
        method: 'PUT',
        body,
        ...options,
      }),
  };

  const batches = {
    list: (options?: RequestOptions) =>
      request<OperationResponse<operations['listBatches']>>('/batches', {
        method: 'GET',
        ...options,
      }),
    create: (body: OperationRequestBody<operations['createBatch']>, options?: RequestOptions) =>
      request<OperationResponse<operations['createBatch']>>('/batches', {
        method: 'POST',
        body,
        ...options,
      }),
    get: (id: string, options?: RequestOptions) =>
      request<OperationResponse<operations['getBatch']>>(`/batches/${id}`, {
        method: 'GET',
        ...options,
      }),
    update: (id: string, body: OperationRequestBody<operations['updateBatch']>, options?: RequestOptions) =>
      request<OperationResponse<operations['updateBatch']>>(`/batches/${id}`, {
        method: 'PUT',
        body,
        ...options,
      }),
    promote: (id: string, options?: RequestOptions) =>
      request<OperationResponse<operations['promoteBatchSemester']>>(`/batches/${id}/promote-semester`, {
        method: 'POST',
        ...options,
      }),
  };

  const subBatches = {
    list: (batchId: string, options?: RequestOptions) =>
      request<OperationResponse<operations['listBatchSubBatches']>>(`/batches/${batchId}/sub-batches`, {
        method: 'GET',
        ...options,
      }),
    create: (batchId: string, body: OperationRequestBody<operations['createBatchSubBatch']>, options?: RequestOptions) =>
      request<OperationResponse<operations['createBatchSubBatch']>>(`/batches/${batchId}/sub-batches`, {
        method: 'POST',
        body,
        ...options,
      }),
    get: (id: string, options?: RequestOptions) =>
      request<OperationResponse<operations['getSubBatch']>>(`/sub-batches/${id}`, {
        method: 'GET',
        ...options,
      }),
    update: (id: string, body: OperationRequestBody<operations['updateSubBatch']>, options?: RequestOptions) =>
      request<OperationResponse<operations['updateSubBatch']>>(`/sub-batches/${id}`, {
        method: 'PUT',
        body,
        ...options,
      }),
    delete: (id: string, options?: RequestOptions) =>
      request<void>(`/sub-batches/${id}`, {
        method: 'DELETE',
        ...options,
      }),
  };

  const academicYears = {
    list: (options?: RequestOptions) =>
      request<OperationResponse<operations['listAcademicYears']>>('/academic-years', {
        method: 'GET',
        ...options,
      }),
    create: (body: OperationRequestBody<operations['createAcademicYear']>, options?: RequestOptions) =>
      request<OperationResponse<operations['createAcademicYear']>>('/academic-years', {
        method: 'POST',
        body,
        ...options,
      }),
    get: (id: string, options?: RequestOptions) =>
      request<OperationResponse<operations['getAcademicYear']>>(`/academic-years/${id}`, {
        method: 'GET',
        ...options,
      }),
    update: (id: string, body: OperationRequestBody<operations['updateAcademicYear']>, options?: RequestOptions) =>
      request<OperationResponse<operations['updateAcademicYear']>>(`/academic-years/${id}`, {
        method: 'PUT',
        body,
        ...options,
      }),
  };

  const governanceRules = {
    list: (options?: RequestOptions) =>
      request<OperationResponse<operations['listGovernanceRules']>>('/governance-rules', {
        method: 'GET',
        ...options,
      }),
    update: (id: string, body: OperationRequestBody<operations['updateGovernanceRule']>, options?: RequestOptions) =>
      request<OperationResponse<operations['updateGovernanceRule']>>(`/governance-rules/${id}`, {
        method: 'PUT',
        body,
        ...options,
      }),
  };

  // Additional lookups
  const regulations = {
    list: (options?: RequestOptions) =>
      request<OperationResponse<operations['listRegulations']>>('/regulations', {
        method: 'GET',
        ...options,
      }),
  };

  const workshopSections = {
    list: (options?: RequestOptions) =>
      request<OperationResponse<operations['listWorkshopSections']>>('/workshop-sections', {
        method: 'GET',
        ...options,
      }),
  };

  const setup = {
    status: (options?: RequestOptions) =>
      request<OperationResponse<operations['getSetupStatus']>>('/setup/status', {
        method: 'GET',
        ...options,
      }),
    saveStep: (
      step: 'institution_profile' | 'calendar_basics' | 'signup_policy',
      body: Record<string, unknown>,
      options?: RequestOptions
    ) =>
      request<OperationResponse<operations['saveSetupStep']>>(`/setup/steps/${step}`, {
        method: 'PUT',
        body,
        ...options,
      }),
    complete: (options?: RequestOptions) =>
      request<OperationResponse<operations['completeSetup']>>('/setup/complete', {
        method: 'POST',
        ...options,
      }),
  };

  const organisation = {
    streams,
    departments,
    programs,
    academicYears,
    batches,
    subBatches,
    governanceRules,
    regulations,
    workshopSections,
    setup,
  };

  return {
    config,
    request,

    // Required helper groups
    auth,
    identity,
    organisation,

    // Top-level aliases for direct access
    users,
    roles,
    roleAssignments,
    impersonation,
    streams,
    departments,
    programs,
    batches,
    subBatches,
    academicYears,
    governanceRules,
    regulations,
    workshopSections,
    setup,
    me: {
      get: (options?: RequestOptions) => auth.me(options),
    },
    health: {
      get: (options?: RequestOptions) =>
        request<OperationResponse<operations['getHealthStatus']>>('/health', {
          method: 'GET',
          ...options,
        }),
    },
    meta: {
      get: (options?: RequestOptions) =>
        request<OperationResponse<operations['getTenantMeta']>>('/meta', {
          method: 'GET',
          ...options,
        }),
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

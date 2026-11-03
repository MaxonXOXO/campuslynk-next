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

export function createApiClient(config: ApiClientConfig) {
  const fetchFn = config.fetchFn ?? fetch;
  const baseUrl = config.baseUrl.replace(/\/+$/, '');

  async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const { query, body, headers: customHeaders, ...init } = options;

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

  return {
    config,
    request,

    // Meta & Health
    health: {
      get: () =>
        request<OperationResponse<operations['getHealthStatus']>>('/health', {
          method: 'GET',
        }),
    },
    meta: {
      get: () =>
        request<OperationResponse<operations['getTenantMeta']>>('/meta', {
          method: 'GET',
        }),
    },

    // Authentication
    auth: {
      login: (body: OperationRequestBody<operations['login']>) =>
        request<OperationResponse<operations['login']>>('/auth/login', {
          method: 'POST',
          body,
        }),
      logout: () =>
        request<OperationResponse<operations['logout']>>('/auth/logout', {
          method: 'POST',
        }),
      changePassword: (body: OperationRequestBody<operations['changePassword']>) =>
        request<OperationResponse<operations['changePassword']>>('/auth/password/change', {
          method: 'POST',
          body,
        }),
    },

    // Current User
    me: {
      get: () =>
        request<OperationResponse<operations['getCurrentUser']>>('/me', {
          method: 'GET',
        }),
    },

    // Impersonation
    impersonation: {
      start: (body: OperationRequestBody<operations['startImpersonation']>) =>
        request<OperationResponse<operations['startImpersonation']>>('/impersonation', {
          method: 'POST',
          body,
        }),
      stop: () =>
        request<OperationResponse<operations['stopImpersonation']>>('/impersonation/stop', {
          method: 'POST',
        }),
    },

    // User Management
    users: {
      list: (query?: Record<string, string | number | boolean>) =>
        request<OperationResponse<operations['listUsers']>>('/users', {
          method: 'GET',
          query,
        }),
      create: (body: OperationRequestBody<operations['createUser']>) =>
        request<OperationResponse<operations['createUser']>>('/users', {
          method: 'POST',
          body,
        }),
      get: (id: string) =>
        request<OperationResponse<operations['getUser']>>(`/users/${id}`, {
          method: 'GET',
        }),
      update: (id: string, body: OperationRequestBody<operations['updateUser']>) =>
        request<OperationResponse<operations['updateUser']>>(`/users/${id}`, {
          method: 'PUT',
          body,
        }),
      suspend: (id: string, reason?: string) =>
        request<OperationResponse<operations['suspendUserAccount']>>(`/users/${id}/suspend`, {
          method: 'POST',
          body: { reason },
        }),
      reactivate: (id: string) =>
        request<OperationResponse<operations['reactivateUserAccount']>>(`/users/${id}/reactivate`, {
          method: 'POST',
        }),
      unlock: (id: string) =>
        request<OperationResponse<operations['unlockUserAccount']>>(`/users/${id}/unlock`, {
          method: 'POST',
        }),
    },

    // Roles & Role Assignments
    roles: {
      list: () =>
        request<OperationResponse<operations['listRoles']>>('/roles', {
          method: 'GET',
        }),
    },
    roleAssignments: {
      list: (query?: Record<string, string | number | boolean>) =>
        request<OperationResponse<operations['listRoleAssignments']>>('/role-assignments', {
          method: 'GET',
          query,
        }),
      create: (body: OperationRequestBody<operations['createRoleAssignment']>) =>
        request<OperationResponse<operations['createRoleAssignment']>>('/role-assignments', {
          method: 'POST',
          body,
        }),
      delete: (id: string) =>
        request<void>(`/role-assignments/${id}`, {
          method: 'DELETE',
        }),
    },

    // Departments
    departments: {
      list: () =>
        request<OperationResponse<operations['listDepartments']>>('/departments', {
          method: 'GET',
        }),
      create: (body: OperationRequestBody<operations['createDepartment']>) =>
        request<OperationResponse<operations['createDepartment']>>('/departments', {
          method: 'POST',
          body,
        }),
      get: (id: string) =>
        request<OperationResponse<operations['getDepartment']>>(`/departments/${id}`, {
          method: 'GET',
        }),
      update: (id: string, body: OperationRequestBody<operations['updateDepartment']>) =>
        request<OperationResponse<operations['updateDepartment']>>(`/departments/${id}`, {
          method: 'PUT',
          body,
        }),
    },

    // Programs
    programs: {
      list: () =>
        request<OperationResponse<operations['listPrograms']>>('/programs', {
          method: 'GET',
        }),
      create: (body: OperationRequestBody<operations['createProgram']>) =>
        request<OperationResponse<operations['createProgram']>>('/programs', {
          method: 'POST',
          body,
        }),
      get: (id: string) =>
        request<OperationResponse<operations['getProgram']>>(`/programs/${id}`, {
          method: 'GET',
        }),
      update: (id: string, body: OperationRequestBody<operations['updateProgram']>) =>
        request<OperationResponse<operations['updateProgram']>>(`/programs/${id}`, {
          method: 'PUT',
          body,
        }),
    },

    // Batches
    batches: {
      list: () =>
        request<OperationResponse<operations['listBatches']>>('/batches', {
          method: 'GET',
        }),
      create: (body: OperationRequestBody<operations['createBatch']>) =>
        request<OperationResponse<operations['createBatch']>>('/batches', {
          method: 'POST',
          body,
        }),
      get: (id: string) =>
        request<OperationResponse<operations['getBatch']>>(`/batches/${id}`, {
          method: 'GET',
        }),
      update: (id: string, body: OperationRequestBody<operations['updateBatch']>) =>
        request<OperationResponse<operations['updateBatch']>>(`/batches/${id}`, {
          method: 'PUT',
          body,
        }),
      promote: (id: string) =>
        request<OperationResponse<operations['promoteBatchSemester']>>(`/batches/${id}/promote-semester`, {
          method: 'POST',
        }),
    },

    // Sub-Batches
    subBatches: {
      list: (batchId: string) =>
        request<OperationResponse<operations['listBatchSubBatches']>>(`/batches/${batchId}/sub-batches`, {
          method: 'GET',
        }),
      create: (batchId: string, body: OperationRequestBody<operations['createBatchSubBatch']>) =>
        request<OperationResponse<operations['createBatchSubBatch']>>(`/batches/${batchId}/sub-batches`, {
          method: 'POST',
          body,
        }),
      get: (id: string) =>
        request<OperationResponse<operations['getSubBatch']>>(`/sub-batches/${id}`, {
          method: 'GET',
        }),
      update: (id: string, body: OperationRequestBody<operations['updateSubBatch']>) =>
        request<OperationResponse<operations['updateSubBatch']>>(`/sub-batches/${id}`, {
          method: 'PUT',
          body,
        }),
      delete: (id: string) =>
        request<void>(`/sub-batches/${id}`, {
          method: 'DELETE',
        }),
    },

    // Academic Years
    academicYears: {
      list: () =>
        request<OperationResponse<operations['listAcademicYears']>>('/academic-years', {
          method: 'GET',
        }),
      create: (body: OperationRequestBody<operations['createAcademicYear']>) =>
        request<OperationResponse<operations['createAcademicYear']>>('/academic-years', {
          method: 'POST',
          body,
        }),
      get: (id: string) =>
        request<OperationResponse<operations['getAcademicYear']>>(`/academic-years/${id}`, {
          method: 'GET',
        }),
      update: (id: string, body: OperationRequestBody<operations['updateAcademicYear']>) =>
        request<OperationResponse<operations['updateAcademicYear']>>(`/academic-years/${id}`, {
          method: 'PUT',
          body,
        }),
    },

    // Lookups
    regulations: {
      list: () =>
        request<OperationResponse<operations['listRegulations']>>('/regulations', {
          method: 'GET',
        }),
    },
    workshopSections: {
      list: () =>
        request<OperationResponse<operations['listWorkshopSections']>>('/workshop-sections', {
          method: 'GET',
        }),
    },
    governanceRules: {
      list: () =>
        request<OperationResponse<operations['listGovernanceRules']>>('/governance-rules', {
          method: 'GET',
        }),
      update: (id: string, body: OperationRequestBody<operations['updateGovernanceRule']>) =>
        request<OperationResponse<operations['updateGovernanceRule']>>(`/governance-rules/${id}`, {
          method: 'PUT',
          body,
        }),
    },
  };
}

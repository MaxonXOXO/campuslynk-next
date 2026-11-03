import { describe, it, expect, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createApiClient, ApiError, type ApiResponseEnvelope } from '../src/index.js';

describe('Academic Suite API Client', () => {
  it('confirms each required helper group and sub-helper exists with proper methods', () => {
    const client = createApiClient({ baseUrl: 'https://api.carmelpoly.in/api/v1' });

    // 1. Auth group: login, logout, changePassword, me
    expect(typeof client.auth.login).toBe('function');
    expect(typeof client.auth.logout).toBe('function');
    expect(typeof client.auth.changePassword).toBe('function');
    expect(typeof client.auth.me).toBe('function');

    // 2. Identity group: users, roles, roleAssignments, impersonation
    expect(typeof client.identity.users.list).toBe('function');
    expect(typeof client.identity.users.create).toBe('function');
    expect(typeof client.identity.users.get).toBe('function');
    expect(typeof client.identity.users.update).toBe('function');
    expect(typeof client.identity.users.suspend).toBe('function');
    expect(typeof client.identity.users.reactivate).toBe('function');
    expect(typeof client.identity.users.unlock).toBe('function');

    expect(typeof client.identity.roles.list).toBe('function');

    expect(typeof client.identity.roleAssignments.list).toBe('function');
    expect(typeof client.identity.roleAssignments.create).toBe('function');
    expect(typeof client.identity.roleAssignments.delete).toBe('function');

    expect(typeof client.identity.impersonation.start).toBe('function');
    expect(typeof client.identity.impersonation.stop).toBe('function');

    // 3. Organisation group: departments, programs, academicYears, batches, subBatches, governanceRules
    expect(typeof client.organisation.departments.list).toBe('function');
    expect(typeof client.organisation.departments.create).toBe('function');
    expect(typeof client.organisation.departments.get).toBe('function');
    expect(typeof client.organisation.departments.update).toBe('function');

    expect(typeof client.organisation.programs.list).toBe('function');
    expect(typeof client.organisation.programs.create).toBe('function');
    expect(typeof client.organisation.programs.get).toBe('function');
    expect(typeof client.organisation.programs.update).toBe('function');

    expect(typeof client.organisation.academicYears.list).toBe('function');
    expect(typeof client.organisation.academicYears.create).toBe('function');
    expect(typeof client.organisation.academicYears.get).toBe('function');
    expect(typeof client.organisation.academicYears.update).toBe('function');

    expect(typeof client.organisation.batches.list).toBe('function');
    expect(typeof client.organisation.batches.create).toBe('function');
    expect(typeof client.organisation.batches.get).toBe('function');
    expect(typeof client.organisation.batches.update).toBe('function');
    expect(typeof client.organisation.batches.promote).toBe('function');

    expect(typeof client.organisation.subBatches.list).toBe('function');
    expect(typeof client.organisation.subBatches.create).toBe('function');
    expect(typeof client.organisation.subBatches.get).toBe('function');
    expect(typeof client.organisation.subBatches.update).toBe('function');
    expect(typeof client.organisation.subBatches.delete).toBe('function');

    expect(typeof client.organisation.governanceRules.list).toBe('function');
    expect(typeof client.organisation.governanceRules.update).toBe('function');
  });

  it('attaches headers when token and tenant domain are provided', async () => {
    let capturedHeaders: Headers | undefined;

    const mockFetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({ data: { ok: true } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const client = createApiClient({
      baseUrl: 'https://api.carmelpoly.in/api/v1',
      getAccessToken: () => 'token_secret_xyz',
      getTenantDomain: () => 'carmelpoly.in',
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    await client.health.get({ idempotencyKey: 'idem-key-123' });

    expect(capturedHeaders?.get('Authorization')).toBe('Bearer token_secret_xyz');
    expect(capturedHeaders?.get('X-Tenant')).toBe('carmelpoly.in');
    expect(capturedHeaders?.get('Idempotency-Key')).toBe('idem-key-123');
    expect(capturedHeaders?.get('Accept')).toBe('application/json, application/problem+json');
  });

  it('omits Authorization and X-Tenant headers when tokens are not configured', async () => {
    let capturedHeaders: Headers | undefined;

    const mockFetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({ data: { ok: true } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const client = createApiClient({
      baseUrl: 'https://api.carmelpoly.in/api/v1',
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    await client.health.get();

    expect(capturedHeaders?.has('Authorization')).toBe(false);
    expect(capturedHeaders?.has('X-Tenant')).toBe(false);
    expect(capturedHeaders?.has('Idempotency-Key')).toBe(false);
  });

  it('successfully parses a 200 envelope with data, meta, and links', async () => {
    const envelopePayload: ApiResponseEnvelope<{ id: string; name: string }> = {
      data: {
        id: '01JH0123456789ABCDEF012345',
        name: 'Computer Engineering',
      },
      meta: {
        current_page: 1,
        total: 1,
      },
      links: {
        self: 'https://api.carmelpoly.in/api/v1/departments/01JH0123456789ABCDEF012345',
      },
    };

    const mockFetch = vi.fn(async () => {
      return new Response(JSON.stringify(envelopePayload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const client = createApiClient({
      baseUrl: 'https://api.carmelpoly.in/api/v1',
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const response = (await client.organisation.departments.get(
      '01JH0123456789ABCDEF012345'
    )) as ApiResponseEnvelope<{ id: string; name: string }>;

    expect(response).toEqual(envelopePayload);
    expect(response.data.name).toBe('Computer Engineering');
    expect(response.meta?.current_page).toBe(1);
    expect(response.links?.self ?? '').toContain('/departments/');
  });

  it('parses a 403 problem+json response into a strongly typed ApiError', async () => {
    const mockProblem = {
      type: 'https://api.academic-suite.com/errors/forbidden',
      title: 'Forbidden',
      status: 403,
      detail: 'Impersonation session is strictly read-only for all resources.',
      instance: '/api/v1/departments',
    };

    const mockFetch = vi.fn(async () => {
      return new Response(JSON.stringify(mockProblem), {
        status: 403,
        statusText: 'Forbidden',
        headers: { 'Content-Type': 'application/problem+json' },
      });
    });

    const client = createApiClient({
      baseUrl: 'https://api.carmelpoly.in/api/v1',
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    try {
      await client.organisation.departments.create({
        name: 'Automobile Engineering',
        code: 'AE',
        stream: 'engineering',
        kind: 'academic',
      });
      expect.fail('Should have thrown ApiError');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiError = err as ApiError;
      expect(apiError.status).toBe(403);
      expect(apiError.type).toBe('https://api.academic-suite.com/errors/forbidden');
      expect(apiError.title).toBe('Forbidden');
      expect(apiError.detail).toBe('Impersonation session is strictly read-only for all resources.');
      expect(apiError.problem.status).toBe(403);
    }
  });

  it('parses a 422 problem+json with errors into a strongly typed ApiError', async () => {
    const mockValidationProblem = {
      type: 'https://api.academic-suite.com/errors/unprocessable',
      title: 'Unprocessable Content',
      status: 422,
      detail: 'The given data was invalid.',
      instance: '/api/v1/role-assignments',
      errors: {
        order_reference: ['Assigning role [hod] requires an official order reference.'],
      },
    };

    const mockFetch = vi.fn(async () => {
      return new Response(JSON.stringify(mockValidationProblem), {
        status: 422,
        statusText: 'Unprocessable Entity',
        headers: { 'Content-Type': 'application/problem+json' },
      });
    });

    const client = createApiClient({
      baseUrl: 'https://api.carmelpoly.in/api/v1',
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    try {
      await client.identity.roleAssignments.create({
        user_id: '01JH0000000000000000000001',
        role_key: 'hod',
        scope_type: 'department',
        scope_label: 'me',
      });
      expect.fail('Should have thrown ApiError');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiError = err as ApiError;
      expect(apiError.status).toBe(422);
      expect(apiError.type).toBe('https://api.academic-suite.com/errors/unprocessable');
      expect(apiError.title).toBe('Unprocessable Content');
      expect(apiError.detail).toBe('The given data was invalid.');
      expect(apiError.errors).toHaveProperty('order_reference');
      const errMap = apiError.errors as Record<string, string[]>;
      expect(errMap.order_reference).toContain(
        'Assigning role [hod] requires an official order reference.'
      );
    }
  });

  it('degrades safely when receiving a non-JSON error response (e.g. 502 HTML or plain text)', async () => {
    const mockFetch = vi.fn(async () => {
      return new Response('<html><body>502 Bad Gateway</body></html>', {
        status: 502,
        statusText: 'Bad Gateway',
        headers: { 'Content-Type': 'text/html' },
      });
    });

    const client = createApiClient({
      baseUrl: 'https://api.carmelpoly.in/api/v1',
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    try {
      await client.auth.me();
      expect.fail('Should have thrown ApiError');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiError = err as ApiError;
      expect(apiError.status).toBe(502);
      expect(apiError.type).toBe('about:blank');
      expect(apiError.title).toBe('Bad Gateway');
      expect(apiError.detail ?? '').toContain('502 Bad Gateway');
    }
  });

  it('detects contract drift: every OpenAPI operation in openapi.yaml maps to a client helper', () => {
    const openapiPath = path.resolve(__dirname, '../../../../contracts/openapi.yaml');
    expect(fs.existsSync(openapiPath)).toBe(true);

    const openapiContent = fs.readFileSync(openapiPath, 'utf8');
    const operationRegex = /operationId:\s*([a-zA-Z0-9_]+)/g;
    const operationIds: string[] = [];

    let match: RegExpExecArray | null;
    while ((match = operationRegex.exec(openapiContent)) !== null) {
      if (match[1]) {
        operationIds.push(match[1]);
      }
    }

    expect(operationIds.length).toBeGreaterThan(0);

    const client = createApiClient({ baseUrl: 'https://example.com' });

    // Explicit operation-to-helper map
    const operationMap: Record<string, () => unknown> = {
      getHealthStatus: () => client.health.get,
      getTenantMeta: () => client.meta.get,
      login: () => client.auth.login,
      logout: () => client.auth.logout,
      changePassword: () => client.auth.changePassword,
      getCurrentUser: () => client.auth.me,
      startImpersonation: () => client.identity.impersonation.start,
      stopImpersonation: () => client.identity.impersonation.stop,
      listUsers: () => client.identity.users.list,
      createUser: () => client.identity.users.create,
      getUser: () => client.identity.users.get,
      updateUser: () => client.identity.users.update,
      unlockUserAccount: () => client.identity.users.unlock,
      suspendUserAccount: () => client.identity.users.suspend,
      reactivateUserAccount: () => client.identity.users.reactivate,
      listRoles: () => client.identity.roles.list,
      listRoleAssignments: () => client.identity.roleAssignments.list,
      createRoleAssignment: () => client.identity.roleAssignments.create,
      deleteRoleAssignment: () => client.identity.roleAssignments.delete,
      listDepartments: () => client.organisation.departments.list,
      createDepartment: () => client.organisation.departments.create,
      getDepartment: () => client.organisation.departments.get,
      updateDepartment: () => client.organisation.departments.update,
      listPrograms: () => client.organisation.programs.list,
      createProgram: () => client.organisation.programs.create,
      getProgram: () => client.organisation.programs.get,
      updateProgram: () => client.organisation.programs.update,
      listBatches: () => client.organisation.batches.list,
      createBatch: () => client.organisation.batches.create,
      getBatch: () => client.organisation.batches.get,
      updateBatch: () => client.organisation.batches.update,
      promoteBatchSemester: () => client.organisation.batches.promote,
      listBatchSubBatches: () => client.organisation.subBatches.list,
      createBatchSubBatch: () => client.organisation.subBatches.create,
      getSubBatch: () => client.organisation.subBatches.get,
      updateSubBatch: () => client.organisation.subBatches.update,
      deleteSubBatch: () => client.organisation.subBatches.delete,
      listAcademicYears: () => client.organisation.academicYears.list,
      createAcademicYear: () => client.organisation.academicYears.create,
      getAcademicYear: () => client.organisation.academicYears.get,
      updateAcademicYear: () => client.organisation.academicYears.update,
      listRegulations: () => client.organisation.regulations.list,
      listWorkshopSections: () => client.organisation.workshopSections.list,
      listGovernanceRules: () => client.organisation.governanceRules.list,
      updateGovernanceRule: () => client.organisation.governanceRules.update,
    };

    const missingOperations: string[] = [];
    for (const opId of operationIds) {
      if (!operationMap[opId] || typeof operationMap[opId]() !== 'function') {
        missingOperations.push(opId);
      }
    }

    expect(missingOperations).toEqual([]);
  });
});

import { describe, it, expect, vi } from 'vitest';
import { createApiClient, ApiError } from '../src/index.js';

describe('Academic Suite API Client', () => {
  it('sends correct authentication, tenant, and content-type headers', async () => {
    let capturedUrl = '';
    let capturedHeaders: Headers | undefined;

    const mockFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = input.toString();
      capturedHeaders = new Headers(init?.headers);

      return new Response(JSON.stringify({ data: { status: 'ok' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const client = createApiClient({
      baseUrl: 'https://api.carmelpoly.in/api/v1',
      getAccessToken: () => 'token_secret_123',
      getTenantDomain: () => 'carmelpoly.in',
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const result = await client.health.get();

    expect(capturedUrl).toBe('https://api.carmelpoly.in/api/v1/health');
    expect(capturedHeaders?.get('Authorization')).toBe('Bearer token_secret_123');
    expect(capturedHeaders?.get('X-Tenant')).toBe('carmelpoly.in');
    expect(capturedHeaders?.get('Accept')).toBe('application/json, application/problem+json');
    expect(result).toEqual({ data: { status: 'ok' } });
  });

  it('serializes JSON bodies and sets Content-Type header on POST requests', async () => {
    let capturedHeaders: Headers | undefined;
    let capturedBody: unknown;

    const mockFetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      capturedHeaders = new Headers(init?.headers);
      capturedBody = init?.body;

      return new Response(JSON.stringify({ data: { token: 'jwt_abc' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const client = createApiClient({
      baseUrl: 'https://api.carmelpoly.in/api/v1',
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    await client.auth.login({
      identifier: 'principal@carmelpoly.in',
      password: 'SecurePassword123!',
      client: 'web',
      device_name: 'test-agent-device',
    });

    expect(capturedHeaders?.get('Content-Type')).toBe('application/json');
    expect(capturedBody).toBe(
      JSON.stringify({
        identifier: 'principal@carmelpoly.in',
        password: 'SecurePassword123!',
        client: 'web',
        device_name: 'test-agent-device',
      })
    );
  });

  it('transparently parses 403 RFC 7807 problem details and throws typed ApiError', async () => {
    const mockProblemDetails = {
      type: 'https://api.academic-suite.com/errors/forbidden',
      title: 'Forbidden',
      status: 403,
      detail: 'You do not have permission to view this batch.',
      instance: '/api/v1/batches/01j7abc',
    };

    const mockFetch = vi.fn(async () => {
      return new Response(JSON.stringify(mockProblemDetails), {
        status: 403,
        statusText: 'Forbidden',
        headers: { 'Content-Type': 'application/problem+json' },
      });
    });

    const client = createApiClient({
      baseUrl: 'https://api.carmelpoly.in/api/v1',
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    await expect(client.batches.get('01j7abc')).rejects.toThrow(ApiError);

    try {
      await client.batches.get('01j7abc');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiError = err as ApiError;
      expect(apiError.status).toBe(403);
      expect(apiError.problem.type).toBe('https://api.academic-suite.com/errors/forbidden');
      expect(apiError.problem.title).toBe('Forbidden');
      expect(apiError.problem.detail).toBe('You do not have permission to view this batch.');
      expect(apiError.message).toBe('You do not have permission to view this batch.');
    }
  });

  it('synthesizes ProblemDetails when non-problem error response is returned (e.g. 502/500)', async () => {
    const mockFetch = vi.fn(async () => {
      return new Response('Bad Gateway', {
        status: 502,
        statusText: 'Bad Gateway',
        headers: { 'Content-Type': 'text/plain' },
      });
    });

    const client = createApiClient({
      baseUrl: 'https://api.carmelpoly.in/api/v1',
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    try {
      await client.meta.get();
      expect.fail('Should have thrown ApiError');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiError = err as ApiError;
      expect(apiError.status).toBe(502);
      expect(apiError.problem.title).toBe('Bad Gateway');
      expect(apiError.problem.detail).toBe('Bad Gateway');
    }
  });

  it('handles 204 No Content gracefully', async () => {
    const mockFetch = vi.fn(async () => {
      return new Response(null, {
        status: 204,
        statusText: 'No Content',
      });
    });

    const client = createApiClient({
      baseUrl: 'https://api.carmelpoly.in/api/v1',
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const result = await client.roleAssignments.delete('01j7xyz');
    expect(result).toBeUndefined();
  });
});

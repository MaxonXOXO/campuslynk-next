export interface HealthResponse {
  data: {
    status: string;
  };
  meta?: {
    timestamp: string;
    version: string;
  };
  links?: {
    self: string;
  };
}

export function getApiBaseUrl(): string {
  // INTERNAL_API_URL takes precedence in server components (e.g. inside Docker network)
  return process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
}

export async function fetchApiHealth(): Promise<{ ok: boolean; status: string; timestamp?: string; error?: string }> {
  const baseUrl = getApiBaseUrl().replace(/\/+$/, '');
  const targetUrl = `${baseUrl}/api/v1/health`;

  try {
    const res = await fetch(targetUrl, {
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      return {
        ok: false,
        status: `HTTP ${res.status}`,
        error: `API returned status ${res.status}`
      };
    }

    const payload = (await res.json()) as HealthResponse;
    return {
      ok: true,
      status: payload.data.status,
      timestamp: payload.meta?.timestamp
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown fetch error';
    return {
      ok: false,
      status: 'offline',
      error: message
    };
  }
}

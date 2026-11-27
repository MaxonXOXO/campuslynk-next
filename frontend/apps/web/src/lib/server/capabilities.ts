import type { ServerConfig } from "./config";
import type { FlowResult } from "./auth-flow";

/**
 * Extracts the client IP set by a trusted edge proxy (Caddy/nginx/ALB).
 * Never trusts or forwards a client-supplied X-Forwarded-For when not behind a trusted proxy.
 */
export function resolveEdgeForwardedFor(
  headers: Headers,
  isTrustedProxy: boolean
): string | undefined {
  if (!isTrustedProxy) {
    return undefined;
  }

  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) {
    return realIp;
  }

  const forwardedFor = headers.get("x-forwarded-for");
  if (!forwardedFor) {
    return undefined;
  }

  const parts = forwardedFor
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  return parts.length > 0 ? parts[parts.length - 1] : undefined;
}

export interface CapabilitiesFlowDeps {
  config: ServerConfig;
  fetchFn: typeof fetch;
  requestHeaders: Headers;
  trustEdgeProxy?: boolean;
}

export async function fetchCapabilitiesFlow(
  deps: CapabilitiesFlowDeps
): Promise<FlowResult> {
  const headers = new Headers({
    Accept: "application/json, application/problem+json",
  });

  if (deps.config.tenant) {
    headers.set("X-Tenant", deps.config.tenant);
  }

  const isTrustedProxy = deps.trustEdgeProxy ?? deps.config.isProduction;
  const edgeIp = resolveEdgeForwardedFor(deps.requestHeaders, isTrustedProxy);
  if (edgeIp) {
    headers.set("X-Forwarded-For", edgeIp);
  }

  try {
    const response = await deps.fetchFn(
      `${deps.config.backendBaseUrl}/api/v1/auth/capabilities`,
      {
        method: "GET",
        headers,
        redirect: "manual",
        cache: "no-store",
      }
    );

    let json: Record<string, unknown> = {};
    try {
      const parsed: unknown = await response.json();
      if (parsed && typeof parsed === "object") {
        json = parsed as Record<string, unknown>;
      }
    } catch {
      json = {};
    }

    return {
      status: response.status,
      body: json,
    };
  } catch {
    return {
      status: 502,
      body: { type: "about:blank", title: "Backend unreachable", status: 502 },
    };
  }
}


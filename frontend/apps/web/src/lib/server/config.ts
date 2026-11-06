/**
 * Server-only configuration for the same-origin auth/proxy layer.
 * Never import this from client components.
 */

export interface ServerConfig {
  /** Backend origin (and optional base path). The proxy never leaves this URL. */
  backendBaseUrl: string;
  /** Tenant slug sent as X-Tenant (set by the server, never by the browser). */
  tenant: string | null;
  /** Extra allowed Origin values for mutating requests (comma separated env). */
  allowedOrigins: string[];
  /** Device name recorded on the issued token (set by the server). */
  deviceName: string;
  isProduction: boolean;
}

export function getServerConfig(env: Record<string, string | undefined> = process.env): ServerConfig {
  const backend =
    env.BACKEND_BASE_URL || env.INTERNAL_API_URL || env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  return {
    backendBaseUrl: backend.replace(/\/+$/, ""),
    tenant: env.TENANT_SLUG?.trim() ? env.TENANT_SLUG.trim() : null,
    allowedOrigins: (env.APP_ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean),
    deviceName: "web-browser",
    isProduction: env.NODE_ENV === "production",
  };
}


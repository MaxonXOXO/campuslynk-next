/**
 * Pure safety rules for the same-origin API proxy.
 * - Only paths under /api/v1 may be forwarded, and only to the configured backend.
 * - Client-supplied credentials/tenant/host headers are never forwarded.
 * - Mutating requests must come from an allowed Origin.
 */

export class ProxyRejection extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "ProxyRejection";
    this.status = status;
  }
}

export const PROXY_PREFIX = "/api/proxy";
const ALLOWED_API_PREFIX = "/api/v1/";

/** Request headers that may be forwarded upstream (allow-list; everything else is dropped). */
const FORWARDED_REQUEST_HEADERS = ["accept-language", "content-type", "idempotency-key", "if-none-match"];

/** Response headers that may be returned to the browser. */
const FORWARDED_RESPONSE_HEADERS = ["content-type", "retry-after", "etag", "content-language"];

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
function hasControlChars(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

/**
 * Validate a raw (still percent-encoded) path+search such as "/api/v1/setup/status?x=1"
 * and resolve it against the configured backend. Throws ProxyRejection when unsafe.
 */
export function resolveProxyTarget(rawPath: string, backendBaseUrl: string): URL {
  const queryIndex = rawPath.indexOf("?");
  const pathPart = queryIndex === -1 ? rawPath : rawPath.slice(0, queryIndex);
  const search = queryIndex === -1 ? "" : rawPath.slice(queryIndex);

  if (!pathPart.startsWith(ALLOWED_API_PREFIX)) {
    throw new ProxyRejection("Only /api/v1 paths may be proxied.", 400);
  }

  // Check the raw form and the decoded form (single decode). A second layer of
  // encoding is rejected outright rather than decoded repeatedly.
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathPart);
  } catch {
    throw new ProxyRejection("Malformed path encoding.", 400);
  }

  if (/%[0-9a-f]{2}/i.test(decoded)) {
    throw new ProxyRejection("Double-encoded paths are not allowed.", 400);
  }

  for (const candidate of [pathPart, decoded]) {
    if (candidate.includes("\\") || hasControlChars(candidate)) {
      throw new ProxyRejection("Illegal characters in path.", 400);
    }
    if (candidate.includes("//") || candidate.includes("://")) {
      throw new ProxyRejection("Absolute or empty path segments are not allowed.", 400);
    }
    if (candidate.split("/").some((segment) => segment === ".." || segment === ".")) {
      throw new ProxyRejection("Path traversal is not allowed.", 400);
    }
  }

  // Auth endpoints are served only by /api/session/* so that client and device_name are server-set.
  for (const candidate of [pathPart, decoded]) {
    if (/^\/api\/v1\/auth(\/|$)/i.test(candidate)) {
      throw new ProxyRejection("Auth endpoints are not available through the proxy.", 403);
    }
  }

  const base = new URL(backendBaseUrl);
  const basePath = base.pathname.replace(/\/+$/, "");
  const target = new URL(`${base.origin}${basePath}${pathPart}${search}`);

  if (target.origin !== base.origin || !target.pathname.startsWith(`${basePath}${ALLOWED_API_PREFIX}`)) {
    throw new ProxyRejection("Resolved target escapes the configured backend.", 400);
  }

  return target;
}

/** Extract the raw path+search following the proxy prefix from a request URL. */
export function extractProxyPath(requestUrl: string): string {
  const url = new URL(requestUrl);
  if (!url.pathname.startsWith(PROXY_PREFIX)) {
    throw new ProxyRejection("Not a proxy path.", 400);
  }
  return `${url.pathname.slice(PROXY_PREFIX.length)}${url.search}`;
}

export interface UpstreamHeaderOptions {
  token?: string | null;
  tenant?: string | null;
}

/** Build upstream headers from an allow-list; Authorization/X-Tenant/Host are always server-set. */
export function buildUpstreamHeaders(incoming: Headers, options: UpstreamHeaderOptions): Headers {
  const headers = new Headers();

  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = incoming.get(name);
    if (value) headers.set(name, value);
  }

  // Always request JSON: a client Accept such as */* would make the backend answer with HTML redirects.
  headers.set("Accept", "application/json, application/problem+json");

  if (options.token) headers.set("Authorization", `Bearer ${options.token}`);
  if (options.tenant) headers.set("X-Tenant", options.tenant);

  return headers;
}

export function filterResponseHeaders(upstream: Headers): Headers {
  const headers = new Headers();
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = upstream.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("Cache-Control", "no-store");
  return headers;
}

export interface OriginCheckInput {
  method: string;
  origin: string | null;
  host: string | null;
  allowedOrigins?: string[];
}

/** Mutating requests must carry an Origin that matches the app host or an allow-listed origin. */
export function isOriginAllowed({ method, origin, host, allowedOrigins = [] }: OriginCheckInput): boolean {
  if (!MUTATING_METHODS.has(method.toUpperCase())) return true;
  if (!origin) return false;

  if (allowedOrigins.includes(origin)) return true;

  try {
    return host !== null && new URL(origin).host === host;
  } catch {
    return false;
  }
}

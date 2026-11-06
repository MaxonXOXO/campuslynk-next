import { getServerConfig } from "./config";
import {
  ProxyRejection,
  buildUpstreamHeaders,
  extractProxyPath,
  filterResponseHeaders,
  isOriginAllowed,
  resolveProxyTarget,
} from "./proxy-guard";
import { TOKEN_COOKIE } from "./session-cookie";

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) {
      const raw = rest.join("=");
      if (!raw) return null;
      // Next percent-encodes cookie values (Sanctum tokens contain "|").
      try {
        return decodeURIComponent(raw);
      } catch {
        return null;
      }
    }
  }
  return null;
}

/**
 * Forward a same-origin browser request to the backend. The token comes from the httpOnly
 * cookie; Authorization, X-Tenant and Host are always set here, never taken from the client.
 */
export async function handleProxyRequest(request: Request, fetchFn: typeof fetch = fetch): Promise<Response> {
  const config = getServerConfig();

  const reject = (status: number, title: string) =>
    new Response(JSON.stringify({ type: "about:blank", title, status }), {
      status,
      headers: { "Content-Type": "application/problem+json", "Cache-Control": "no-store" },
    });

  if (
    !isOriginAllowed({
      method: request.method,
      origin: request.headers.get("origin"),
      host: request.headers.get("host"),
      allowedOrigins: config.allowedOrigins,
    })
  ) {
    return reject(403, "Cross-origin request rejected");
  }

  let target: URL;
  try {
    target = resolveProxyTarget(extractProxyPath(request.url), config.backendBaseUrl);
  } catch (error) {
    if (error instanceof ProxyRejection) return reject(error.status, error.message);
    return reject(400, "Invalid proxy path");
  }

  const token = readCookie(request.headers.get("cookie"), TOKEN_COOKIE);
  const headers = buildUpstreamHeaders(request.headers, { token, tenant: config.tenant });
  const hasBody = !["GET", "HEAD"].includes(request.method.toUpperCase());

  try {
    const upstream = await fetchFn(target.toString(), {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
      redirect: "manual",
      cache: "no-store",
    });

    return new Response(upstream.status === 204 ? null : upstream.body, {
      status: upstream.status,
      headers: filterResponseHeaders(upstream.headers),
    });
  } catch {
    return reject(502, "Backend unreachable");
  }
}

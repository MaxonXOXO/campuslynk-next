import { getServerConfig } from "./config";
import { buildUpstreamHeaders, filterResponseHeaders, isOriginAllowed } from "./proxy-guard";
import { TOKEN_COOKIE } from "./session-cookie";

export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
const SAFE_USER_ID = /^[0-9A-Za-z_-]{1,64}$/;

function readTokenFromRequest(request: Request): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === TOKEN_COOKIE) {
      const raw = rest.join("=");
      if (!raw) return null;
      try {
        return decodeURIComponent(raw);
      } catch {
        return null;
      }
    }
  }
  return null;
}

function problemResponse(status: number, title: string, detail?: string): Response {
  return new Response(
    JSON.stringify({
      type: "about:blank",
      title,
      status,
      ...(detail ? { detail } : {}),
    }),
    {
      status,
      headers: {
        "Content-Type": "application/problem+json",
        "Cache-Control": "no-store",
      },
    }
  );
}

export async function handleAvatarUpload(
  request: Request,
  fetchFn: typeof fetch = fetch
): Promise<Response> {
  const config = getServerConfig();

  if (
    !isOriginAllowed({
      method: request.method,
      origin: request.headers.get("origin"),
      host: request.headers.get("host"),
      allowedOrigins: config.allowedOrigins,
    })
  ) {
    return problemResponse(403, "Cross-origin request rejected");
  }

  const token = readTokenFromRequest(request);
  if (!token) {
    return problemResponse(401, "Unauthenticated");
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > AVATAR_MAX_BYTES + 512 * 1024) {
    return problemResponse(422, "File too large", "Avatar must not exceed 5 MB.");
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return problemResponse(422, "Invalid multipart request");
  }

  const file = formData.get("avatar");
  if (!(file instanceof Blob) || file.size <= 0) {
    return problemResponse(422, "Invalid avatar", "Please select an image file.");
  }

  if (file.size > AVATAR_MAX_BYTES) {
    return problemResponse(422, "File too large", "Avatar must not exceed 5 MB.");
  }

  const upstreamForm = new FormData();
  upstreamForm.append("avatar", file, file instanceof File ? file.name : "avatar");

  const headers = buildUpstreamHeaders(request.headers, { token, tenant: config.tenant });
  headers.delete("content-type");
  headers.delete("content-length");
  headers.set("accept", "application/json");

  try {
    const upstream = await fetchFn(`${config.backendBaseUrl}/api/v1/me/avatar`, {
      method: "POST",
      headers,
      body: upstreamForm,
      redirect: "manual",
      cache: "no-store",
    });

    return new Response(upstream.status === 204 ? null : upstream.body, {
      status: upstream.status,
      headers: filterResponseHeaders(upstream.headers),
    });
  } catch {
    return problemResponse(502, "Backend unreachable");
  }
}

export async function handleAvatarDelete(
  request: Request,
  fetchFn: typeof fetch = fetch
): Promise<Response> {
  const config = getServerConfig();

  if (
    !isOriginAllowed({
      method: request.method,
      origin: request.headers.get("origin"),
      host: request.headers.get("host"),
      allowedOrigins: config.allowedOrigins,
    })
  ) {
    return problemResponse(403, "Cross-origin request rejected");
  }

  const token = readTokenFromRequest(request);
  if (!token) {
    return problemResponse(401, "Unauthenticated");
  }

  const headers = buildUpstreamHeaders(request.headers, { token, tenant: config.tenant });
  headers.set("accept", "application/json");

  try {
    const upstream = await fetchFn(`${config.backendBaseUrl}/api/v1/me/avatar`, {
      method: "DELETE",
      headers,
      redirect: "manual",
      cache: "no-store",
    });

    return new Response(upstream.status === 204 ? null : upstream.body, {
      status: upstream.status,
      headers: filterResponseHeaders(upstream.headers),
    });
  } catch {
    return problemResponse(502, "Backend unreachable");
  }
}

export async function handleUserAvatarGet(
  request: Request,
  userId: string,
  fetchFn: typeof fetch = fetch
): Promise<Response> {
  if (!SAFE_USER_ID.test(userId)) {
    return problemResponse(400, "Invalid user identifier");
  }

  const token = readTokenFromRequest(request);
  if (!token) {
    return problemResponse(401, "Unauthenticated");
  }

  const config = getServerConfig();
  const headers = buildUpstreamHeaders(request.headers, { token, tenant: config.tenant });
  const ifNoneMatch = request.headers.get("if-none-match");
  if (ifNoneMatch) {
    headers.set("if-none-match", ifNoneMatch);
  }

  try {
    const upstream = await fetchFn(
      `${config.backendBaseUrl}/api/v1/users/${encodeURIComponent(userId)}/avatar`,
      {
        method: "GET",
        headers,
        redirect: "manual",
        cache: "no-store",
      }
    );

    const responseHeaders = filterResponseHeaders(upstream.headers);
    responseHeaders.set("x-content-type-options", "nosniff");

    return new Response(upstream.status === 304 || upstream.status === 204 ? null : upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch {
    return problemResponse(502, "Backend unreachable");
  }
}


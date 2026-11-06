import { NextResponse } from "next/server";
import { getServerConfig } from "./config";
import { isOriginAllowed } from "./proxy-guard";
import type { FlowResult } from "./auth-flow";

const NO_STORE = { "Cache-Control": "no-store" };

export function problem(status: number, title: string): NextResponse {
  return NextResponse.json({ type: "about:blank", title, status }, { status, headers: NO_STORE });
}

/** Returns a 403 response when a mutating request has a foreign or missing Origin. */
export function rejectForeignOrigin(request: Request): NextResponse | null {
  const config = getServerConfig();
  const allowed = isOriginAllowed({
    method: request.method,
    origin: request.headers.get("origin"),
    host: request.headers.get("host"),
    allowedOrigins: config.allowedOrigins,
  });

  return allowed ? null : problem(403, "Cross-origin request rejected");
}

export function flowResponse(result: FlowResult): NextResponse {
  const headers = new Headers(NO_STORE);
  if (result.retryAfter) headers.set("Retry-After", result.retryAfter);
  return NextResponse.json(result.body, { status: result.status, headers });
}

export async function readStringFields<T extends string>(request: Request, fields: readonly T[]): Promise<Record<T, string> | null> {
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object") return null;

  const result = {} as Record<T, string>;
  for (const field of fields) {
    const value = (parsed as Record<string, unknown>)[field];
    if (typeof value !== "string" || value.length === 0 || value.length > 256) return null;
    result[field] = value;
  }
  return result;
}

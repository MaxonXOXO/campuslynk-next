import { cookies } from "next/headers";
import { getServerConfig } from "@/lib/server/config";
import { changePasswordFlow } from "@/lib/server/auth-flow";
import { flowResponse, problem, rejectForeignOrigin } from "@/lib/server/route-utils";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const foreign = rejectForeignOrigin(request);
  if (foreign) return foreign;

  let parsed: Record<string, unknown> | null = null;
  try {
    const raw: unknown = await request.json();
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      parsed = raw as Record<string, unknown>;
    }
  } catch {
    parsed = null;
  }

  const currentPassword = parsed && typeof parsed.current_password === "string" ? parsed.current_password : "";
  const newPassword = parsed && typeof parsed.new_password === "string" ? parsed.new_password : "";
  if (
    currentPassword.length === 0 ||
    currentPassword.length > 256 ||
    newPassword.length === 0 ||
    newPassword.length > 256
  ) {
    return problem(422, "Invalid request");
  }

  const revokeOtherSessions =
    parsed && typeof parsed.revoke_other_sessions === "boolean"
      ? parsed.revoke_other_sessions
      : true;

  const result = await changePasswordFlow(
    { config: getServerConfig(), fetchFn: fetch, cookies: await cookies() },
    currentPassword,
    newPassword,
    revokeOtherSessions
  );

  return flowResponse(result);
}


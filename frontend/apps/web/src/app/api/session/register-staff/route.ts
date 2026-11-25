import { cookies } from "next/headers";
import { getServerConfig } from "@/lib/server/config";
import { registerStaffFlow } from "@/lib/server/auth-flow";
import { flowResponse, problem, rejectForeignOrigin } from "@/lib/server/route-utils";

export const dynamic = "force-dynamic";

function optionalString(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

export async function POST(request: Request) {
  const foreign = rejectForeignOrigin(request);
  if (foreign) return foreign;

  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return problem(422, "Invalid request body");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return problem(422, "Invalid request body");
  }

  const record = parsed as Record<string, unknown>;
  const name = typeof record.name === "string" ? record.name.trim() : "";
  const password = typeof record.password === "string" ? record.password : "";
  const email = optionalString(record.email);
  const mobile = optionalString(record.mobile);

  if (name === "" || password === "" || (!email && !mobile)) {
    return problem(422, "Name, password, and either email or mobile are required.");
  }

  const result = await registerStaffFlow(
    { config: getServerConfig(), fetchFn: fetch, cookies: await cookies() },
    {
      name,
      email,
      mobile,
      password,
      requested_department_id: null,
      designation: optionalString(record.designation),
      employee_id: optionalString(record.employee_id),
      website: optionalString(record.website),
    }
  );

  return flowResponse(result);
}


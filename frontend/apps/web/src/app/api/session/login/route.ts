import { cookies } from "next/headers";
import { getServerConfig } from "@/lib/server/config";
import { loginFlow } from "@/lib/server/auth-flow";
import { flowResponse, problem, readStringFields, rejectForeignOrigin } from "@/lib/server/route-utils";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const foreign = rejectForeignOrigin(request);
  if (foreign) return foreign;

  const fields = await readStringFields(request, ["identifier", "password"]);
  if (!fields) return problem(422, "Invalid request");

  const result = await loginFlow(
    { config: getServerConfig(), fetchFn: fetch, cookies: await cookies() },
    fields.identifier.trim(),
    fields.password
  );

  return flowResponse(result);
}


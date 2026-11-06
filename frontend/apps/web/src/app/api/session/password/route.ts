import { cookies } from "next/headers";
import { getServerConfig } from "@/lib/server/config";
import { changePasswordFlow } from "@/lib/server/auth-flow";
import { flowResponse, problem, readStringFields, rejectForeignOrigin } from "@/lib/server/route-utils";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const foreign = rejectForeignOrigin(request);
  if (foreign) return foreign;

  const fields = await readStringFields(request, ["current_password", "new_password"]);
  if (!fields) return problem(422, "Invalid request");

  const result = await changePasswordFlow(
    { config: getServerConfig(), fetchFn: fetch, cookies: await cookies() },
    fields.current_password,
    fields.new_password
  );

  return flowResponse(result);
}


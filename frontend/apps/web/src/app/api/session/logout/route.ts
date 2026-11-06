import { cookies } from "next/headers";
import { getServerConfig } from "@/lib/server/config";
import { logoutFlow } from "@/lib/server/auth-flow";
import { flowResponse, rejectForeignOrigin } from "@/lib/server/route-utils";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const foreign = rejectForeignOrigin(request);
  if (foreign) return foreign;

  const result = await logoutFlow({ config: getServerConfig(), fetchFn: fetch, cookies: await cookies() });
  return flowResponse(result);
}


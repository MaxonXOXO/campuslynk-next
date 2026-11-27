import { NextResponse } from "next/server";
import { getServerConfig } from "@/lib/server/config";
import { fetchCapabilitiesFlow } from "@/lib/server/capabilities";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const config = getServerConfig();
  const trustEdgeProxy =
    process.env.TRUST_EDGE_PROXY === "true" || config.isProduction;

  const result = await fetchCapabilitiesFlow({
    config,
    fetchFn: fetch,
    requestHeaders: request.headers,
    trustEdgeProxy,
  });

  return NextResponse.json(result.body, {
    status: result.status,
    headers: {
      "Cache-Control": "private, no-store",
      Vary: "X-Tenant",
    },
  });
}


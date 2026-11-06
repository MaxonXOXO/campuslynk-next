import { handleProxyRequest } from "@/lib/server/proxy-handler";

export const dynamic = "force-dynamic";

export const GET = (request: Request) => handleProxyRequest(request);
export const POST = (request: Request) => handleProxyRequest(request);
export const PUT = (request: Request) => handleProxyRequest(request);
export const PATCH = (request: Request) => handleProxyRequest(request);
export const DELETE = (request: Request) => handleProxyRequest(request);


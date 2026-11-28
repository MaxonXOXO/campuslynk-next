import { handleUserAvatarGet } from "@/lib/server/avatar-proxy";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  return handleUserAvatarGet(request, id);
}


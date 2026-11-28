import { handleAvatarDelete, handleAvatarUpload } from "@/lib/server/avatar-proxy";

export const dynamic = "force-dynamic";

export const POST = (request: Request) => handleAvatarUpload(request);
export const DELETE = (request: Request) => handleAvatarDelete(request);


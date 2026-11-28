"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Skeleton } from "@academic-suite/ui";
import { useSession } from "@/lib/auth/session-provider";

export default function RootPage() {
  const { state } = useSession();
  const router = useRouter();

  React.useEffect(() => {
    if (state.status === "authenticated") {
      router.replace("/home");
    } else if (state.status === "unauthenticated") {
      router.replace("/login");
    }
  }, [state.status, router]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm space-y-3" aria-label="Loading session">
        <Skeleton className="h-8 w-40 mx-auto" />
        <Skeleton className="h-4 w-56 mx-auto" />
      </div>
    </main>
  );
}

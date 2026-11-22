"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Button,
  buttonVariants,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
} from "@academic-suite/ui";
import { AuthGuard } from "@/lib/auth/auth-guard";
import { useSession } from "@/lib/auth/session-provider";
import { authStrings } from "@/lib/auth/strings";
import { getLandingWorkspace } from "@/lib/workspaces/workspaces";
import { isSuperAdminAtInstitutionScope } from "@/app/setup/logic/role-routing";

function HomeContent() {
  const { state, controller } = useSession();
  const router = useRouter();
  const user = state.user;
  const landingWorkspace = React.useMemo(() => getLandingWorkspace(user), [user]);

  React.useEffect(() => {
    if (landingWorkspace) {
      router.replace(`/w/${landingWorkspace.slug}`);
    }
  }, [landingWorkspace, router]);

  if (landingWorkspace) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4 bg-background" aria-busy="true">
        <div className="w-full max-w-md space-y-3">
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-24 w-full" />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4 sm:p-8 bg-background text-foreground">
      <Card className="w-full max-w-md border-border shadow-sm">
        <CardHeader>
          <CardTitle className="text-2xl font-bold tracking-tight">
            {authStrings.home.title}
            {user?.name ? `, ${user.name}` : ""}
          </CardTitle>
          <CardDescription>{authStrings.home.description}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {isSuperAdminAtInstitutionScope(user) && (
            <Button type="button" onClick={() => router.push("/setup")}>
              {authStrings.home.openSetup}
            </Button>
          )}
          <Link
            href="/change-password"
            className={buttonVariants({ variant: "outline" })}
          >
            Change password
          </Link>
          <Button type="button" variant="outline" onClick={() => void controller.logout()}>
            {authStrings.home.logout}
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}

export default function HomePage() {
  return (
    <AuthGuard>
      <HomeContent />
    </AuthGuard>
  );
}

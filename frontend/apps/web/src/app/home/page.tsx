"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@academic-suite/ui";
import { AuthGuard } from "@/lib/auth/auth-guard";
import { useSession } from "@/lib/auth/session-provider";
import { authStrings } from "@/lib/auth/strings";
import { isSuperAdminAtInstitutionScope } from "@/app/setup/logic/role-routing";

function HomeContent() {
  const { state, controller } = useSession();
  const router = useRouter();
  const user = state.user;

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
        <CardContent className="flex flex-col gap-2 sm:flex-row">
          {isSuperAdminAtInstitutionScope(user) && (
            <Button type="button" onClick={() => router.push("/setup")}>
              {authStrings.home.openSetup}
            </Button>
          )}
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

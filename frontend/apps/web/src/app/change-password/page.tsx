"use client";

import * as React from "react";
import { AuthGuard } from "@/lib/auth/auth-guard";
import { ChangePasswordForm } from "@/components/auth/ChangePasswordForm";

export default function ChangePasswordPage() {
  return (
    <AuthGuard>
      <main className="min-h-screen flex items-center justify-center p-4 sm:p-8 bg-background text-foreground">
        <ChangePasswordForm mode="forced" />
      </main>
    </AuthGuard>
  );
}

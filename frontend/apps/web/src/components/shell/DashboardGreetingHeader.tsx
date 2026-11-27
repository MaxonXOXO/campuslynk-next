"use client";

import * as React from "react";
import { PageHeader } from "@academic-suite/ui";
import { useSession } from "@/lib/auth/session-provider";

export function getTimeOfDayGreeting(hour: number): string {
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  if (hour >= 17 && hour < 21) return "Good evening";
  return "Welcome back";
}

export function formatGreetingTitle(greeting: string, name?: string | null): string {
  const trimmed = name?.trim();
  return trimmed ? `${greeting}, ${trimmed}` : greeting;
}

export interface DashboardGreetingHeaderProps {
  description?: string;
  actions?: React.ReactNode;
}

export function DashboardGreetingHeader({
  description,
  actions,
}: DashboardGreetingHeaderProps) {
  const { state } = useSession();
  const displayName = state.user?.first_name?.trim() || state.user?.name;
  const [greeting, setGreeting] = React.useState<string>("Welcome");

  React.useEffect(() => {
    setGreeting(getTimeOfDayGreeting(new Date().getHours()));
  }, []);

  return (
    <PageHeader
      title={formatGreetingTitle(greeting, displayName)}
      description={description}
      actions={actions}
    />
  );
}


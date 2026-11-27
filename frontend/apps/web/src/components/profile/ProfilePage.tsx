"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  PageHeader,
  cn,
} from "@academic-suite/ui";
import { RiShieldKeyholeLine, RiUser3Line } from "@remixicon/react";

export type ProfileSectionId = "personal" | "security";

const PROFILE_SECTIONS: ReadonlyArray<{
  id: ProfileSectionId;
  label: string;
  description: string;
}> = [
  {
    id: "personal",
    label: "Personal info",
    description: "Name, avatar initials, and read-only institutional contact details.",
  },
  {
    id: "security",
    label: "Security",
    description: "Password management and active device sessions.",
  },
];

export function resolveProfileSection(raw: string | null): ProfileSectionId {
  return raw === "security" ? "security" : "personal";
}

export function ProfilePage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeSection = resolveProfileSection(searchParams.get("section"));

  function selectSection(sectionId: ProfileSectionId) {
    const params = new URLSearchParams(searchParams.toString());
    if (sectionId === "personal") {
      params.delete("section");
    } else {
      params.set("section", sectionId);
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Profile &amp; Settings"
        description="Manage your personal display name, password, and signed-in devices."
      />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[240px_minmax(0,1fr)]">
        <nav
          aria-label="Profile sections"
          className="flex flex-row gap-2 overflow-x-auto md:flex-col md:space-y-1 md:gap-0"
        >
          {PROFILE_SECTIONS.map((section) => {
            const Icon =
              section.id === "security" ? RiShieldKeyholeLine : RiUser3Line;
            const isActive = activeSection === section.id;
            return (
              <button
                key={section.id}
                type="button"
                aria-current={isActive ? "page" : undefined}
                onClick={() => selectSection(section.id)}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium whitespace-nowrap transition-colors",
                  "outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-foreground hover:bg-muted/60"
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                <span>{section.label}</span>
              </button>
            );
          })}
        </nav>

        <section aria-label="Profile section content" className="min-w-0 space-y-6">
          {activeSection === "personal" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Personal info</CardTitle>
                <CardDescription>
                  Update your first and last name.
                </CardDescription>
              </CardHeader>
              <CardContent />
            </Card>
          )}

          {activeSection === "security" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Security</CardTitle>
                <CardDescription>
                  Update your password and manage active sessions.
                </CardDescription>
              </CardHeader>
              <CardContent />
            </Card>
          )}
        </section>
      </div>
    </div>
  );
}


import * as React from "react";
import { ControlPanelPage } from "@/components/super-admin/ControlPanelPage";
import { Skeleton } from "@academic-suite/ui";

export default function SuperAdminControlPanelRoutePage() {
  return (
    <React.Suspense
      fallback={
        <div className="space-y-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-96 w-full" />
        </div>
      }
    >
      <ControlPanelPage />
    </React.Suspense>
  );
}

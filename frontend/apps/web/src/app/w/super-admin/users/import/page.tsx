import * as React from "react";
import { StaffImportWizard } from "@/components/users/StaffImportWizard";

export default function SuperAdminUsersImportRoute() {
  return (
    <React.Suspense fallback={null}>
      <StaffImportWizard usersHref="/w/super-admin/users" />
    </React.Suspense>
  );
}


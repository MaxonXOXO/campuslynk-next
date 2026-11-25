import * as React from "react";
import { StaffImportWizard } from "@/components/users/StaffImportWizard";

export default function PrincipalUsersImportRoute() {
  return (
    <React.Suspense fallback={null}>
      <StaffImportWizard usersHref="/w/principal/users" />
    </React.Suspense>
  );
}


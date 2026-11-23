"use client";

import { UserDirectory } from "@/components/users/UserDirectory";

export function PrincipalUsersPage() {
  return (
    <UserDirectory
      title="Users"
      description="Browse institutional accounts, create new users, and manage permitted account actions."
      gateByCapabilities
    />
  );
}


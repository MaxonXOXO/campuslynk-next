"use client";

import { UserDirectory } from "@/components/users/UserDirectory";

export function PrincipalUsersPage() {
  return (
    <UserDirectory
      title="Users"
      description="Browse institutional accounts, create new users, approve pending registrations, and manage account lifecycle."
    />
  );
}

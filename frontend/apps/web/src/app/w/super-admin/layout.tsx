import { WorkspaceShellLayout } from "@/components/shell/WorkspaceShellLayout";

export default function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <WorkspaceShellLayout workspace="super-admin">
      {children}
    </WorkspaceShellLayout>
  );
}


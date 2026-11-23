import { WorkspaceShellLayout } from "@/components/shell/WorkspaceShellLayout";

export default function PrincipalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <WorkspaceShellLayout workspace="principal">
      {children}
    </WorkspaceShellLayout>
  );
}


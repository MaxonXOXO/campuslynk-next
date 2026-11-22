import { WorkspaceShellLayout } from "@/components/shell/WorkspaceShellLayout";

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ workspace: string }>;
}) {
  const { workspace } = await params;
  return (
    <WorkspaceShellLayout workspace={workspace}>
      {children}
    </WorkspaceShellLayout>
  );
}


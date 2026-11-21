import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  PageHeader,
} from "@academic-suite/ui";
import { WORKSPACE_META, isWorkspaceSlug } from "@/lib/workspaces/workspaces";

export default async function WorkspacePlaceholderPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace } = await params;
  const meta = isWorkspaceSlug(workspace) ? WORKSPACE_META[workspace] : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={meta?.label ?? "Workspace"}
        description={meta?.description ?? "Role-scoped workspace overview."}
        actions={<Badge variant="outline">Preview</Badge>}
      />

      <Card>
        <CardHeader>
          <CardTitle>Workspace dashboard is under construction</CardTitle>
          <CardDescription>
            Your session is active in the {meta?.label ?? workspace} context.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Role-specific tools and modules for this workspace will appear here as each
          module ships. Use the workspace switcher in the header if you hold multiple
          active role assignments.
        </CardContent>
      </Card>
    </div>
  );
}


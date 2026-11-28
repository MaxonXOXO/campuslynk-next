import { PageHeader } from "@academic-suite/ui";
import { AuditControlPane } from "@/components/super-admin/control-panel/AuditControlPane";

export default function PrincipalAuditPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Trail"
        description="Review identity, organisation, and role-assignment activity logs."
      />
      <AuditControlPane />
    </div>
  );
}


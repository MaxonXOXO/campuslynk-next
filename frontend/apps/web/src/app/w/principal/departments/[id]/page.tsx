import { DepartmentHierarchyPage } from "@/components/principal/DepartmentHierarchyPage";

export default async function PrincipalDepartmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <DepartmentHierarchyPage departmentId={id} />;
}


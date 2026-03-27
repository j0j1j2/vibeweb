import { useParams } from "react-router-dom";
import { DbExplorer } from "@/components/DbExplorer";

export function DbPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  if (!tenantId) return null;
  return <DbExplorer tenantId={tenantId} />;
}

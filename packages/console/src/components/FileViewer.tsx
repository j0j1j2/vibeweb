export function FileViewer({ tenantId, filePath }: { tenantId: string; filePath: string }) {
  return <div className="p-4 text-sm font-mono">{filePath}</div>;
}

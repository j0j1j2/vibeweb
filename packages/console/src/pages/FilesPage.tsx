import { useState } from "react";
import { useParams } from "react-router-dom";
import { FileTree } from "@/components/FileTree";
import { FileViewer } from "@/components/FileViewer";

export function FilesPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  if (!tenantId) return null;

  return (
    <div className="flex h-full">
      <div className="w-[30%] min-w-[200px] border-r overflow-hidden">
        <FileTree tenantId={tenantId} onSelect={setSelectedFile} selectedPath={selectedFile ?? undefined} />
      </div>
      <div className="flex-1">
        {selectedFile ? <FileViewer tenantId={tenantId} filePath={selectedFile} /> : <div className="flex items-center justify-center h-full text-zinc-400 text-sm">Select a file to view</div>}
      </div>
    </div>
  );
}

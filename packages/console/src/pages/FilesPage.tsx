import { useState } from "react";
import { useParams } from "react-router-dom";
import { FileTree } from "@/components/FileTree";
import { FileViewer } from "@/components/FileViewer";
import { FolderOpen } from "lucide-react";

export function FilesPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  if (!tenantId) return null;

  return (
    <div className="flex h-full">
      <div className="w-[200px] border-r border-gray-100 bg-gray-50/30 overflow-hidden flex-shrink-0">
        <FileTree tenantId={tenantId} onSelect={setSelectedFile} selectedPath={selectedFile ?? undefined} />
      </div>
      <div className="flex-1 min-w-0">
        {selectedFile ? (
          <FileViewer tenantId={tenantId} filePath={selectedFile} />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-300 gap-2">
            <FolderOpen className="w-8 h-8" />
            <p className="text-sm">Select a file to view</p>
          </div>
        )}
      </div>
    </div>
  );
}

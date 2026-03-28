import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { FileTree } from "@/components/FileTree";
import { FileViewer } from "@/components/FileViewer";
import { FolderOpen } from "lucide-react";
import { listFiles } from "@/api";

export function FilesPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [hasFiles, setHasFiles] = useState(true);

  useEffect(() => {
    if (!tenantId) return;
    listFiles(tenantId).then((data) => setHasFiles((data.files ?? []).length > 0)).catch(() => setHasFiles(false));
  }, [tenantId]);

  if (!tenantId) return null;

  if (!hasFiles) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-300 gap-2">
        <FolderOpen className="w-10 h-10" />
        <p className="text-sm">No files yet</p>
        <p className="text-xs text-gray-300">Use the chat to create your first page</p>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <div className="w-[180px] border-r border-gray-100 bg-gray-50/30 overflow-hidden flex-shrink-0">
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

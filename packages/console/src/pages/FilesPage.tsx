import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { FileTree } from "@/components/FileTree";
import { FileViewer } from "@/components/FileViewer";
import { FolderOpen, Upload, FilePlus } from "lucide-react";
import { listFiles, uploadFile } from "@/api";

export function FilesPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [hasFiles, setHasFiles] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!tenantId) return;
    listFiles(tenantId)
      .then((data) => setHasFiles((data.files ?? []).length > 0))
      .catch(() => setHasFiles(false));
  }, [tenantId, refreshKey]);

  if (!tenantId) return null;

  const refresh = () => setRefreshKey((k) => k + 1);

  const handleUpload = async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.onchange = async (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (!files) return;
      for (const file of files) {
        const content = await file.text();
        const targetPath = `public/${file.name}`;
        await uploadFile(tenantId, targetPath, content);
      }
      setHasFiles(true);
      setSelectedFile(null);
      refresh();
    };
    input.click();
  };

  const handleNewFile = async () => {
    const name = prompt("File path (e.g. public/about.html):");
    if (!name) return;
    await uploadFile(tenantId, name, "");
    setHasFiles(true);
    refresh();
  };

  const handleDeleted = () => {
    setSelectedFile(null);
    refresh();
  };

  if (!hasFiles) {
    return (
      <div className="flex flex-col h-full">
        <div className="border-b border-gray-100 px-3 py-2 flex items-center gap-2">
          <button
            onClick={handleUpload}
            className="flex items-center gap-1.5 text-[12px] px-2.5 py-1.5 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            Upload
          </button>
          <button
            onClick={handleNewFile}
            className="flex items-center gap-1.5 text-[12px] px-2.5 py-1.5 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <FilePlus className="w-3.5 h-3.5" />
            New File
          </button>
        </div>
        <div className="flex flex-col items-center justify-center flex-1 text-gray-300 gap-2">
          <FolderOpen className="w-10 h-10" />
          <p className="text-sm">No files yet</p>
          <p className="text-xs text-gray-300">Use the chat to create your first page</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-gray-100 px-3 py-2 flex items-center gap-2 flex-shrink-0">
        <button
          onClick={handleUpload}
          className="flex items-center gap-1.5 text-[12px] px-2.5 py-1.5 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
        >
          <Upload className="w-3.5 h-3.5" />
          Upload
        </button>
        <button
          onClick={handleNewFile}
          className="flex items-center gap-1.5 text-[12px] px-2.5 py-1.5 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
        >
          <FilePlus className="w-3.5 h-3.5" />
          New File
        </button>
      </div>
      <div className="flex flex-1 min-h-0">
        <div className="w-[180px] border-r border-gray-100 bg-gray-50/30 overflow-hidden flex-shrink-0">
          <FileTree
            tenantId={tenantId}
            onSelect={setSelectedFile}
            selectedPath={selectedFile ?? undefined}
            refreshKey={refreshKey}
          />
        </div>
        <div className="flex-1 min-w-0">
          {selectedFile ? (
            <FileViewer tenantId={tenantId} filePath={selectedFile} onDeleted={handleDeleted} />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-300 gap-2">
              <FolderOpen className="w-8 h-8" />
              <p className="text-sm">Select a file to view</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

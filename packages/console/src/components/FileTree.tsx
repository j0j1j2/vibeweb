import { useState, useEffect } from "react";
import { listFiles } from "@/api";
import { File, Folder, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface FileEntry { path: string; size: number; }

interface TreeNode { name: string; path: string; children: TreeNode[]; isFile: boolean; size?: number; }

function buildTree(files: FileEntry[]): TreeNode[] {
  const root: TreeNode[] = [];
  for (const file of files) {
    const parts = file.path.split("/");
    let current = root;
    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      const isFile = i === parts.length - 1;
      const existing = current.find((n) => n.name === name);
      if (existing) { current = existing.children; }
      else {
        const node: TreeNode = { name, path: parts.slice(0, i + 1).join("/"), children: [], isFile, size: isFile ? file.size : undefined };
        current.push(node);
        current = node.children;
      }
    }
  }
  return root;
}

export function FileTree({ tenantId, onSelect, selectedPath }: { tenantId: string; onSelect?: (path: string) => void; selectedPath?: string; }) {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["public", "functions"]));

  useEffect(() => { listFiles(tenantId).then((data) => setFiles(data.files ?? [])).catch(() => {}); }, [tenantId]);

  const tree = buildTree(files);
  const toggleExpand = (path: string) => { setExpanded((prev) => { const next = new Set(prev); if (next.has(path)) next.delete(path); else next.add(path); return next; }); };

  return (
    <div className="p-2 text-sm overflow-y-auto h-full">
      {tree.map((node) => <TreeItem key={node.path} node={node} expanded={expanded} toggleExpand={toggleExpand} onSelect={onSelect} selectedPath={selectedPath} depth={0} />)}
      {files.length === 0 && <div className="text-zinc-400 text-center mt-8">No files</div>}
    </div>
  );
}

function TreeItem({ node, expanded, toggleExpand, onSelect, selectedPath, depth }: { node: TreeNode; expanded: Set<string>; toggleExpand: (path: string) => void; onSelect?: (path: string) => void; selectedPath?: string; depth: number; }) {
  const isExpanded = expanded.has(node.path);
  const isSelected = selectedPath === node.path;

  return (
    <div>
      <button onClick={() => { if (node.isFile) onSelect?.(node.path); else toggleExpand(node.path); }}
        className={cn("flex items-center gap-1.5 w-full px-2 py-1 rounded text-left hover:bg-zinc-100 dark:hover:bg-zinc-800", isSelected && "bg-zinc-200 dark:bg-zinc-700")}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}>
        {node.isFile ? <File className="w-3.5 h-3.5 text-zinc-400" /> : isExpanded ? <><ChevronDown className="w-3 h-3" /><Folder className="w-3.5 h-3.5 text-zinc-400" /></> : <><ChevronRight className="w-3 h-3" /><Folder className="w-3.5 h-3.5 text-zinc-400" /></>}
        <span className="truncate">{node.name}</span>
      </button>
      {!node.isFile && isExpanded && node.children.map((child) => <TreeItem key={child.path} node={child} expanded={expanded} toggleExpand={toggleExpand} onSelect={onSelect} selectedPath={selectedPath} depth={depth + 1} />)}
    </div>
  );
}

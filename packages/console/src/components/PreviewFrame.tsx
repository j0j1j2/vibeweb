import { useRef } from "react";
import { RefreshCw } from "lucide-react";

export function PreviewFrame({ subdomain }: { subdomain: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const previewUrl = `http://${subdomain}.vibeweb.localhost?preview=true`;
  const handleRefresh = () => { if (iframeRef.current) iframeRef.current.src = previewUrl; };

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-2 border-b flex items-center justify-between text-sm">
        <span className="text-zinc-500">{previewUrl}</span>
        <button onClick={handleRefresh} className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"><RefreshCw className="w-4 h-4" /></button>
      </div>
      <iframe ref={iframeRef} src={previewUrl} className="flex-1 w-full border-0 bg-white" title="Preview" />
    </div>
  );
}

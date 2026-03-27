import { useRef } from "react";
import { RefreshCw, ExternalLink } from "lucide-react";

export function PreviewFrame({ subdomain }: { subdomain: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const previewUrl = `http://${subdomain}.vibeweb.localhost?preview=true`;
  const handleRefresh = () => { if (iframeRef.current) iframeRef.current.src = previewUrl; };

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-gray-100 flex items-center gap-2">
        <div className="flex-1 flex items-center gap-2 px-2.5 py-1 bg-gray-50 rounded-md border border-gray-100">
          <div className="w-2 h-2 rounded-full bg-emerald-400/80" />
          <span className="text-[11px] text-gray-400 font-mono truncate">{previewUrl}</span>
        </div>
        <button onClick={handleRefresh} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
        <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
      <iframe ref={iframeRef} src={previewUrl} className="flex-1 w-full border-0 bg-white" title="Preview" />
    </div>
  );
}

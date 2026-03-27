import { useRef } from "react";
import { RefreshCw, ExternalLink } from "lucide-react";

export function PreviewFrame({ subdomain }: { subdomain: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const previewUrl = `http://${subdomain}.vibeweb.localhost?preview=true`;
  const handleRefresh = () => { if (iframeRef.current) iframeRef.current.src = previewUrl; };

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-white/[0.06] flex items-center gap-2">
        <div className="flex-1 flex items-center gap-2 px-2.5 py-1 bg-white/[0.04] rounded-md">
          <div className="w-2 h-2 rounded-full bg-emerald-400/60" />
          <span className="text-[11px] text-white/40 font-mono truncate">{previewUrl}</span>
        </div>
        <button onClick={handleRefresh} className="p-1.5 rounded-md hover:bg-white/[0.06] text-white/40 hover:text-white/60 transition-colors">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
        <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-md hover:bg-white/[0.06] text-white/40 hover:text-white/60 transition-colors">
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
      <iframe ref={iframeRef} src={previewUrl} className="flex-1 w-full border-0 bg-white rounded-b-lg" title="Preview" />
    </div>
  );
}

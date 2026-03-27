import { useChatContext } from "@/components/ChatLayout";
import { PreviewFrame } from "@/components/PreviewFrame";

export function PreviewPage() {
  const { subdomain } = useChatContext();
  if (!subdomain) return <div className="flex items-center justify-center h-full text-gray-300">Loading preview...</div>;
  return <PreviewFrame subdomain={subdomain} />;
}

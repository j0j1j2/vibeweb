import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth";
import { Sparkles } from "lucide-react";

export function LoginPage() {
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { auth, login } = useAuth();
  const navigate = useNavigate();

  if (auth) {
    if (auth.isAdmin) navigate("/admin", { replace: true });
    else if (auth.tenant) navigate(`/t/${auth.tenant.id}/chat`, { replace: true });
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const ok = await login(apiKey.trim());
    setLoading(false);
    if (!ok) setError("Invalid API key");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#09090b]">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <span className="text-2xl font-bold tracking-tight">VibeWeb</span>
        </div>

        <div className="p-6 bg-white/[0.03] border border-white/[0.06] rounded-xl">
          <p className="text-white/40 text-sm mb-5">Enter your API key to continue</p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="API Key"
              className="w-full px-3.5 py-2.5 bg-white/[0.04] border border-white/[0.08] rounded-lg text-sm text-white/90 placeholder:text-white/20 focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20 transition-colors"
              autoFocus
            />
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={loading || !apiKey.trim()}
              className="w-full py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-sm font-medium rounded-lg hover:from-violet-500 hover:to-indigo-500 disabled:opacity-40 transition-all shadow-lg shadow-violet-500/20"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

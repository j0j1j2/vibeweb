import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth";

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
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
      <div className="w-full max-w-sm p-8 bg-white dark:bg-zinc-900 rounded-lg shadow-md">
        <h1 className="text-2xl font-bold mb-1">VibeWeb</h1>
        <p className="text-zinc-500 text-sm mb-6">Enter your API key to continue</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="API Key"
              className="w-full px-3 py-2 border rounded-md bg-transparent focus:outline-none focus:ring-2 focus:ring-zinc-400" autoFocus />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button type="submit" disabled={loading || !apiKey.trim()}
            className="w-full py-2 bg-zinc-900 text-white rounded-md hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200">
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}

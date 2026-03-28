import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth";
import { Sparkles } from "lucide-react";

export function LoginPage() {
  const [subdomain, setSubdomain] = useState("");
  const [password, setPassword] = useState("");
  const [adminKey, setAdminKey] = useState("");
  const [showAdmin, setShowAdmin] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { auth, login, loginAdmin } = useAuth();
  const navigate = useNavigate();

  if (auth) {
    if (auth.isAdmin) navigate("/admin", { replace: true });
    else if (auth.tenant) navigate(`/t/${auth.tenant.id}/chat`, { replace: true });
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    if (showAdmin) {
      const ok = await loginAdmin(adminKey.trim());
      setLoading(false);
      if (!ok) setError("Invalid admin key");
    } else {
      const ok = await login(subdomain.trim(), password);
      setLoading(false);
      if (!ok) setError("Invalid subdomain or password");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <span className="text-2xl font-bold tracking-tight text-gray-900">VibeWeb</span>
        </div>

        <div className="p-6 bg-white border border-gray-200 rounded-xl shadow-sm">
          {!showAdmin ? (
            <>
              <p className="text-gray-400 text-sm mb-5">Sign in with your subdomain and password</p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <input
                  type="text"
                  value={subdomain}
                  onChange={(e) => setSubdomain(e.target.value)}
                  placeholder="Subdomain"
                  className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-colors"
                  autoFocus
                />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-colors"
                />
                {error && <p className="text-red-500 text-sm">{error}</p>}
                <button
                  type="submit"
                  disabled={loading || !subdomain.trim() || !password}
                  className="w-full py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-sm font-medium rounded-lg hover:from-violet-500 hover:to-indigo-500 disabled:opacity-50 disabled:border disabled:border-violet-300/50 transition-all shadow-sm"
                >
                  {loading ? "Signing in..." : "Sign In"}
                </button>
              </form>
              <div className="mt-4 text-center">
                <button
                  onClick={() => { setShowAdmin(true); setError(""); }}
                  className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                >
                  Admin login
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-gray-400 text-sm mb-5">Enter your admin API key</p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <input
                  type="password"
                  value={adminKey}
                  onChange={(e) => setAdminKey(e.target.value)}
                  placeholder="Admin API Key"
                  className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-colors"
                  autoFocus
                />
                {error && <p className="text-red-500 text-sm">{error}</p>}
                <button
                  type="submit"
                  disabled={loading || !adminKey.trim()}
                  className="w-full py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-sm font-medium rounded-lg hover:from-violet-500 hover:to-indigo-500 disabled:opacity-50 disabled:border disabled:border-violet-300/50 transition-all shadow-sm"
                >
                  {loading ? "Signing in..." : "Sign In as Admin"}
                </button>
              </form>
              <div className="mt-4 text-center">
                <button
                  onClick={() => { setShowAdmin(false); setError(""); }}
                  className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                >
                  Back to tenant login
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

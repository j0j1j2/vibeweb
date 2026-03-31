import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/auth";
import { Sparkles, Globe } from "lucide-react";

export function LoginPage() {
  const { t, i18n } = useTranslation();
  const isKo = i18n.language === "ko";
  const toggleLang = () => i18n.changeLanguage(isKo ? "en" : "ko");
  const [siteName, setSiteName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { auth, login } = useAuth();
  const navigate = useNavigate();

  if (auth) {
    if (auth.isAdmin) navigate("/admin", { replace: true });
    else if (auth.tenant) navigate(`/t/${auth.tenant.id}/preview`, { replace: true });
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const ok = await login(siteName.trim().toLowerCase(), password);
    setLoading(false);
    if (!ok) setError(t("login.error"));
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 relative">
      <button
        onClick={toggleLang}
        className="absolute top-4 right-4 flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[12px] font-medium text-gray-400 hover:text-gray-600 hover:bg-white/80 transition-colors"
        title={isKo ? "Switch to English" : "한국어로 전환"}
      >
        <Globe className="w-3.5 h-3.5" />
        {isKo ? "English" : "한국어"}
      </button>
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <span className="text-2xl font-bold tracking-tight text-gray-900">VibeWeb</span>
        </div>

        <div className="p-6 bg-white border border-gray-200 rounded-xl shadow-sm">
          <p className="text-gray-400 text-sm mb-5">{t("login.subtitle")}</p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="siteName" className="block text-xs font-medium text-gray-500 mb-1">{t("login.siteName")}</label>
              <div className="flex items-center border border-gray-200 rounded-lg bg-gray-50 focus-within:border-violet-400 focus-within:ring-2 focus-within:ring-violet-100 transition-colors">
                <input
                  id="siteName"
                  type="text"
                  value={siteName}
                  onChange={(e) => setSiteName(e.target.value.replace(/[^a-z0-9-]/gi, "").toLowerCase())}
                  placeholder={t("login.siteNamePlaceholder")}
                  className="flex-1 px-3.5 py-2.5 bg-transparent text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none"
                  autoFocus
                />
                <span className="pr-3 text-sm text-gray-300 select-none">.vibeweb.site</span>
              </div>
            </div>
            <div>
              <label htmlFor="password" className="block text-xs font-medium text-gray-500 mb-1">{t("login.password")}</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("login.passwordPlaceholder")}
                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-colors"
              />
            </div>
            {error && (
              <div role="alert" className="flex items-start gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-700 text-sm font-medium">{error}</p>
              </div>
            )}
            <button
              type="submit"
              disabled={loading || !siteName.trim() || !password}
              className="w-full py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-sm font-medium rounded-lg hover:from-violet-500 hover:to-indigo-500 disabled:opacity-50 transition-all shadow-sm"
            >
              {loading ? t("login.signingIn") : t("login.signIn")}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

import { Link, useLocation, useParams } from "react-router-dom";
import { useAuth } from "@/auth";
import {
  Monitor, FolderOpen, Database, Plug, Settings,
  LayoutDashboard, LogOut, ChevronDown, ChevronRight, Sparkles,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Globe } from "lucide-react";
import { cn } from "@/lib/utils";

interface TenantNav { id: string; name: string; subdomain: string; }

export function Sidebar({ tenants }: { tenants: TenantNav[] }) {
  const { t, i18n } = useTranslation();
  const isKo = i18n.language === "ko";
  const toggleLang = () => i18n.changeLanguage(isKo ? "en" : "ko");
  const { auth, logout } = useAuth();
  const location = useLocation();
  const { tenantId } = useParams();
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => tenantId ? { [tenantId]: true } : {});

  const toggleExpand = (id: string) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + "/");

  return (
    <div className="w-[260px] h-screen bg-white border-r border-gray-200 flex flex-col">
      <div className="px-5 py-4 flex items-center gap-2.5 border-b border-gray-100">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
          <Sparkles className="w-3.5 h-3.5 text-white" />
        </div>
        <span className="font-semibold text-[15px] tracking-tight text-gray-900">VibeWeb</span>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-3 text-[13px]">
        {auth?.isAdmin && (
          <div className="mb-4">
            <div className="px-2 mb-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{t("sidebar.platform")}</div>
            <NavItem to="/admin" icon={LayoutDashboard} label={t("sidebar.dashboard")} active={isActive("/admin")} />
          </div>
        )}

        {tenants.length > 0 && (
          <div className="px-2 mb-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{t("sidebar.sites")}</div>
        )}

        {tenants.map((tn) => (
          <div key={tn.id} className="mb-0.5">
            <button
              onClick={() => toggleExpand(tn.id)}
              className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded-md hover:bg-gray-50 text-left group transition-colors"
            >
              {expanded[tn.id] ? <ChevronDown className="w-3 h-3 text-gray-300 flex-shrink-0" /> : <ChevronRight className="w-3 h-3 text-gray-300 flex-shrink-0" />}
              <span className="font-medium text-gray-700 truncate min-w-0 flex-1" title={tn.name}>{tn.name}</span>
              <span className="flex-shrink-0 text-[9px] text-gray-300 font-mono truncate max-w-[60px]" title={tn.subdomain}>{tn.subdomain}</span>
            </button>

            {expanded[tn.id] && (
              <div className="ml-3 pl-2 mt-0.5 space-y-px border-l border-gray-100">
                <NavItem to={`/t/${tn.id}/preview`} icon={Monitor} label={t("sidebar.mySite")} active={isActive(`/t/${tn.id}/preview`)} />
                <NavItem to={`/t/${tn.id}/files`} icon={FolderOpen} label={t("sidebar.files")} active={isActive(`/t/${tn.id}/files`)} />
                <NavItem to={`/t/${tn.id}/db`} icon={Database} label={t("sidebar.database")} active={isActive(`/t/${tn.id}/db`)} />
                <NavItem to={`/t/${tn.id}/api`} icon={Plug} label={t("sidebar.api")} active={isActive(`/t/${tn.id}/api`)} />
                <NavItem to={`/t/${tn.id}/settings`} icon={Settings} label={t("sidebar.settings")} active={isActive(`/t/${tn.id}/settings`)} />
              </div>
            )}
          </div>
        ))}
      </nav>

      <div className="px-3 py-3 border-t border-gray-100 flex items-center gap-1">
        <button
          onClick={logout}
          className="flex items-center gap-2 flex-1 px-2 py-1.5 rounded-md text-[13px] text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" /> {t("sidebar.signOut")}
        </button>
        <button
          onClick={toggleLang}
          className="flex items-center gap-1 px-2 py-1.5 rounded-md text-[11px] font-medium text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
          title={isKo ? "Switch to English" : "한국어로 전환"}
        >
          <Globe className="w-3 h-3" />
          {isKo ? "EN" : "한"}
        </button>
      </div>
    </div>
  );
}

function NavItem({ to, icon: Icon, label, active }: { to: string; icon: any; label: string; active: boolean }) {
  return (
    <Link
      to={to}
      className={cn(
        "flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px] transition-colors",
        active
          ? "bg-violet-50 text-violet-700 font-medium"
          : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
      )}
    >
      <Icon className="w-3.5 h-3.5" /> {label}
    </Link>
  );
}

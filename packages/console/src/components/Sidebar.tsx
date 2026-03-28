import { Link, useLocation, useParams } from "react-router-dom";
import { useAuth } from "@/auth";
import {
  Monitor, FolderOpen, Database, Plug, Settings,
  LayoutDashboard, LogOut, ChevronDown, ChevronRight, Sparkles,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface TenantNav { id: string; name: string; subdomain: string; }

export function Sidebar({ tenants }: { tenants: TenantNav[] }) {
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
            <div className="px-2 mb-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Platform</div>
            <NavItem to="/admin" icon={LayoutDashboard} label="Dashboard" active={isActive("/admin")} />
          </div>
        )}

        {tenants.length > 0 && (
          <div className="px-2 mb-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Sites</div>
        )}

        {tenants.map((t) => (
          <div key={t.id} className="mb-0.5">
            <button
              onClick={() => toggleExpand(t.id)}
              className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded-md hover:bg-gray-50 text-left group transition-colors"
            >
              {expanded[t.id] ? <ChevronDown className="w-3 h-3 text-gray-300 flex-shrink-0" /> : <ChevronRight className="w-3 h-3 text-gray-300 flex-shrink-0" />}
              <span className="font-medium text-gray-700 truncate min-w-0 flex-1" title={t.name}>{t.name}</span>
              <span className="flex-shrink-0 text-[9px] text-gray-300 font-mono truncate max-w-[60px]" title={t.subdomain}>{t.subdomain}</span>
            </button>

            {expanded[t.id] && (
              <div className="ml-3 pl-2 mt-0.5 space-y-px border-l border-gray-100">
                <NavItem to={`/t/${t.id}/preview`} icon={Monitor} label="My Site" active={isActive(`/t/${t.id}/preview`)} />
                <NavItem to={`/t/${t.id}/files`} icon={FolderOpen} label="Files" active={isActive(`/t/${t.id}/files`)} />
                <NavItem to={`/t/${t.id}/db`} icon={Database} label="Database" active={isActive(`/t/${t.id}/db`)} />
                <NavItem to={`/t/${t.id}/api`} icon={Plug} label="API" active={isActive(`/t/${t.id}/api`)} />
                <NavItem to={`/t/${t.id}/settings`} icon={Settings} label="Settings" active={isActive(`/t/${t.id}/settings`)} />
              </div>
            )}
          </div>
        ))}
      </nav>

      <div className="px-3 py-3 border-t border-gray-100">
        <button
          onClick={logout}
          className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-[13px] text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" /> Sign Out
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

import { Link, useLocation, useParams } from "react-router-dom";
import { useAuth } from "@/auth";
import { MessageSquare, FolderOpen, Database, Plug, Settings, LayoutDashboard, LogOut, ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface TenantNav { id: string; name: string; subdomain: string; }

export function Sidebar({ tenants }: { tenants: TenantNav[] }) {
  const { auth, logout } = useAuth();
  const location = useLocation();
  const { tenantId } = useParams();
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => tenantId ? { [tenantId]: true } : {});

  const toggleExpand = (id: string) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="w-[220px] h-screen bg-zinc-50 dark:bg-zinc-900 border-r flex flex-col">
      <div className="p-4 font-bold text-lg border-b">VibeWeb</div>
      <nav className="flex-1 overflow-y-auto p-2 text-sm">
        {auth?.isAdmin && (
          <div className="mb-2">
            <div className="px-2 py-1 text-xs font-semibold text-zinc-400 uppercase">Admin</div>
            <NavItem to="/admin" icon={LayoutDashboard} label="Dashboard" active={isActive("/admin")} />
          </div>
        )}
        {tenants.map((t) => (
          <div key={t.id} className="mb-1">
            <button onClick={() => toggleExpand(t.id)} className="flex items-center gap-1 w-full px-2 py-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-left">
              {expanded[t.id] ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              <span className="font-medium truncate">{t.name}</span>
              <span className="ml-auto text-xs text-zinc-400">{t.subdomain}</span>
            </button>
            {expanded[t.id] && (
              <div className="ml-4 mt-1 space-y-0.5">
                <NavItem to={`/t/${t.id}/chat`} icon={MessageSquare} label="Chat" active={isActive(`/t/${t.id}/chat`)} />
                <NavItem to={`/t/${t.id}/files`} icon={FolderOpen} label="Files" active={isActive(`/t/${t.id}/files`)} />
                <NavItem to={`/t/${t.id}/db`} icon={Database} label="Database" active={isActive(`/t/${t.id}/db`)} />
                <NavItem to={`/t/${t.id}/api`} icon={Plug} label="API" active={isActive(`/t/${t.id}/api`)} />
                <NavItem to={`/t/${t.id}/settings`} icon={Settings} label="Settings" active={isActive(`/t/${t.id}/settings`)} />
              </div>
            )}
          </div>
        ))}
      </nav>
      <div className="p-2 border-t">
        <button onClick={logout} className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800">
          <LogOut className="w-4 h-4" /> Logout
        </button>
      </div>
    </div>
  );
}

function NavItem({ to, icon: Icon, label, active }: { to: string; icon: any; label: string; active: boolean }) {
  return (
    <Link to={to} className={cn("flex items-center gap-2 px-2 py-1.5 rounded text-sm", active ? "bg-zinc-200 dark:bg-zinc-800 font-medium" : "hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400")}>
      <Icon className="w-4 h-4" /> {label}
    </Link>
  );
}

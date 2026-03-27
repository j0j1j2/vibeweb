import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { AuthProvider, useAuth } from "@/auth";
import { Sidebar } from "@/components/Sidebar";
import { LoginPage } from "@/pages/LoginPage";
import { AdminPage } from "@/pages/AdminPage";
import { ChatPage } from "@/pages/ChatPage";
import { FilesPage } from "@/pages/FilesPage";
import { DbPage } from "@/pages/DbPage";
import { ApiPage } from "@/pages/ApiPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { useState, useEffect } from "react";
import { listTenants } from "@/api";

function AppLayout() {
  const { auth } = useAuth();
  const [tenants, setTenants] = useState<{ id: string; name: string; subdomain: string }[]>([]);

  useEffect(() => {
    if (!auth) return;
    if (auth.isAdmin) { listTenants().then(setTenants).catch(() => {}); }
    else if (auth.tenant) { setTenants([{ id: auth.tenant.id, name: auth.tenant.name, subdomain: auth.tenant.subdomain }]); }
  }, [auth]);

  if (!auth) return <Navigate to="/login" />;

  return (
    <div className="flex h-screen">
      <Sidebar tenants={tenants} />
      <main className="flex-1 overflow-hidden"><Outlet /></main>
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<AppLayout />}>
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/t/:tenantId/chat" element={<ChatPage />} />
            <Route path="/t/:tenantId/files" element={<FilesPage />} />
            <Route path="/t/:tenantId/db" element={<DbPage />} />
            <Route path="/t/:tenantId/api" element={<ApiPage />} />
            <Route path="/t/:tenantId/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/login" />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

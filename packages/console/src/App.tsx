import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { AuthProvider, useAuth } from "@/auth";
import { Sidebar } from "@/components/Sidebar";
import { ChatLayout } from "@/components/ChatLayout";
import { LoginPage } from "@/pages/LoginPage";
import { AdminPage } from "@/pages/AdminPage";
import { PreviewPage } from "@/pages/PreviewPage";
import { FilesPage } from "@/pages/FilesPage";
import { DbPage } from "@/pages/DbPage";
import { ApiPage } from "@/pages/ApiPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { useState, useEffect } from "react";
import { listTenants } from "@/api";

function AppLayout() {
  const { auth } = useAuth();
  const [tenants, setTenants] = useState<{ id: string; name: string; subdomain: string }[]>([]);

  const refreshTenants = () => {
    if (!auth) return;
    if (auth.isAdmin) { listTenants().then(setTenants).catch(() => {}); }
    else if (auth.tenant) { setTenants([{ id: auth.tenant.id, name: auth.tenant.name, subdomain: auth.tenant.subdomain }]); }
  };

  useEffect(() => { refreshTenants(); }, [auth]);

  // Listen for tenant changes from any page
  useEffect(() => {
    const handler = () => refreshTenants();
    window.addEventListener("vibeweb:tenants-changed", handler);
    return () => window.removeEventListener("vibeweb:tenants-changed", handler);
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

            {/* Pages with chat panel */}
            <Route path="/t/:tenantId/preview" element={<ChatLayout><PreviewPage /></ChatLayout>} />
            <Route path="/t/:tenantId/files" element={<ChatLayout><FilesPage /></ChatLayout>} />
            <Route path="/t/:tenantId/db" element={<ChatLayout><DbPage /></ChatLayout>} />
            <Route path="/t/:tenantId/api" element={<ChatLayout><ApiPage /></ChatLayout>} />

            {/* Pages without chat panel */}
            <Route path="/t/:tenantId/settings" element={<SettingsPage />} />

            {/* Legacy redirect */}
            <Route path="/t/:tenantId/chat" element={<Navigate to="../preview" replace />} />
            <Route path="*" element={<Navigate to="/login" />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

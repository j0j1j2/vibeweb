import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface Tenant {
  id: string;
  subdomain: string;
  name: string;
  api_key: string;
  status: string;
}

interface AuthState {
  apiKey: string;
  tenant: Tenant | null;
  isAdmin: boolean;
}

interface AuthContextValue {
  auth: AuthState | null;
  login: (apiKey: string) => Promise<boolean>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const STORAGE_KEY = "vibeweb_auth";

function loadAuth(): AuthState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveAuth(auth: AuthState | null): void {
  if (auth) localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
  else localStorage.removeItem(STORAGE_KEY);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState | null>(loadAuth);

  const login = useCallback(async (apiKey: string): Promise<boolean> => {
    try {
      const loginRes = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: apiKey }),
      });
      if (!loginRes.ok) return false;
      const data = await loginRes.json();
      if (data.admin) {
        const state: AuthState = { apiKey, tenant: null, isAdmin: true };
        saveAuth(state);
        setAuth(state);
      } else {
        const state: AuthState = { apiKey, tenant: data, isAdmin: false };
        saveAuth(state);
        setAuth(state);
      }
      return true;
    } catch { return false; }
  }, []);

  const logout = useCallback(() => { saveAuth(null); setAuth(null); }, []);

  return <AuthContext.Provider value={{ auth, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

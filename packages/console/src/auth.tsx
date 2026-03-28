import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface Tenant {
  id: string;
  subdomain: string;
  name: string;
  status: string;
}

interface AuthState {
  tenant: Tenant | null;
  isAdmin: boolean;
}

interface AuthContextValue {
  auth: AuthState | null;
  login: (subdomain: string, password: string) => Promise<boolean>;
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

  const login = useCallback(async (subdomain: string, password: string): Promise<boolean> => {
    try {
      // "console" subdomain = admin login
      if (subdomain === "console") {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ api_key: password }),
        });
        if (!res.ok) return false;
        const data = await res.json();
        if (data.admin) {
          saveAuth({ tenant: null, isAdmin: true });
          setAuth({ tenant: null, isAdmin: true });
          return true;
        }
        return false;
      }

      // Tenant login
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subdomain, password }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      if (data.id) {
        const state: AuthState = { tenant: data, isAdmin: false };
        saveAuth(state);
        setAuth(state);
        return true;
      }
      return false;
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

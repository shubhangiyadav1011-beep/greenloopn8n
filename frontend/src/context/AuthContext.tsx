import { api } from "@/lib/api";
import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AuthContext, type User } from "./AuthContext.helpers";

export function AuthProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    api<{ user: User | null }>("/auth/me").then(result => { if (active) { setUser(result.user); setError(""); } })
      .catch(cause => { if (active) setError(cause.message); })
      .finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, [reload]);
  const authenticate = async (path: string, data: unknown) => {
    const result = await api<{ user: User }>(path, "POST", data);
    setUser(result.user); setError(""); return result.user;
  };
  const updateUser = async (updates: Partial<User>) => {
    try {
      const result = await api<{ user: User }>("/profile", "PATCH", updates);
      setUser(result.user); setError(""); return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("backend.profileFailed")); return false; }
  };
  const logout = async () => {
    try { await api("/auth/logout", "POST", {}); setUser(null); setError(""); return true; }
    catch (cause) { setError(cause instanceof Error ? cause.message : t("backend.signoutFailed")); return false; }
  };
  return <AuthContext.Provider value={{ user, ready, error,
    login: (email, password, remember) => authenticate("/auth/login", { email, password, remember }),
    createAccount: (details, password) => authenticate("/auth/register", { ...details, password }),
    addWorkspaces: roles => updateUser({ workspaces: roles }),
    setActiveWorkspace: async (role) => {
      const current = user?.workspaces || [];
      if (!current.includes(role)) {
        return updateUser({
          workspaces: [...new Set([...current, role])],
          activeWorkspace: role,
        });
      }
      return updateUser({ activeWorkspace: role });
    },
    updateUser,
    logout,
  }}>
    {error && <div role="alert" className="fixed inset-x-0 top-0 z-99999 flex items-center justify-center gap-3 bg-error-600 px-4 py-3 text-sm text-white">{error}<button type="button" className="underline" onClick={() => setReload(value => value + 1)}>{t("backend.retryConnection")}</button></div>}
    {children}
  </AuthContext.Provider>;
}


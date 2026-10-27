import { createContext, useContext } from "react";

export type Role = "provider" | "receiver";
export type SystemRole = "super_admin" | "support_admin" | "operations_admin";

export interface User {
  id: string; email: string; name?: string; organization?: string; location?: string;
  vat?: string; phone?: string; receiverId?: string; workspaces: Role[]; activeWorkspace?: Role; systemRole?: SystemRole;
}

export interface AuthContextType {
  user: User | null; ready: boolean; error: string;
  login: (email: string, password: string, remember: boolean) => Promise<User>;
  createAccount: (details: Pick<User, "email" | "name" | "organization">, password: string) => Promise<User>;
  addWorkspaces: (roles: Role[]) => Promise<boolean>;
  setActiveWorkspace: (role: Role) => Promise<boolean>;
  updateUser: (updates: Partial<User>) => Promise<boolean>;
  logout: () => Promise<boolean>;
}

export const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}

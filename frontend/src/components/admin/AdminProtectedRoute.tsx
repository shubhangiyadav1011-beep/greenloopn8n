import { useAuth } from "@/context/AuthContext.helpers";
import { Navigate, Outlet } from "react-router";

export default function AdminProtectedRoute() {
  const { user, ready } = useAuth();
  if (!ready) return <div className="flex min-h-screen items-center justify-center text-sm text-steel-600 dark:text-steel-300">Loading…</div>;
  if (!user) return <Navigate to="/sign-in" replace />;
  if (!user.systemRole) return <Navigate to={user.workspaces.length ? "/app" : "/onboarding"} replace />;
  return <Outlet />;
}

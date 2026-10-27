import { useAuth } from "@/context/AuthContext.helpers";
import { Navigate, Outlet } from "react-router";

export default function ProtectedRoute() {
  const { user, ready } = useAuth();

  if (!ready) {
    return <div role="status" className="flex min-h-screen items-center justify-center bg-white text-sm text-gray-500 dark:bg-gray-900 dark:text-gray-400">Restoring your session…</div>;
  }

  if (!user) {
    return <Navigate to="/sign-in" replace />;
  }

  if (!user.workspaces.length) return <Navigate to="/onboarding" replace />;
  return <Outlet />;
}

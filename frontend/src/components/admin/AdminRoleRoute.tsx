import type { SystemRole } from "@/context/AuthContext.helpers";
import { useAuth } from "@/context/AuthContext.helpers";
import { Navigate, Outlet } from "react-router";

export default function AdminRoleRoute({ roles }: { roles: SystemRole[] }) {
  const { user } = useAuth();
  return user?.systemRole && roles.includes(user.systemRole) ? <Outlet /> : <Navigate to="/admin/overview" replace />;
}

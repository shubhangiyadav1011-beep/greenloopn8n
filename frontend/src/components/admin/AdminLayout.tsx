import { useAuth } from "@/context/AuthContext.helpers";
import { cn } from "@/utils";
import { Link, NavLink, Outlet, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const links = [
    { to: "/admin/overview", label: t("admin.nav.overview"), roles: ["super_admin", "support_admin", "operations_admin"] },
    { to: "/admin/users", label: t("admin.nav.users"), roles: ["super_admin"] },
    { to: "/admin/support", label: t("admin.nav.support"), roles: ["super_admin", "support_admin"] },
    { to: "/admin/orders", label: t("admin.nav.orders"), roles: ["super_admin", "operations_admin"] },
    { to: "/admin/health", label: t("admin.nav.health"), roles: ["super_admin", "operations_admin"] },
    { to: "/admin/monetization", label: "Monetization", roles: ["super_admin", "operations_admin"] },
  ].filter(item => item.roles.includes(user?.systemRole ?? ""));
  const signOut = async () => { if (await logout()) navigate("/sign-in"); };

  return <div className="min-h-screen bg-steel-50 text-ink-900 dark:bg-steel-950 dark:text-white">
    <header className="border-b border-steel-200 bg-white dark:border-steel-800 dark:bg-steel-900">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <div><Link to="/admin/overview" className="font-archivo text-xl font-bold tracking-tight">GreenLoop <span className="text-loop-600 dark:text-loop-400">· {t("admin.internal")}</span></Link><p className="mt-0.5 text-xs text-steel-500 dark:text-steel-400">{user?.email} · {t(`admin.roles.${user?.systemRole ?? ""}`)}</p></div>
        <button type="button" onClick={signOut} className="rounded-lg border border-steel-300 px-3 py-2 text-sm font-semibold hover:bg-steel-50 dark:border-steel-700 dark:hover:bg-steel-800">{t("admin.signOut")}</button>
      </div>
    </header>
    <div className="mx-auto max-w-7xl px-4 sm:px-6">
      <nav aria-label={t("admin.navigation")} className="flex gap-1 overflow-x-auto border-b border-steel-200 py-3 dark:border-steel-800">
        {links.map(item => <NavLink key={item.to} to={item.to} className={({ isActive }) => cn("whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition", isActive ? "bg-loop-100 text-loop-900 dark:bg-loop-900 dark:text-loop-100" : "text-steel-600 hover:bg-steel-100 dark:text-steel-300 dark:hover:bg-steel-900")}>{item.label}</NavLink>)}
      </nav>
      <main className="py-6 sm:py-8"><Outlet /></main>
    </div>
  </div>;
}

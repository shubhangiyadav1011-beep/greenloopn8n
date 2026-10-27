import PageMeta from "@/components/common/PageMeta";
import { useAuth } from "@/context/AuthContext.helpers";
import { api } from "@/lib/api";
import { Link } from "react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

interface OverviewData { role: string; counts: { openTickets?: number; users?: number; activeOrders?: number; disputes?: number } }

export default function AdminOverview() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [data, setData] = useState<OverviewData>();
  const [error, setError] = useState("");
  useEffect(() => { api<OverviewData>("/admin/overview").then(setData).catch(cause => setError(cause.message)); }, []);
  const cards = [
    ...(data?.counts.users === undefined ? [] : [{ label: t("admin.overview.users"), value: data.counts.users }]),
    ...(data?.counts.openTickets === undefined ? [] : [{ label: t("admin.overview.openTickets"), value: data.counts.openTickets }]),
    ...(data?.counts.activeOrders === undefined ? [] : [{ label: t("admin.overview.activeOrders"), value: data.counts.activeOrders }]),
    ...(data?.counts.disputes === undefined ? [] : [{ label: t("admin.overview.disputes"), value: data.counts.disputes }]),
  ];
  const nav = [
    { to: "/admin/users", title: t("admin.nav.users"), description: t("admin.overview.userDescription"), roles: ["super_admin"] },
    { to: "/admin/support", title: t("admin.nav.support"), description: t("admin.overview.supportDescription"), roles: ["super_admin", "support_admin"] },
    { to: "/admin/orders", title: t("admin.nav.orders"), description: t("admin.overview.orderDescription"), roles: ["super_admin", "operations_admin"] },
    { to: "/admin/health", title: t("admin.nav.health"), description: t("admin.overview.healthDescription"), roles: ["super_admin", "operations_admin"] },
  ].filter(item => item.roles.includes(user?.systemRole ?? ""));
  return <div className="space-y-6">
    <PageMeta title={`${t("admin.nav.overview")} | GreenLoop Admin`} description={t("admin.overview.description")} />
    <header><p className="text-xs font-semibold uppercase tracking-widest text-loop-700 dark:text-loop-300">{t("admin.internal")}</p><h1 className="mt-2 font-archivo text-3xl font-bold">{t("admin.overview.title")}</h1><p className="mt-2 text-sm text-steel-600 dark:text-steel-300">{t("admin.overview.description")}</p></header>
    {error && <p role="alert" className="rounded-lg border border-error-300 bg-error-50 p-3 text-sm text-error-800 dark:border-error-800 dark:bg-error-950 dark:text-error-200">{error}</p>}
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label={t("admin.overview.summary")}>
      {cards.map(card => <article key={card.label} className="rounded-xl border border-steel-200 bg-white p-4 dark:border-steel-800 dark:bg-steel-900"><p className="text-sm text-steel-600 dark:text-steel-300">{card.label}</p><p className="mt-2 font-mono text-2xl font-semibold">{card.value}</p></article>)}
    </section>
    <section className="grid gap-3 sm:grid-cols-2">
      {nav.map(item => <Link key={item.to} to={item.to} className="rounded-xl border border-steel-200 bg-white p-5 transition hover:border-loop-500 hover:shadow-theme-sm dark:border-steel-800 dark:bg-steel-900"><h2 className="font-archivo text-lg font-bold">{item.title}</h2><p className="mt-1 text-sm text-steel-600 dark:text-steel-300">{item.description}</p></Link>)}
    </section>
  </div>;
}

import PageMeta from "@/components/common/PageMeta";
import { useAuth } from "@/context/AuthContext.helpers";
import { api } from "@/lib/api";
import type { AdminAuditEntry } from "@/types/admin";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

interface HealthData { api: string; database: string; paymentService: string; incidents: { id: string; requestId: string; occurredAt: string; method: string; route: string; category: string; statusCode: number }[] }

export default function AdminHealth() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [health, setHealth] = useState<HealthData>();
  const [audit, setAudit] = useState<AdminAuditEntry[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    api<HealthData>("/admin/health").then(setHealth).catch(cause => setError(cause.message));
    if (user?.systemRole === "super_admin") api<{ entries: AdminAuditEntry[] }>("/admin/audit").then(result => setAudit(result.entries)).catch(cause => setError(cause.message));
  }, [user?.systemRole]);
  const check = (label: string, status?: string) => <div key={label} className="rounded-lg border border-steel-200 bg-white p-4 dark:border-steel-800 dark:bg-steel-900"><p className="text-sm text-steel-600 dark:text-steel-300">{label}</p><p className="mt-1 font-semibold">{status ?? t("admin.loading")}</p></div>;
  return <div className="space-y-6">
    <PageMeta title={`${t("admin.nav.health")} | GreenLoop Admin`} description={t("admin.health.description")} />
    <header><h1 className="font-archivo text-3xl font-bold">{t("admin.health.title")}</h1><p className="mt-1 text-sm text-steel-600 dark:text-steel-300">{t("admin.health.description")}</p></header>
    {error && <p role="alert" className="rounded-lg bg-error-50 p-3 text-sm text-error-800 dark:bg-error-950 dark:text-error-200">{error}</p>}
    <section className="grid gap-3 sm:grid-cols-3" aria-label={t("admin.health.checks")}>
      {check(t("admin.health.api"), health?.api)}{check(t("admin.health.database"), health?.database)}{check(t("admin.health.payments"), health?.paymentService)}
    </section>
    <section className="rounded-xl border border-steel-200 bg-white p-5 dark:border-steel-800 dark:bg-steel-900"><h2 className="font-archivo text-xl font-bold">{t("admin.health.incidents")}</h2><p className="mt-1 text-sm text-steel-500">{t("admin.health.incidentNote")}</p>
      {!health?.incidents.length ? <p className="mt-4 text-sm text-steel-500">{t("admin.health.noIncidents")}</p> : <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[38rem] text-start text-sm"><thead><tr className="border-b border-steel-200 text-xs text-steel-500 dark:border-steel-800"><th className="py-2 pe-3 text-start">{t("admin.health.when")}</th><th className="py-2 pe-3 text-start">{t("admin.health.request")}</th><th className="py-2 pe-3 text-start">{t("admin.health.route")}</th><th className="py-2 text-start">{t("admin.health.code")}</th></tr></thead><tbody>{health.incidents.map(item => <tr key={item.id} className="border-b border-steel-100 dark:border-steel-800"><td className="py-2 pe-3">{new Date(item.occurredAt).toLocaleString()}</td><td className="py-2 pe-3 font-mono text-xs">{item.requestId}</td><td className="py-2 pe-3">{item.method} {item.route}</td><td className="py-2">{item.statusCode}</td></tr>)}</tbody></table></div>}
    </section>
    {user?.systemRole === "super_admin" && <section className="rounded-xl border border-steel-200 bg-white p-5 dark:border-steel-800 dark:bg-steel-900"><h2 className="font-archivo text-xl font-bold">{t("admin.health.audit")}</h2><p className="mt-1 text-sm text-steel-500">{t("admin.health.auditNote")}</p><div className="mt-3 space-y-3">{audit.slice(0, 30).map(item => { const changes = [item.before !== undefined ? `${t("admin.health.before")}: ${JSON.stringify(item.before)}` : "", item.after !== undefined ? `${t("admin.health.after")}: ${JSON.stringify(item.after)}` : ""].filter(Boolean).join(" · "); return <article key={item.id} className="border-t border-steel-200 pt-3 text-sm dark:border-steel-800"><div className="flex flex-wrap justify-between gap-2"><strong>{item.action} · {item.targetType} {item.targetId}</strong><time className="text-xs text-steel-500">{new Date(item.occurredAt).toLocaleString()}</time></div><p className="mt-1 text-xs text-steel-500">{item.actorEmail} · {t(`admin.roles.${item.actorRole}`)} · {item.reason}</p>{changes && <p className="mt-1 break-all font-mono text-xs text-steel-600 dark:text-steel-300">{changes}</p>}</article>; })}</div></section>}
  </div>;
}

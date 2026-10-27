import PageMeta from "@/components/common/PageMeta";
import { api } from "@/lib/api";
import type { AdminUser } from "@/types/admin";
import type { SystemRole } from "@/context/AuthContext.helpers";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

const staffRoles: (SystemRole | "")[] = ["", "super_admin", "support_admin", "operations_admin"];

export default function AdminUsers() {
  const { t } = useTranslation();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [selected, setSelected] = useState<AdminUser>();
  const [roleChoice, setRoleChoice] = useState<SystemRole | "">("");
  const [reason, setReason] = useState("");
  const [detail, setDetail] = useState<AdminUser>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const loadUsers = useCallback(async () => {
    try { const result = await api<{ users: AdminUser[]; hasMore: boolean }>(`/admin/users?q=${encodeURIComponent(appliedQuery)}&page=${page}`); setUsers(result.users); setHasMore(result.hasMore); }
    catch (cause) { setError(cause instanceof Error ? cause.message : t("admin.error")); }
  }, [appliedQuery, page, t]);
  useEffect(() => {
    const timer = window.setTimeout(() => { void loadUsers(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadUsers]);
  useEffect(() => {
    if (!selected) return;
    api<{ user: AdminUser }>(`/admin/users/${encodeURIComponent(selected.id)}`).then(result => { setDetail(result.user); setRoleChoice(result.user.systemRole ?? ""); }).catch(cause => setError(cause.message));
  }, [selected]);
  const search = (event: FormEvent) => { event.preventDefault(); setPage(1); setAppliedQuery(query.trim()); };
  const updateStatus = async (status: "active" | "suspended") => {
    if (!selected || !reason.trim()) return;
    setBusy(true); setError("");
    try { const result = await api<{ user: AdminUser }>(`/admin/users/${encodeURIComponent(selected.id)}/status`, "PATCH", { status, reason }); setSelected(result.user); setDetail(result.user); setReason(""); await loadUsers(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : t("admin.error")); }
    finally { setBusy(false); }
  };
  const updateRole = async () => {
    if (!selected || !reason.trim()) return;
    setBusy(true); setError("");
    try { const result = await api<{ user: AdminUser }>(`/admin/users/${encodeURIComponent(selected.id)}/role`, "PATCH", { role: roleChoice || null, reason }); setSelected(result.user); setDetail(result.user); setReason(""); await loadUsers(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : t("admin.error")); }
    finally { setBusy(false); }
  };
  const roleName = (value: string | null) => value ? t(`admin.roles.${value}`) : t("admin.users.noStaffRole");

  return <div className="space-y-5">
    <PageMeta title={`${t("admin.nav.users")} | GreenLoop Admin`} description={t("admin.users.description")} />
    <header><h1 className="font-archivo text-3xl font-bold">{t("admin.users.title")}</h1><p className="mt-1 text-sm text-steel-600 dark:text-steel-300">{t("admin.users.description")}</p></header>
    {error && <p role="alert" className="rounded-lg bg-error-50 p-3 text-sm text-error-800 dark:bg-error-950 dark:text-error-200">{error}</p>}
    <form onSubmit={search} className="flex gap-2"><input value={query} onChange={event => setQuery(event.target.value)} aria-label={t("admin.users.search")} placeholder={t("admin.users.search")} className="min-h-11 min-w-0 flex-1 rounded-lg border border-steel-300 bg-white px-3 text-sm dark:border-steel-700 dark:bg-steel-900" /><button className="rounded-lg bg-ink-900 px-4 text-sm font-semibold text-white dark:bg-loop-700">{t("admin.search")}</button></form>
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]">
      <section className="overflow-hidden rounded-xl border border-steel-200 bg-white dark:border-steel-800 dark:bg-steel-900">
        <ul className="divide-y divide-steel-200 dark:divide-steel-800">
          {users.map(person => <li key={person.id}><button type="button" onClick={() => setSelected(person)} className="flex w-full flex-wrap items-center justify-between gap-3 p-4 text-start hover:bg-steel-50 dark:hover:bg-steel-800"><span><span className="block font-semibold">{person.name || person.email}</span><span className="mt-1 block text-xs text-steel-500 dark:text-steel-400">{person.email} · {person.organization || person.workspaces.join(", ") || t("admin.users.noWorkspace")}</span></span><span className="flex gap-2 text-xs"><span className="rounded-full bg-steel-100 px-2 py-1 dark:bg-steel-800">{t(`admin.users.status.${person.status}`)}</span>{person.systemRole && <span className="rounded-full bg-loop-100 px-2 py-1 text-loop-900 dark:bg-loop-900 dark:text-loop-100">{roleName(person.systemRole)}</span>}</span></button></li>)}
          {!users.length && <li className="p-6 text-sm text-steel-500">{t("admin.users.empty")}</li>}
        </ul>
        <div className="flex items-center justify-between border-t border-steel-200 px-4 py-3 text-sm dark:border-steel-800"><button type="button" disabled={page <= 1} onClick={() => setPage(value => value - 1)} className="font-semibold disabled:opacity-40">{t("admin.previous")}</button><span className="text-steel-500">{t("admin.page", { page })}</span><button type="button" disabled={!hasMore} onClick={() => setPage(value => value + 1)} className="font-semibold disabled:opacity-40">{t("admin.next")}</button></div>
      </section>
      {selected && detail?.id === selected.id && <section className="space-y-4 rounded-xl border border-steel-200 bg-white p-5 dark:border-steel-800 dark:bg-steel-900">
        <div><p className="text-xs font-semibold uppercase tracking-wide text-steel-500">{t("admin.users.account")}</p><h2 className="mt-1 break-all font-archivo text-xl font-bold">{detail.name || detail.email}</h2><p className="text-sm text-steel-600 dark:text-steel-300">{detail.email}</p><p className="mt-2 text-sm">{t("admin.users.statusLabel")}: <strong>{t(`admin.users.status.${detail.status}`)}</strong></p><p className="text-sm">{t("admin.users.systemRole")}: <strong>{roleName(detail.systemRole)}</strong></p></div>
        <label className="block text-sm font-medium">{t("admin.users.reason")}<textarea value={reason} onChange={event => setReason(event.target.value)} maxLength={1000} required className="mt-1 min-h-20 w-full rounded-lg border border-steel-300 bg-transparent p-3 dark:border-steel-700" /></label>
        <div className="flex flex-wrap gap-2"><button type="button" disabled={busy || !reason.trim() || detail.status === "suspended"} onClick={() => void updateStatus("suspended")} className="rounded-lg border border-error-300 px-3 py-2 text-sm font-semibold text-error-700 disabled:opacity-50 dark:border-error-800 dark:text-error-300">{t("admin.users.suspend")}</button><button type="button" disabled={busy || !reason.trim() || detail.status === "active"} onClick={() => void updateStatus("active")} className="rounded-lg border border-loop-500 px-3 py-2 text-sm font-semibold text-loop-800 disabled:opacity-50 dark:text-loop-200">{t("admin.users.reactivate")}</button></div>
        <div className="space-y-2 border-t border-steel-200 pt-4 dark:border-steel-800"><label className="block text-sm font-medium">{t("admin.users.systemRole")}<select value={roleChoice} onChange={event => setRoleChoice(event.target.value as SystemRole | "")} className="mt-1 min-h-10 w-full rounded-lg border border-steel-300 bg-white px-3 dark:border-steel-700 dark:bg-steel-950">{staffRoles.map(value => <option key={value} value={value}>{roleName(value || null)}</option>)}</select></label><button type="button" disabled={busy || !reason.trim() || roleChoice === (detail.systemRole ?? "")} onClick={() => void updateRole()} className="rounded-lg bg-ink-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-loop-700">{t("admin.users.saveRole")}</button></div>
        <p className="text-xs text-steel-500 dark:text-steel-400">{t("admin.users.noDelete")}</p>
      </section>}
    </div>
  </div>;
}

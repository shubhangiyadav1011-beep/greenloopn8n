import PageMeta from "@/components/common/PageMeta";
import { api } from "@/lib/api";
import type { AdminOrderSummary, AdminTicket } from "@/types/admin";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

interface Staff { userId: string; email: string; role: string; name?: string }
interface TicketDetail { ticket: AdminTicket & { notes: { id: string; authorEmail: string; body: string; createdAt: string }[] }; requester: { email: string; name?: string; organization?: string; status: string }; relatedOrders: AdminOrderSummary[] }
const statuses = ["open", "in_review", "waiting", "resolved"] as const;

export default function AdminSupport() {
  const { t } = useTranslation();
  const [tickets, setTickets] = useState<AdminTicket[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState<TicketDetail>();
  const [status, setStatus] = useState<AdminTicket["status"]>("open");
  const [assignee, setAssignee] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => { const [queue, personnel] = await Promise.all([api<{ tickets: AdminTicket[] }>("/admin/support"), api<{ staff: Staff[] }>("/admin/staff")]); setTickets(queue.tickets); setStaff(personnel.staff); }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => { refresh().catch(cause => setError(cause.message)); }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);
  useEffect(() => {
    if (!selectedId) return;
    api<TicketDetail>(`/admin/support/${encodeURIComponent(selectedId)}`).then(value => { setDetail(value); setStatus(value.ticket.status); setAssignee(value.ticket.assignedAdminUserId ?? ""); }).catch(cause => setError(cause.message));
  }, [selectedId]);
  const save = async () => {
    if (!detail || !reason.trim()) return;
    setBusy(true); setError("");
    try {
      await api(`/admin/support/${encodeURIComponent(selectedId)}`, "PATCH", { status, assignedAdminUserId: assignee || null, reason, ...(note.trim() ? { note: note.trim() } : {}) });
      setReason(""); setNote(""); await refresh();
      const updated = await api<TicketDetail>(`/admin/support/${encodeURIComponent(selectedId)}`); setDetail(updated); setStatus(updated.ticket.status); setAssignee(updated.ticket.assignedAdminUserId ?? "");
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("admin.error")); }
    finally { setBusy(false); }
  };
  return <div className="space-y-5">
    <PageMeta title={`${t("admin.nav.support")} | GreenLoop Admin`} description={t("admin.support.description")} />
    <header><h1 className="font-archivo text-3xl font-bold">{t("admin.support.title")}</h1><p className="mt-1 text-sm text-steel-600 dark:text-steel-300">{t("admin.support.description")}</p></header>
    {error && <p role="alert" className="rounded-lg bg-error-50 p-3 text-sm text-error-800 dark:bg-error-950 dark:text-error-200">{error}</p>}
    <div className="grid gap-5 lg:grid-cols-[minmax(17rem,0.75fr)_minmax(0,1.25fr)]">
      <section className="overflow-hidden rounded-xl border border-steel-200 bg-white dark:border-steel-800 dark:bg-steel-900"><ul className="divide-y divide-steel-200 dark:divide-steel-800">
        {tickets.map(ticket => <li key={ticket.ticketId}><button type="button" onClick={() => setSelectedId(ticket.ticketId)} className="w-full p-4 text-start hover:bg-steel-50 dark:hover:bg-steel-800"><span className="flex justify-between gap-2"><strong className="truncate">{ticket.subject}</strong><span className="text-xs text-steel-500">{t(`admin.support.status.${ticket.status}`)}</span></span><span className="mt-1 block text-xs text-steel-500">{ticket.requesterEmail} · {ticket.ticketId}</span></button></li>)}
        {!tickets.length && <li className="p-5 text-sm text-steel-500">{t("admin.support.empty")}</li>}
      </ul></section>
      {detail?.ticket.ticketId === selectedId && <section className="space-y-4 rounded-xl border border-steel-200 bg-white p-5 dark:border-steel-800 dark:bg-steel-900">
        <header><p className="text-xs font-mono text-steel-500">{detail.ticket.ticketId} · {new Date(detail.ticket.createdAt).toLocaleString()}</p><h2 className="mt-1 font-archivo text-xl font-bold">{detail.ticket.subject}</h2><p className="mt-1 text-sm text-steel-600 dark:text-steel-300">{detail.requester.name || detail.requester.email} · {detail.requester.organization} · {t("admin.support.account")}: {detail.requester.status}</p></header>
        <p className="whitespace-pre-wrap rounded-lg bg-steel-50 p-4 text-sm dark:bg-steel-950">{detail.ticket.message}</p>
        {detail.relatedOrders.length > 0 && <div><h3 className="font-semibold">{t("admin.support.relatedOrders")}</h3><ul className="mt-2 space-y-2">{detail.relatedOrders.map(order => <li key={order.booking.id} className="rounded-lg border border-steel-200 p-3 text-sm dark:border-steel-700"><strong>{order.booking.id}</strong> · {order.booking.status} · {order.booking.tonnesT} t · {order.payment?.paymentStatus ?? t("admin.orders.noPayment")}</li>)}</ul></div>}
        <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium">{t("admin.support.statusLabel")}<select value={status} onChange={event => setStatus(event.target.value as AdminTicket["status"])} className="mt-1 min-h-10 w-full rounded-lg border border-steel-300 bg-white px-3 dark:border-steel-700 dark:bg-steel-950">{statuses.map(value => <option value={value} key={value}>{t(`admin.support.status.${value}`)}</option>)}</select></label><label className="text-sm font-medium">{t("admin.support.assignee")}<select value={assignee} onChange={event => setAssignee(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-steel-300 bg-white px-3 dark:border-steel-700 dark:bg-steel-950"><option value="">{t("admin.support.unassigned")}</option>{staff.map(person => <option key={person.userId} value={person.userId}>{person.name || person.email} · {t(`admin.roles.${person.role}`)}</option>)}</select></label></div>
        <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium">{t("admin.support.reason")}<textarea required value={reason} onChange={event => setReason(event.target.value)} maxLength={1000} className="mt-1 min-h-20 w-full rounded-lg border border-steel-300 bg-transparent p-3 dark:border-steel-700" /></label><label className="text-sm font-medium">{t("admin.support.internalNote")}<textarea value={note} onChange={event => setNote(event.target.value)} maxLength={5000} className="mt-1 min-h-20 w-full rounded-lg border border-steel-300 bg-transparent p-3 dark:border-steel-700" /></label></div>
        <button type="button" disabled={busy || !reason.trim()} onClick={() => void save()} className="rounded-lg bg-ink-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-loop-700">{busy ? t("admin.saving") : t("admin.support.save")}</button>
        <div className="border-t border-steel-200 pt-3 dark:border-steel-800"><h3 className="text-sm font-semibold">{t("admin.support.privateNotes")}</h3>{detail.ticket.notes.length ? <ul className="mt-2 space-y-2">{detail.ticket.notes.map(item => <li key={item.id} className="rounded-lg bg-warning-50 p-3 text-sm dark:bg-warning-950"><p>{item.body}</p><p className="mt-1 text-xs text-steel-500">{item.authorEmail} · {new Date(item.createdAt).toLocaleString()}</p></li>)}</ul> : <p className="mt-1 text-sm text-steel-500">{t("admin.support.noNotes")}</p>}</div>
      </section>}
    </div>
  </div>;
}

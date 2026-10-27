import Button from "@/components/ui/button/Button";
import type { Booking } from "@shared/domain/types";
import { CheckCircleIcon, TruckDelivery } from "@/icons";
import { useGreenLoopStore } from "@/store/GreenLoopStore.helpers";
import { cn, formatStamp } from "@/utils";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

export default function OrderTracking({ booking, workspace }: { booking: Booking; workspace?: string }) {
  const { t } = useTranslation();
  const { dataset, updateDeliveryAction, dispatchAction, acceptRequestAction, rescheduleRequestAction } = useGreenLoopStore();
  const [saving, setSaving] = useState(false);
  const [isRescheduling, setIsRescheduling] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const events = dataset.events.filter(event => event.subjectIds.includes(booking.id)).sort((a, b) => a.at.localeCompare(b.at));
  const eventFor = (kind: string) => events.find(event => event.kind === kind);
  const booked = eventFor("request.accepted") ?? eventFor("offer.accepted");
  const ready = eventFor("delivery.ready");
  const picked = eventFor("delivery.picked-up");
  const dispatched = eventFor("load.dispatched");
  const arrived = eventFor("delivery.arrived");
  const received = eventFor("delivery.received");
  const verification = dataset.verifications.find(record => record.bookingId === booking.id);
  const inTransit = Boolean(dispatched || booking.loadRef);
  const delivered = Boolean(verification || received);
  const cancelled = booking.status === "cancelled";
  const steps = [
    { key: "booked", complete: Boolean(booking.receiverAcceptedAt), at: booking.receiverAcceptedAt, actor: booked?.actor.name },
    { key: "pendingPickup", complete: Boolean(ready), at: ready?.at, actor: ready?.actor.name },
    { key: "picked", complete: Boolean(picked), at: picked?.at, actor: picked?.actor.name },
    { key: "inTransit", complete: inTransit, at: dispatched?.at, actor: dispatched?.actor.name },
    { key: "destination", complete: Boolean(arrived || delivered), at: arrived?.at ?? received?.at, actor: arrived?.actor.name ?? received?.actor.name },
    { key: "delivered", complete: delivered, at: received?.at, actor: received?.actor.name },
  ];
  const current = steps.reduce((last, step, index) => step.complete ? index : last, -1);
  const status = cancelled ? "cancelled" : current < 0 ? "awaitingAcceptance" : steps[current].key;
  const nextStage = inTransit ? "arrived" : picked ? null : ready ? "picked-up" : "ready";
  const canUpdate = workspace === "provider" && booking.status === "confirmed" && Boolean(booking.receiverAcceptedAt) && !delivered && !arrived;
  const run = async (action: () => Promise<boolean>) => {
    if (saving) return;
    setSaving(true);
    try { await action(); } finally { setSaving(false); }
  };

  return <section className="mt-card overflow-hidden rounded-surface border border-steel-200 dark:border-steel-700" aria-label={t("orderTracking.title")}>
    <div className="bg-ink-900 px-5 py-4 text-white dark:bg-loop-900">
      <p className="text-xs font-semibold uppercase tracking-wide text-white/70">{t("orderTracking.title")}</p>
      <h4 className="mt-1 font-archivo text-2xl font-bold">{t(`orderTracking.${status}`)}</h4>
      {booking.loadRef && <p className="mt-1 text-xs text-white/80">{t("orderTracking.loadRef")}: {booking.loadRef}</p>}
    </div>
    <div className="space-y-card gl-card-pad">
      <div className="overflow-x-auto pt-1 pb-3">
      <ol className="grid min-w-4xl grid-cols-6">
        {steps.map((step, index) => <li key={step.key} aria-current={index === current && !cancelled ? "step" : undefined} className="relative flex min-w-0 flex-col items-center gap-3 text-center">
          {index < steps.length - 1 && <span aria-hidden="true" className={cn("absolute start-1/2 top-4 h-0.5 w-full", step.complete && steps[index + 1].complete ? "bg-orange-500" : "bg-steel-200 dark:bg-steel-700")} />}
          <span className={cn("relative z-1 flex size-8 shrink-0 items-center justify-center rounded-full", step.complete ? "bg-orange-500 text-white" : "bg-steel-100 text-steel-500 dark:bg-steel-800 dark:text-steel-400", index === current && !cancelled && "ring-2 ring-orange-300 ring-offset-2 dark:ring-offset-steel-900")}>
            {step.complete ? index === 5 ? <TruckDelivery className="size-4" /> : <CheckCircleIcon className="size-5" /> : <span className="text-xs">{index + 1}</span>}
          </span>
          <div className="w-full min-w-0 px-2">
            <p className={cn("text-sm font-semibold", step.complete ? "text-ink-900 dark:text-white" : "text-steel-500 dark:text-steel-400")}>{t(`orderTracking.${step.key}`)}</p>
            {step.at ? <>
              <time dateTime={step.at} className="mt-1 block text-xs text-steel-500 dark:text-steel-400">{formatStamp(step.at)}</time>
              {step.actor && <p title={step.actor} className="mt-1 truncate text-xs text-steel-500 dark:text-steel-400">{step.actor}</p>}
            </> : <p className="mt-1 text-xs text-steel-500 dark:text-steel-400">{t(step.complete || index < current ? "orderTracking.notRecorded" : "orderTracking.waiting")}</p>}
          </div>
        </li>)}
      </ol>
      </div>
      <div className="space-y-4 border-t border-steel-200 pt-5 dark:border-steel-700">
        {workspace === "receiver" && !booking.receiverAcceptedAt && !cancelled && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-900/60 dark:bg-amber-950/25">
            <h5 className="font-archivo text-sm font-bold text-amber-950 dark:text-amber-200">Delivery Availability Requested</h5>
            <p className="mt-1 text-xs text-amber-900/80 dark:text-amber-300/80">
              The provider proposed this delivery. Please confirm availability, choose another date, or discuss delivery with the provider.
            </p>
            {isRescheduling ? (
              <div className="mt-3 space-y-2">
                <label htmlFor={`reschedule-date-${booking.id}`} className="block text-xs font-semibold text-steel-700 dark:text-steel-300">New delivery date:</label>
                <input
                  id={`reschedule-date-${booking.id}`}
                  type="date"
                  min={new Date().toISOString().slice(0, 10)}
                  value={rescheduleDate}
                  onChange={e => setRescheduleDate(e.target.value)}
                  className="block w-full rounded-md border border-steel-300 bg-white px-3 py-2 text-sm text-ink-900 dark:border-steel-700 dark:bg-black dark:text-white"
                />
                <div className="flex gap-2">
                  <Button size="sm" disabled={!rescheduleDate || saving} onClick={() => run(async () => {
                    const ok = await rescheduleRequestAction(booking.id, rescheduleDate);
                    if (ok) setIsRescheduling(false);
                    return ok;
                  })}>
                    Confirm New Date
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setIsRescheduling(false)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" disabled={saving} onClick={() => run(() => acceptRequestAction(booking.id))}>
                  Confirm Availability
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setIsRescheduling(true); setRescheduleDate(new Date().toISOString().slice(0, 10)); }}>
                  Choose Another Date
                </Button>
                <Link
                  to={booking.offerId ? `/app/negotiations/${encodeURIComponent(booking.offerId)}` : `/app/orders/${encodeURIComponent(booking.id)}`}
                  className="inline-flex min-h-9 items-center justify-center rounded-xl border border-steel-200 bg-white px-3 text-xs font-semibold text-steel-700 hover:bg-steel-50 dark:border-steel-700 dark:bg-ink-900 dark:text-steel-200"
                >
                  Discuss Delivery
                </Link>
              </div>
            )}
          </div>
        )}
        <p className="text-sm text-steel-600 dark:text-steel-400">{t("orderTracking.explanation")}</p>
        {canUpdate && <div className="space-y-3">
          {nextStage && <Button size="sm" disabled={saving} onClick={() => run(() => updateDeliveryAction(booking.id, nextStage))}>{t(`orderTracking.action.${nextStage}`)}</Button>}
          {!inTransit && picked && <Button size="sm" disabled={saving} onClick={() => run(() => dispatchAction({ bookingId: booking.id }))}>{t("orderTracking.action.dispatch")}</Button>}
        </div>}
        {workspace === "receiver" && inTransit && !delivered && !cancelled && <Link to={`/app/receiver/verification?booking=${encodeURIComponent(booking.id)}`} className="inline-flex rounded-lg bg-loop-600 px-4 py-3 text-sm font-semibold text-white hover:bg-loop-700 dark:bg-loop-700">{t("orderTracking.recordArrival")}</Link>}
        {delivered && <p className="rounded-lg bg-loop-50 p-3 text-sm text-loop-800 dark:bg-loop-900 dark:text-loop-200">{t(verification?.status === "pending" ? "orderTracking.verificationPending" : verification?.status === "rejected" ? "orderTracking.verificationRejected" : verification?.status === "verified" ? "orderTracking.verificationComplete" : "orderTracking.verificationPending")}</p>}
        <details className="text-sm text-steel-600 dark:text-steel-400">
          <summary className="cursor-pointer font-semibold">{t("orderTracking.history")}</summary>
          <ul className="mt-3 space-y-3">{events.map(event => <li key={event.id}><p>{event.summary}</p><time dateTime={event.at} className="text-xs">{formatStamp(event.at)} · {event.actor.name}</time></li>)}</ul>
        </details>
      </div>
    </div>
  </section>;
}

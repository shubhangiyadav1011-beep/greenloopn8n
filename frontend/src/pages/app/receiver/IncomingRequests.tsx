import PageMeta from "@/components/common/PageMeta";
import { LocationMap } from "@/components/greenloop/LocationMap";
import WorkflowPageHeader from "@/components/greenloop/WorkflowPageHeader";
import Button from "@/components/ui/button/Button";
import { ambientMedia, materialMediaFor } from "@/config/appMedia";
import { useAuth } from "@/context/AuthContext.helpers";
import { slotLedger, slotMatchesDemandPeriod } from "@shared/domain/capacity";
import { InboxAltIcon } from "@/icons";
import { useGreenLoopStore } from "@/store/GreenLoopStore.helpers";
import { formatINR, formatINRPerT } from "@/utils";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Link } from "react-router";

export default function IncomingRequests() {
  const { dataset, acceptRequestAction, rejectRequestAction, rescheduleRequestAction } = useGreenLoopStore();
  const { user } = useAuth();
  const receiverId = user?.receiverId ?? "";
  
  const requests = dataset.bookings.filter((booking) => booking.receiverId === receiverId &&
    ((booking.status === "hold") || (booking.status === "confirmed" && !booking.receiverAcceptedAt && !booking.loadRef && !dataset.verifications.some((item) => item.bookingId === booking.id))));

  const [reschedulingId, setReschedulingId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);

  return (
    <div className="relative min-h-screen pb-24">
      <PageMeta title="Incoming Requests | GreenLoop" description="Review provider requests for receiving capacity." />
      <WorkflowPageHeader
        title="Incoming Requests"
        description="Providers are asking to book space at your facility. Confirm the amount you can receive, choose another date, or decline."
        status={`${requests.length} request${requests.length === 1 ? "" : "s"} waiting for your decision`}
      />

      {/* Provider requests — the yard gate these bookings arrive at */}
      <figure className="relative mb-section h-40 w-full overflow-hidden rounded-lg border border-steel-200 sm:h-52 lg:h-60 dark:border-steel-800">
        <img
          src={ambientMedia.authYard.src}
          alt={ambientMedia.authYard.alt}
          className="size-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950/75 via-ink-950/25 to-ink-950/10" aria-hidden="true" />
        <figcaption className="absolute inset-x-0 bottom-0 px-6 pb-5 sm:px-8 sm:pb-6">
          <p className="font-archivo text-lg font-bold uppercase tracking-wide text-white sm:text-xl">Provider requests</p>
          <p className="mt-1 text-sm text-white/80">Review and confirm requests to keep your facility running efficiently.</p>
        </figcaption>
      </figure>

      {requests.length === 0 ? (
        <div className="flex min-h-[42vh] flex-col items-center justify-center border border-steel-200 bg-white/70 px-6 py-14 text-center dark:border-steel-800 dark:bg-white/[0.02] rounded-surface">
          <span className="flex size-16 items-center justify-center rounded-full bg-loop-50 dark:bg-loop-500/10">
            <InboxAltIcon className="size-8 text-loop-600 dark:text-loop-400" />
          </span>
          <h2 className="mt-5 font-archivo text-2xl font-bold text-ink-900 dark:text-white">No incoming requests</h2>
          <p className="mt-2 max-w-md text-steel-600 dark:text-gray-400">
            When a provider requests receiving capacity and it requires manual approval, requests will appear here.
          </p>
          <Button size="md" className="mt-6" startIcon={<InboxAltIcon className="size-4" />} onClick={() => window.location.assign("/app/support")}>Learn more</Button>
        </div>
      ) : (
        <div className="grid gap-card">
          <AnimatePresence>
            {requests.map(booking => {
              const material = dataset.materials.find(m => m.id === booking.materialId);
              const project = dataset.projects.find(p => p.id === material?.projectId);
              const slot = dataset.slots.find(s => s.id === booking.slotId);
              const demand = booking.demandId ? dataset.demands.find((item) => item.id === booking.demandId) : undefined;
              const receiver = dataset.receivers.find((item) => item.id === receiverId);
              const ledger = slot ? slotLedger(dataset, slot.id) : null;
              const committedMaterialT = dataset.bookings.filter((item) => item.id !== booking.id && item.materialId === booking.materialId && item.status !== "cancelled")
                .reduce((total, item) => total + item.tonnesT, 0);
              const materialRemainingT = Math.max(0, (material?.quantityT ?? 0) - committedMaterialT);
              const committedDemandT = booking.demandId ? dataset.bookings.filter((item) => item.id !== booking.id && item.demandId === booking.demandId && item.status !== "cancelled")
                .reduce((total, item) => total + item.tonnesT, 0) : 0;
              const demandRemainingT = demand ? Math.max(0, demand.requiredT - committedDemandT) : Infinity;
              const confirmableT = Math.max(0, Math.min(ledger?.available ?? 0, materialRemainingT, demandRemainingT));

              const isRescheduling = reschedulingId === booking.id;

              // Find alternative slots for this material
              const alternativeSlots = dataset.slots.filter(s => s.receiverId === receiverId && s.materialType === material?.type && s.date >= new Date().toISOString().slice(0, 10) && s.id !== slot?.id && (!demand || slotMatchesDemandPeriod(s, demand.period)) && (slotLedger(dataset, s.id)?.available ?? 0) >= booking.tonnesT);

              return (
                <motion.article
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  key={booking.id}
                  className="overflow-hidden border border-steel-200 bg-white shadow-xs transition-colors hover:border-steel-400 dark:border-steel-800 dark:bg-white/[0.02] dark:hover:border-steel-600 rounded-surface"
                >
                  <div className="gl-card-pad">
                    <div className="grid gap-card md:grid-cols-[10rem_1fr]">
                      <img
                        src={materialMediaFor(material?.type ?? "concrete").src}
                        alt=""
                        loading="lazy"
                        className="h-28 w-full rounded-md border border-steel-200 object-cover md:h-full md:min-h-28 dark:border-steel-800"
                      />
                      <div>
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="shrink-0 rounded-sm bg-signal-50 px-2.5 py-1 font-mono text-xs font-medium uppercase tracking-[0.06em] text-signal-700 dark:bg-signal-500/15 dark:text-signal-300">
                            {booking.status === "hold" ? "Waiting on Capacity" : "Needs your approval"}
                          </span>
                          <p className="text-sm font-semibold text-ink-900 dark:text-white">{project?.name ?? "Provider"} wants {booking.tonnesT.toFixed(1)} t {material?.type ?? "material"} {slot?.date ? `on ${slot.date}` : ""}.</p>
                        </div>

                        <div className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
                          <div>
                            <p className="eyebrow-label text-steel-500 dark:text-steel-400">Material</p>
                            <p className="mt-1.5 font-semibold text-ink-900 dark:text-white capitalize">{material?.type}</p>
                            <details className="mt-1 text-xs text-steel-500"><summary className="cursor-pointer">View details ▾</summary><span className="mt-1 block">Material Passport ID: {material?.id} · Request ID: {booking.id}</span></details>
                          </div>
                          <div>
                            <p className="eyebrow-label text-steel-500 dark:text-steel-400">Project</p>
                            <p className="mt-1.5 font-semibold text-ink-900 dark:text-white">{project?.name}</p>
                          </div>
                          <div>
                            <p className="eyebrow-label text-steel-500 dark:text-steel-400">Requested slot</p>
                            <p className="mt-1.5 font-semibold text-ink-900 dark:text-white">{slot?.date}</p>
                            {booking.holdReason && <p className="mt-0.5 text-sm text-signal-600 dark:text-signal-400">{booking.holdReason.replaceAll("HOLD", "Waiting on Capacity")}</p>}
                          </div>
                          <div>
                            <p className="eyebrow-label text-steel-500 dark:text-steel-400">Requested quantity</p>
                            <p className="ledger-numeral mt-1.5 text-2xl font-bold tracking-tight text-ink-900 dark:text-white">
                              {booking.tonnesT.toFixed(1)} <span className="text-sm font-bold text-steel-400">t</span>
                            </p>
                            <p className="mt-1 text-xs font-semibold text-loop-700 dark:text-loop-300">{material?.pricePerT !== undefined ? `Indicative ${formatINRPerT(material.pricePerT)} · ${formatINR(material.pricePerT * booking.tonnesT)}` : "Price on request"}</p>
                          </div>
                        </div>

                        {(demand?.geo ?? receiver?.geo) && <LocationMap geo={demand?.geo ?? receiver?.geo} className="mt-4 h-44" />}
                        {ledger && (
                          <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md bg-steel-50 px-4 py-3 text-sm dark:bg-white/5">
                            <span className="font-medium text-steel-700 dark:text-gray-300">Capacity on {slot?.date}:</span>
                            <span className="font-bold text-ink-900 dark:text-white">{ledger.available.toFixed(1)} t free</span>
                            <span className="text-steel-500">/</span>
                            <span className="text-steel-600 dark:text-gray-400">{ledger.reserved.toFixed(1)} t reserved</span>
                            {booking.status === "hold" && ledger.available < booking.tonnesT && <span className="basis-full text-signal-700 dark:text-signal-300">You have {ledger.available.toFixed(1)} t free; this request is for {booking.tonnesT.toFixed(1)} t.</span>}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-6 flex flex-col gap-3 border-t border-steel-100 pt-5 md:mt-0 md:border-t-0 dark:border-steel-800/60">
                      {isRescheduling ? (
                        <div className="flex flex-col gap-3 rounded-lg border border-steel-200 bg-steel-50/70 p-4 dark:border-steel-700 dark:bg-steel-900/40">
                          <div>
                            <label htmlFor={`date-input-${booking.id}`} className="block text-xs font-semibold text-steel-700 dark:text-steel-300">
                              Proposed Delivery Date
                            </label>
                            <input
                              id={`date-input-${booking.id}`}
                              type="date"
                              min={new Date().toISOString().slice(0, 10)}
                              value={selectedDate}
                              onChange={e => { setSelectedDate(e.target.value); setRescheduleError(null); }}
                              className="mt-1 block w-full rounded-md border border-steel-300 bg-white px-3 py-2 text-sm text-ink-900 shadow-sm focus:border-loop-500 focus:ring-loop-500 dark:border-steel-700 dark:bg-black dark:text-white"
                            />
                          </div>

                          {alternativeSlots.length > 0 && (
                            <div>
                              <p className="text-xs text-steel-500 dark:text-steel-400">Or quick-pick from existing open slots:</p>
                              <div className="mt-1 flex flex-wrap gap-1.5">
                                {alternativeSlots.map(s => {
                                  const l = slotLedger(dataset, s.id);
                                  return (
                                    <button
                                      type="button"
                                      key={s.id}
                                      onClick={() => { setSelectedDate(s.date); setRescheduleError(null); }}
                                      className={`rounded border px-2 py-1 text-xs font-medium transition ${selectedDate === s.date ? "border-loop-600 bg-loop-50 text-loop-800 dark:border-loop-400 dark:bg-loop-900/30 dark:text-loop-200" : "border-steel-200 bg-white text-steel-700 hover:border-steel-400 dark:border-steel-700 dark:bg-steel-800 dark:text-steel-300"}`}
                                    >
                                      {s.date} ({l?.available.toFixed(1)}t free)
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {rescheduleError && (
                            <p role="alert" className="text-xs font-semibold text-error-600 dark:text-error-400">{rescheduleError}</p>
                          )}

                          <div className="flex items-center gap-2">
                            <Button size="sm" disabled={!selectedDate} onClick={async () => {
                              setRescheduleError(null);
                              const success = await rescheduleRequestAction(booking.id, selectedDate);
                              if (success) {
                                setReschedulingId(null);
                                setSelectedDate("");
                              } else {
                                setRescheduleError("Capacity unavailable on this date or outside request period.");
                              }
                            }}>
                              Save New Date
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => { setReschedulingId(null); setRescheduleError(null); }}>
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-end">
                          {booking.receiverAcceptedAt ? (
                            <span className="text-xs font-semibold uppercase tracking-wider text-loop-700 dark:text-loop-300">
                              ✓ Availability Confirmed
                            </span>
                          ) : (
                            <Button
                              size="sm"
                              disabled={booking.status === "hold" && confirmableT <= 0}
                              onClick={() => acceptRequestAction(booking.id, booking.status === "hold" && confirmableT < booking.tonnesT ? confirmableT : undefined)}
                            >
                              {booking.status === "confirmed" ? "Confirm Availability" : booking.status === "hold" && confirmableT < booking.tonnesT ? `Confirm Availability (${confirmableT.toFixed(1)} t)` : "Confirm Availability"}
                            </Button>
                          )}

                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setReschedulingId(booking.id);
                              setSelectedDate(slot?.date ?? new Date().toISOString().slice(0, 10));
                              setRescheduleError(null);
                            }}
                          >
                            Choose Another Date
                          </Button>

                          <Link
                            to={booking.offerId ? `/app/negotiations/${booking.offerId}` : `/app/orders/${booking.id}`}
                            className="inline-flex min-h-9 items-center justify-center rounded-xl border border-steel-200 bg-white px-3.5 text-sm font-semibold text-steel-700 shadow-2xs transition hover:bg-steel-50 dark:border-steel-700 dark:bg-steel-800 dark:text-steel-200 dark:hover:bg-steel-700"
                          >
                            Discuss Delivery
                          </Link>

                          <Button size="sm" variant="outline" onClick={() => rejectRequestAction(booking.id)}>
                            Decline
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.article>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

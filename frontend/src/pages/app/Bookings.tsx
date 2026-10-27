import PageMeta from "@/components/common/PageMeta";
import NegotiationPanel from "@/components/greenloop/NegotiationPanel";
import StatusBadge from "@/components/greenloop/StatusBadge";
import Button from "@/components/ui/button/Button";
import { ambientMedia, materialMediaFor, receiverMediaFor } from "@/config/appMedia";
import { useAuth } from "@/context/AuthContext.helpers";
import { slotLedger } from "@shared/domain/capacity";
import type { ReceiverDaySlot } from "@shared/domain/types";
import { useGreenLoopStore } from "@/store/GreenLoopStore.helpers";
import { cn, formatDate, formatINR, formatINRPerT } from "@/utils";
import { motion } from "motion/react";
import { Link } from "react-router";

const TYPE_LABEL: Record<string, string> = {
  concrete: "Concrete",
  brick: "Brick",
  steel: "Steel",
  timber: "Timber",
  plasterboard: "Plasterboard",
  glass: "Glass",
};

export default function Bookings() {
  const { dataset, cancelBookingAction, archiveBookingAction } = useGreenLoopStore();
  const { user } = useAuth();
  const materialLabel = (id: string) => {
    const material = dataset.materials.find((item) => item.id === id);
    return material ? `${TYPE_LABEL[material.type] ?? material.type} · ${id}` : id;
  };
  const receiverName = (id: string) => dataset.receivers.find((receiver) => receiver.id === id)?.name ?? id;
  const slotById = (slotId: string) => dataset.slots.find((slot) => slot.id === slotId);
  const orderedSlots = [...dataset.slots].sort((a, b) => a.date.localeCompare(b.date) || a.receiverId.localeCompare(b.receiverId));
  const totalCapacity = dataset.slots.reduce((total, slot) => total + slot.capacityT, 0);
  const totalReserved = dataset.slots.reduce((total, slot) => total + (slotLedger(dataset, slot.id)?.reserved ?? 0), 0);
  const totalHeld = dataset.slots.reduce((total, slot) => total + (slotLedger(dataset, slot.id)?.heldT ?? 0), 0);
  const totalAvailable = Math.max(0, totalCapacity - totalReserved);
  const activeBookings = dataset.bookings.filter((booking) =>
    (booking.status === "confirmed" || booking.status === "hold")
    && !booking.archivedAt
    && !dataset.verifications.some((verification) => verification.bookingId === booking.id && verification.status === "verified"),
  );

  return (
    <div className="mx-auto max-w-app pb-16">
      <PageMeta title="Bookings | GreenLoop" description="Dated receiver intake slots, held requests, confirmed bookings, and available capacity." />

      <section className="relative mb-5 grid min-h-[175px] overflow-hidden border border-[#e5e1d8] bg-[#192c20] dark:border-steel-800 sm:min-h-[190px] lg:grid-cols-[1fr_auto] rounded-surface">
        <img src={ambientMedia.sortingFacility.src} alt={ambientMedia.sortingFacility.alt} className="absolute inset-0 size-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#17291e]/95 via-[#17291e]/75 to-[#17291e]/10" />
        <div className="relative z-10 flex flex-col items-start justify-center px-5 py-6 sm:px-8 sm:py-7">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#c7d5c8]">GreenLoop Operations</p>
          <h1 className="mt-1.5 font-archivo font-bold tracking-tight text-white gl-page-title">Bookings</h1>
          <p className="mt-3 border border-white/20 bg-[#102118]/45 px-3 py-1.5 text-xs font-medium text-white/90 backdrop-blur-sm rounded-surface">Status: {activeBookings.length} active · {totalAvailable.toFixed(1)} t free · {totalReserved.toFixed(1)} t reserved</p>
        </div>
        <div className="relative z-10 hidden items-center justify-end px-6 lg:flex">
          {activeBookings.length ? (
            <a href="#active-bookings" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/35 bg-[#163121]/65 px-4 text-xs font-semibold text-white backdrop-blur-sm transition hover:bg-[#244a32]">View active bookings <span aria-hidden="true">→</span></a>
          ) : (
            <a href="/app/market-demand?view=receivers" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/35 bg-[#163121]/65 px-4 text-xs font-semibold text-white backdrop-blur-sm transition hover:bg-[#244a32]">Find receiving capacity <span aria-hidden="true">→</span></a>
          )}
        </div>
        <div className="relative z-10 flex justify-end border-t border-white/15 px-5 py-3 lg:hidden">
          {activeBookings.length ? <a href="#active-bookings" className="text-xs font-semibold text-white underline underline-offset-4">View active bookings →</a> : <a href="/app/market-demand?view=receivers" className="text-xs font-semibold text-white underline underline-offset-4">Find receiving capacity →</a>}
        </div>
      </section>

      <section className="mb-section border border-[#e5e2da] bg-white shadow-[0_2px_10px_rgba(26,42,31,0.035)] dark:border-steel-800 dark:bg-[#17251d] gl-card-pad rounded-surface" aria-label="Receiving capacity totals">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#4b7956] dark:text-[#b8d0bd]">Receiving capacity · all dated slots</p>
            <h2 className="mt-1 font-archivo text-xl font-bold text-[#26362c] dark:text-white">Capacity position</h2>
          </div>
          <p className="max-w-xl text-xs leading-4 text-[#7c857d] dark:text-gray-400">Confirmed bookings consume capacity. Held requests are pending and do not reduce free tonnes.</p>
        </div>
        <dl className="grid grid-cols-2 gap-2.5 xl:grid-cols-4">
          <CapacitySummary label="Total receiving capacity" value={`${totalCapacity.toFixed(1)} t`} tone="reserved" icon="capacity" />
          <CapacitySummary label="Available" value={`${totalAvailable.toFixed(1)} t`} tone="available" icon="available" />
          <CapacitySummary label="Reserved · confirmed" value={`${totalReserved.toFixed(1)} t`} tone="reserved" icon="reserved" />
          <CapacitySummary label="Held · awaiting capacity" value={`${totalHeld.toFixed(1)} t`} tone="held" icon="held" />
        </dl>
        <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-[#e8ebe6] dark:bg-steel-800" role="img" aria-label={`${totalReserved.toFixed(1)} tonnes reserved of ${totalCapacity.toFixed(1)} tonnes total capacity`}>
          <div className="h-full rounded-full bg-[#5b8965] transition-[width]" style={{ width: `${totalCapacity > 0 ? Math.min(100, (totalReserved / totalCapacity) * 100) : 0}%` }} />
        </div>
        <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-[#7c857d] dark:text-gray-400">
          <span>{totalReserved.toFixed(1)} t confirmed and reserved</span>
          <span>{totalAvailable.toFixed(1)} t still available</span>
        </div>
      </section>

      <section id="active-bookings" className="mb-section" aria-label="Active bookings">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#4b7956] dark:text-[#b8d0bd]">Current reservations</p>
            <h2 className="mt-1 font-archivo text-xl font-bold text-[#26362c] dark:text-white sm:text-2xl">Active bookings <span className="text-sm font-semibold text-[#8a938b]">({activeBookings.length})</span></h2>
          </div>
          {activeBookings.length > 0 && <p className="text-xs text-[#7c857d] dark:text-gray-400">Confirmed and waiting on capacity</p>}
        </div>
        {activeBookings.length ? (
          <div className="grid gap-detail">
            {activeBookings.map((booking, index) => {
              const slot = slotById(booking.slotId);
              const receiver = receiverName(booking.receiverId);
              const material = dataset.materials.find((item) => item.id === booking.materialId);
              const contact = dataset.transactionContacts?.find((item) => item.materialId === booking.materialId && item.receiverId === booking.receiverId);
              const relatedOffer = dataset.offers?.find((offer) => offer.demandId === booking.demandId && offer.passportId === booking.materialId);
              const unitPrice = booking.agreedPricePerT ?? relatedOffer?.agreedPricePerT ?? relatedOffer?.pricePerT ?? material?.pricePerT;
              const dispatched = Boolean(booking.loadRef);
              const label = booking.status === "hold" ? "Waiting on Capacity" : dispatched ? "On the road" : booking.receiverAcceptedAt ? "Confirmed · Ready to send" : "Waiting for receiver approval";
              const photo = materialMediaFor(material?.type ?? "concrete");
              return (
                <motion.article key={booking.id} initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: Math.min(index * 0.04, 0.2) }} className="grid overflow-hidden border border-[#e5e2da] bg-white shadow-[0_2px_10px_rgba(26,42,31,0.035)] transition hover:border-[#bfccbf] dark:border-steel-800 dark:bg-[#17251d] dark:hover:border-[#506957] sm:grid-cols-[140px_minmax(0,1fr)_160px] rounded-surface">
                  <div className="relative min-h-[112px] overflow-hidden bg-[#ecebe5] dark:bg-[#24372b]">
                    <img src={photo.src} alt={photo.alt} loading="lazy" className="absolute inset-0 size-full object-cover" />
                  </div>
                  <div className="min-w-0 p-3.5 sm:p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={booking.status} />
                      <p className="text-xs font-semibold uppercase tracking-wide text-[#7c857d] dark:text-gray-400">{label}</p>
                    </div>
                    <h3 className="mt-2 truncate font-archivo text-base font-bold uppercase tracking-wide text-[#2b3c30] dark:text-white">{materialLabel(booking.materialId)}</h3>
                    <p className="mt-1 truncate text-xs text-[#778078] dark:text-gray-400">{receiver} · {slot ? formatDate(slot.date) : "Date pending"}</p>
                    <details className="mt-2 text-xs text-[#526b58] dark:text-[#b6cfbd]">
                      <summary className="w-fit cursor-pointer font-semibold">View booking details →</summary>
                      <p className="mt-1.5 leading-5 text-[#778078] dark:text-gray-400">Booking ID: {booking.id} · Match ID: {booking.allocationId} · Receiving slot: {booking.slotId} · Capacity after booking: {booking.capacityAfterT.toFixed(1)} t free</p>
                      {booking.holdReason && <p className="mt-1 text-signal-700 dark:text-signal-300">{booking.holdReason}</p>}
                    </details>
                    {contact && <details className="mt-2 text-xs text-[#526b58] dark:text-[#b6cfbd]">
                      <summary className="w-fit cursor-pointer font-semibold">{user?.activeWorkspace === "receiver" ? "Provider" : "Receiver"} contact details</summary>
                      <div className="mt-1.5 leading-5 text-[#778078] dark:text-gray-400">
                        <p className="font-semibold text-[#405b46] dark:text-gray-200">{contact.name} · {contact.organization}</p>
                        <a className="block underline underline-offset-2" href={`mailto:${contact.email}`}>{contact.email}</a>
                        {contact.phone && <a className="block underline underline-offset-2" href={`tel:${contact.phone}`}>{contact.phone}</a>}
                      </div>
                    </details>}
                    <details className="mt-2 text-xs text-[#526b58] dark:text-[#b6cfbd]">
                      <summary className="w-fit cursor-pointer font-semibold">Transaction analysis →</summary>
                      <div className="mt-2">
                        {relatedOffer ? <NegotiationPanel offer={relatedOffer} canCounter={false} onCounter={async () => false} /> : <p className="border border-steel-200 bg-steel-50 p-3 text-xs text-steel-600 dark:border-steel-800 dark:bg-white/[0.03] dark:text-gray-300 rounded-surface">{unitPrice !== undefined ? `No offer ledger · ${formatINRPerT(unitPrice)} · ${formatINR(unitPrice * booking.tonnesT)}` : "Price on request"}</p>}
                        <p className="mt-2 font-semibold">Transaction status · {label}</p>
                      </div>
                    </details>
                  </div>
                  <div className="flex flex-row items-center justify-between gap-3 border-t border-[#eeeae2] bg-[#f8f7f2] p-3.5 sm:flex-col sm:items-end sm:justify-center sm:border-l sm:border-t-0 sm:p-4 dark:border-steel-800 dark:bg-[#1c2b22]">
                    <div className="sm:text-right">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#929990] sm:hidden">Quantity</p>
                      <p className="font-archivo text-xl font-bold text-[#26362c] dark:text-white">{booking.tonnesT.toFixed(1)} t</p>
                      <p className="mt-0.5 text-xs text-[#7c857d] dark:text-gray-400">{booking.status === "hold" ? "Next: capacity review" : dispatched ? "Load dispatched" : booking.receiverAcceptedAt ? "Next: send load" : "Next: receiver approval"}</p>
                      <p className="mt-1 text-xs font-semibold text-[#426b4c] dark:text-loop-300">{unitPrice !== undefined ? `${formatINRPerT(unitPrice)} · ${formatINR(unitPrice * booking.tonnesT)}` : "Price on request"}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {booking.status === "confirmed" && booking.receiverAcceptedAt && !dispatched && <Link to="/app/deliveries" className="inline-flex min-h-9 items-center justify-center rounded-lg bg-[#315f3d] px-3 text-xs font-semibold text-white hover:bg-[#274d32]">Send load →</Link>}
                      {booking.status === "hold" && <Link to="/app/market-demand?view=receivers" className="inline-flex min-h-9 items-center justify-center rounded-lg bg-[#315f3d] px-3 text-xs font-semibold text-white hover:bg-[#274d32]">Find another slot →</Link>}
                      {dispatched && <Link to="/app/deliveries" className="inline-flex min-h-9 items-center justify-center rounded-lg bg-[#315f3d] px-3 text-xs font-semibold text-white hover:bg-[#274d32]">View load →</Link>}
                    </div>
                  </div>
                </motion.article>
              );
            })}
          </div>
        ) : <p className="border border-[#e5e2da] bg-white text-sm text-[#69766c] dark:border-steel-800 dark:bg-[#17251d] dark:text-gray-400 gl-card-pad rounded-surface">No active bookings. Find a receiver to request a slot for your material.</p>}
      </section>

      <section aria-labelledby="slots-heading" className="mb-section border border-[#e5e2da] bg-white shadow-[0_2px_10px_rgba(26,42,31,0.035)] dark:border-steel-800 dark:bg-[#17251d] gl-card-pad rounded-surface">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#4b7956] dark:text-[#b8d0bd]">Dated intake</p>
            <h2 id="slots-heading" className="mt-1 font-archivo text-xl font-bold text-[#26362c] dark:text-white sm:text-2xl">Receiving slots by date</h2>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs font-medium text-[#69766c] dark:text-gray-400" aria-label="Capacity legend">
            <Legend color="bg-[#5b8965]" label="Reserved / confirmed" />
            <Legend color="bg-[#e3e7e1] dark:bg-steel-800" label="Available" />
            <Legend color="bg-[#d99550]" label="Held request" />
          </div>
        </div>

        {orderedSlots.length ? (
          <div className="relative space-y-3 before:absolute before:bottom-5 before:start-[0.78rem] before:top-4 before:w-px before:bg-[#dfe4dd] sm:before:start-[1.45rem] dark:before:bg-steel-800">
            {orderedSlots.map((slot, index) => (
              <motion.div key={slot.id} initial={{ opacity: 0, x: -8 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, margin: "-30px" }} transition={{ delay: Math.min(index * 0.03, 0.2), duration: 0.3 }}>
                <SlotTimelineItem slot={slot} receiverName={receiverName(slot.receiverId)} bookings={dataset.bookings.filter((booking) => booking.slotId === slot.id)} ledger={slotLedger(dataset, slot.id)} />
              </motion.div>
            ))}
          </div>
        ) : <p className="rounded-lg border border-dashed border-[#d8ddd5] px-5 py-8 text-center text-sm text-[#778078] dark:border-steel-700 dark:text-gray-400">No dated receiving slots are currently listed.</p>}
      </section>

      <details className="overflow-hidden border border-[#e5e2da] bg-white dark:border-steel-800 dark:bg-[#17251d] rounded-surface">
        <summary className="cursor-pointer list-none px-4 py-4 font-semibold text-[#2c3e31] marker:hidden dark:text-white sm:px-5">
          <span className="flex items-center justify-between gap-3">View booking history and capacity records <span aria-hidden="true" className="text-[#6c8370]">⌄</span></span>
        </summary>
        <section aria-labelledby="bookings-heading" className="border-t border-[#eeeae2] dark:border-steel-800 gl-card-pad">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#4b7956] dark:text-[#b8d0bd]">Reservation records</p>
              <h2 id="bookings-heading" className="mt-1 font-archivo text-xl font-bold text-[#26362c] dark:text-white">Booking and hold history</h2>
            </div>
            <Link to="/app/market-demand?view=receivers" className="text-xs font-semibold text-[#426b4c] underline underline-offset-4 hover:text-[#315f3d] dark:text-[#b8d0bd]">Find receiving capacity →</Link>
          </div>
          <div className="overflow-hidden rounded-lg border border-[#e5e2da] dark:border-steel-800">
            {dataset.bookings.map((booking, index) => {
              const slot = slotById(booking.slotId);
              const material = dataset.materials.find((item) => item.id === booking.materialId);
              const relatedOffer = dataset.offers?.find((offer) => offer.demandId === booking.demandId && offer.passportId === booking.materialId);
              const unitPrice = booking.agreedPricePerT ?? relatedOffer?.agreedPricePerT ?? relatedOffer?.pricePerT ?? material?.pricePerT;
              const cancelled = booking.status === "cancelled";
              const completed = dataset.verifications.some((item) => item.bookingId === booking.id && item.status === "verified");
              const dispatched = Boolean(booking.loadRef) || dataset.events.some((event) => event.kind === "load.dispatched" && event.subjectIds.includes(booking.id));
              return (
                <motion.article key={booking.id} initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ delay: Math.min(index * 0.03, 0.2) }} className={cn("border-b border-[#eeeae2] p-4 last:border-b-0 transition-colors hover:bg-[#f8f7f2] dark:border-steel-800 dark:hover:bg-white/[0.04]", cancelled && "opacity-60 grayscale")}>
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="grid grid-cols-2 gap-detail sm:flex sm:flex-wrap sm:gap-x-7 sm:gap-y-3">
                      <HistoryMetric label="Material" value={materialLabel(booking.materialId)} />
                      <HistoryMetric label="Receiver" value={receiverName(booking.receiverId)} />
                      <HistoryMetric label="Quantity" value={`${booking.tonnesT.toFixed(1)} t`} />
                      <HistoryMetric label="Unit price · total" value={unitPrice !== undefined ? `${formatINRPerT(unitPrice)} · ${formatINR(unitPrice * booking.tonnesT)}` : "Price on request"} />
                      <HistoryMetric label="Date / Slot" value={slot ? formatDate(slot.date) : booking.slotId} />
                      <div><p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#929990]">Status</p><div className="mt-1"><StatusBadge status={booking.archivedAt ? "archived" : completed ? "completed" : booking.status} /></div></div>
                    </div>
                    {(booking.status === "confirmed" || booking.status === "hold") && !dispatched && user?.activeWorkspace === "provider" && <Button size="sm" variant="outline" className="shrink-0 border-[#cbd4ca] dark:border-steel-700 dark:text-white dark:hover:border-white" onClick={() => cancelBookingAction({ bookingId: booking.id, reason: "Programme change — material retained on site" })}>Cancel</Button>}
                    {completed && !booking.archivedAt && <Button size="sm" variant="outline" className="shrink-0" onClick={() => archiveBookingAction(booking.id)}>Archive</Button>}
                    {booking.archivedAt && <span className="text-xs font-semibold text-steel-500">Archived {formatDate(booking.archivedAt)}</span>}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#eeeae2] pt-3 text-xs text-[#778078] dark:border-steel-800 dark:text-gray-400">
                    <span className="font-mono">ID: {booking.id}</span>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      {cancelled ? <span>{booking.cancelledReason ?? "Booking cancelled"}</span> : <><span className="font-semibold text-[#405b46] dark:text-gray-300">{booking.capacityAfterT.toFixed(1)} t free</span><span>(was {booking.capacityBeforeT.toFixed(1)} t before request)</span></>}
                    </div>
                  </div>
                  {booking.holdReason && <div className="mt-3 border border-signal-200 bg-signal-50 px-3 py-2 text-xs font-medium text-signal-900 dark:border-signal-500/40 dark:bg-signal-900/20 dark:text-signal-200 rounded-surface">{booking.holdReason}</div>}
                  <details className="mt-3 text-xs text-[#526b58] dark:text-[#b6cfbd]">
                    <summary className="w-fit cursor-pointer font-semibold">Transaction analysis →</summary>
                    <div className="mt-2">
                      {relatedOffer ? <NegotiationPanel offer={relatedOffer} canCounter={false} onCounter={async () => false} /> : <p className="border border-steel-200 bg-steel-50 p-3 text-xs text-steel-600 dark:border-steel-800 dark:bg-white/[0.03] dark:text-gray-300 rounded-surface">{unitPrice !== undefined ? `No offer ledger · ${formatINRPerT(unitPrice)} · ${formatINR(unitPrice * booking.tonnesT)}` : "Price on request"}</p>}
                      <p className="mt-2 font-semibold">Transaction status · {booking.status}</p>
                    </div>
                  </details>
                </motion.article>
              );
            })}
            {dataset.bookings.length === 0 && <p className="py-10 text-center text-sm text-[#778078] dark:text-gray-400">No bookings or holds in the current ledger.</p>}
          </div>
        </section>
      </details>
    </div>
  );
}

function SlotTimelineItem({ slot, receiverName, bookings, ledger }: {
  slot: ReceiverDaySlot;
  receiverName: string;
  bookings: ReturnType<typeof useGreenLoopStore>["dataset"]["bookings"];
  ledger: ReturnType<typeof slotLedger>;
}) {
  const confirmed = bookings.filter((booking) => booking.status === "confirmed");
  const held = bookings.filter((booking) => booking.status === "hold");
  const reservedT = ledger?.reserved ?? 0;
  const availableT = ledger?.available ?? slot.capacityT;
  const heldT = held.reduce((total, booking) => total + booking.tonnesT, 0);
  const reservedPercent = Math.min(100, (reservedT / Math.max(slot.capacityT, 0.1)) * 100);
  const date = new Date(`${slot.date}T12:00:00`);
  const dateLabel = formatDate(slot.date);
  const weekday = date.toLocaleDateString("en-GB", { weekday: "short" });
  const facilityImage = receiverMediaFor(slot.receiverId);

  return (
    <article className="relative grid gap-2.5 ps-7 sm:grid-cols-[70px_minmax(0,1fr)] sm:gap-4 sm:ps-10">
      <span className="absolute start-[0.4rem] top-4 z-10 size-2.5 -translate-x-1/2 rounded-full border-2 border-white bg-[#65896b] sm:start-[1.1rem] dark:border-[#17251d]" aria-hidden="true" />
      <div className="sm:pt-2">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#899189]">{weekday}</p>
        <p className="mt-0.5 font-archivo text-sm font-bold text-[#26362c] dark:text-white">{dateLabel}</p>
      </div>

      <div className="grid overflow-hidden border border-[#e5e2da] bg-white transition-colors hover:border-[#bfccbf] dark:border-steel-800 dark:bg-[#17251d] dark:hover:border-[#506957] md:grid-cols-[112px_minmax(0,1fr)] rounded-surface">
        <div className="relative min-h-[106px] overflow-hidden bg-[#ecebe5] dark:bg-[#24372b]">
          <img src={facilityImage.src} alt={facilityImage.alt} loading="lazy" className="absolute inset-0 size-full object-cover" />
        </div>
        <div className="min-w-0 p-3.5 sm:p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate font-archivo text-sm font-bold text-[#2b3c30] dark:text-white">{receiverName}</h3>
              <p className="mt-0.5 truncate text-xs text-[#7d867e] dark:text-gray-400">{TYPE_LABEL[slot.materialType] ?? slot.materialType} intake · {slot.id}</p>
            </div>
            <p className="font-archivo text-sm font-bold text-[#26362c] dark:text-white">{slot.capacityT.toFixed(1)} <span className="text-xs font-medium text-[#7d867e]">t limit</span></p>
          </div>

          <div className="mt-3 border-t border-[#efede7] pt-3 dark:border-white/[0.07]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className={cn("rounded-md border px-2 py-1 text-xs font-semibold uppercase tracking-wide", availableT > 0 ? "border-[#d9e1d7] bg-[#f4f6f2] text-[#617164] dark:border-steel-700 dark:bg-white/5 dark:text-steel-300" : "border-signal-200 bg-signal-50 text-signal-700 dark:border-signal-800 dark:bg-signal-900/20 dark:text-signal-300")}>
                {availableT > 0 ? `${availableT.toFixed(1)} t available` : "Full · 0 t available"}
              </span>
              <p className="text-xs font-semibold text-[#425446] dark:text-gray-200">{reservedT.toFixed(1)} t reserved <span className="font-normal text-[#7d867e]">of {slot.capacityT.toFixed(1)} t capacity</span></p>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#e5e8e2] dark:bg-steel-800" role="img" aria-label={`${reservedT.toFixed(1)} tonnes reserved, ${availableT.toFixed(1)} tonnes available, ${heldT.toFixed(1)} tonnes held`}>
              <div className="h-full rounded-full bg-[#5b8965]" style={{ width: `${reservedPercent}%` }} />
            </div>
            <div className="mt-1.5 flex flex-wrap justify-between gap-2 text-xs text-[#7c857d] dark:text-gray-400">
              <span>{availableT === slot.capacityT ? "No confirmed bookings" : `${reservedT.toFixed(1)} t confirmed`} · {availableT.toFixed(1)} t available</span>
              {held.length > 0 && <span className="font-medium text-[#a36b32] dark:text-[#e3b77e]">{heldT.toFixed(1)} t held · does not reduce free capacity</span>}
            </div>
          </div>

          {held.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">
            {held.map((booking) => <span key={booking.id} className="inline-flex items-center gap-1.5 rounded-md border border-[#ead4ba] bg-[#fbf4ea] px-2 py-1 text-xs font-medium text-[#8d5e2e] dark:border-signal-500/30 dark:bg-signal-500/10 dark:text-signal-300"><span className="size-1.5 rounded-full bg-[#d99550]" aria-hidden="true" />{booking.id} · {booking.tonnesT.toFixed(1)} t</span>)}
          </div>}
          {confirmed.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">
            {confirmed.map((booking) => <span key={booking.id} className="inline-flex items-center gap-1.5 rounded-md bg-[#eef3ed] px-2 py-1 text-xs font-medium text-[#425d47] dark:bg-white/10 dark:text-gray-200"><span className="size-1.5 rounded-full bg-[#5b8965]" aria-hidden="true" />{booking.id} · {booking.tonnesT.toFixed(1)} t</span>)}
          </div>}
        </div>
      </div>
    </article>
  );
}

function CapacitySummary({ label, value, tone, icon }: { label: string; value: string; tone: "available" | "reserved" | "held"; icon: "capacity" | "available" | "reserved" | "held" }) {
  const toneClass = tone === "held" ? "text-[#9c6832] dark:text-signal-300" : tone === "available" ? "text-[#426b4c] dark:text-loop-300" : "text-[#2e4033] dark:text-white";
  const icons = {
    capacity: <><path d="M4 7h16M6 7v12m12-12v12M4 19h16M7 4h10v3H7z" /></>,
    available: <><path d="M12 3 4.5 7v10l7.5 4 7.5-4V7L12 3Z" /><path d="m8.5 12 2.3 2.3 4.7-5" /></>,
    reserved: <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8 8h8m-8 4h8m-8 4h5" /></>,
    held: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  };
  return (
    <div className="flex min-h-[72px] items-center gap-2.5 border border-[#ebe8e0] bg-[#f8f7f2] px-3 py-2.5 dark:border-steel-800 dark:bg-[#1c2b22] rounded-surface">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-[#edf3ed] text-[#52785a] dark:bg-[#294334] dark:text-[#b6d1bd]">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="size-4">{icons[icon]}</svg>
      </span>
      <div className="min-w-0"><dt className="truncate text-xs font-semibold uppercase tracking-[0.1em] text-[#899189]">{label}</dt><dd className={cn("mt-0.5 font-archivo text-base font-bold", toneClass)}>{value}</dd></div>
    </div>
  );
}

function HistoryMetric({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#929990]">{label}</p><p className="mt-1 max-w-48 truncate text-xs font-semibold text-[#34483a] dark:text-white">{value}</p></div>;
}

function Legend({ color, label }: { color: string; label: string }) {
  return <span className="flex items-center gap-1.5"><span className={cn("size-2 rounded-full", color)} aria-hidden="true" />{label}</span>;
}

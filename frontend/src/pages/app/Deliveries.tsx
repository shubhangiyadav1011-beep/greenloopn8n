import PageMeta from "@/components/common/PageMeta";
import { LocationMap } from "@/components/greenloop/LocationMap";
import StatusBadge from "@/components/greenloop/StatusBadge";
import Button from "@/components/ui/button/Button";
import { ambientMedia, materialMediaFor } from "@/config/appMedia";
import type { Booking } from "@shared/domain/types";
import { useGreenLoopStore } from "@/store/GreenLoopStore.helpers";
import { cn, formatDate, formatINR, formatINRPerT, formatStamp } from "@/utils";
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

export default function Deliveries() {
  const { dataset } = useGreenLoopStore();
  const dispatchable = dataset.bookings.filter((booking) => booking.status === "confirmed");
  const readyToSend = dispatchable.filter((booking) => booking.receiverAcceptedAt && !booking.loadRef && !dataset.events.some((event) => event.kind === "load.dispatched" && event.subjectIds.includes(booking.id)));
  const onTheRoad = dispatchable.filter((booking) => {
    const dispatched = Boolean(booking.loadRef || dataset.events.some((event) => event.kind === "load.dispatched" && event.subjectIds.includes(booking.id)));
    return dispatched && !dataset.verifications.some((item) => item.bookingId === booking.id);
  });
  const delivered = dispatchable.filter((booking) => dataset.verifications.some((item) => item.bookingId === booking.id));

  return (
    <div className="mx-auto max-w-app pb-16">
      <PageMeta title="Deliveries | GreenLoop" description="Track material loads from project dispatch through receiver delivery and evidence." />

      <section className="relative mb-4 min-h-[205px] overflow-hidden border border-[#e5e1d8] bg-[#192c20] dark:border-steel-800 sm:min-h-[225px] rounded-surface">
        <img src={ambientMedia.authTruck.src} alt={ambientMedia.authTruck.alt} className="absolute inset-0 size-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#17291e]/95 via-[#17291e]/70 to-[#17291e]/15" />
        <div className="relative z-10 flex min-h-[205px] flex-col justify-center px-5 py-6 sm:min-h-[225px] sm:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#c7d5c8]">GreenLoop Operations</p>
          <h1 className="mt-1.5 font-archivo font-bold tracking-tight text-white gl-page-title">Where is my load?</h1>
          <p className="mt-3 w-fit border border-white/20 bg-[#102118]/45 px-3 py-1.5 text-xs font-medium text-white/90 backdrop-blur-sm rounded-surface">Status: {readyToSend.length} ready to send · {onTheRoad.length} on the road · {delivered.length} delivered</p>
        </div>
      </section>

      <div className="mb-section overflow-x-auto border border-[#263a2c] bg-[#17291e] px-4 py-3.5 text-white shadow-[0_2px_10px_rgba(26,42,31,0.06)] rounded-surface" aria-label="Delivery journey">
        <ol className="flex min-w-[560px] items-center justify-between gap-2 text-xs font-semibold uppercase tracking-[0.11em] sm:text-xs">
          {["Booked", "Dispatched", "In transit", "Received", "Verified"].map((stage, index) => (
            <li key={stage} className="flex items-center gap-2">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-white/25 bg-white/10 text-xs text-white/85">0{index + 1}</span>
              <span className="whitespace-nowrap">{stage}</span>
              {index < 4 && <span aria-hidden="true" className="mx-1 text-white/35 sm:mx-3">→</span>}
            </li>
          ))}
        </ol>
      </div>

      {dispatchable.length === 0 ? (
        <section className="flex flex-col items-center justify-center border border-dashed border-[#d8ddd5] bg-white/60 p-10 text-center dark:border-steel-800 dark:bg-white/[0.02] sm:p-14 rounded-surface">
          <span aria-hidden="true" className="flex size-12 items-center justify-center rounded-full bg-[#edf3ed] text-[#52785a] dark:bg-[#294334] dark:text-[#b6d1bd]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-6"><path d="M3 6h11v11H3zM14 10h4l3 3v4h-7z" /><circle cx="7.5" cy="18" r="1.5" /><circle cx="17.5" cy="18" r="1.5" /></svg>
          </span>
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.15em] text-[#7c857d]">No active shipments</p>
          <h2 className="mt-2 font-archivo text-xl font-bold text-[#26362c] dark:text-white sm:text-2xl">No confirmed bookings ready for delivery</h2>
          <p className="mt-2 max-w-md text-sm text-[#778078] dark:text-gray-400">A load enters the delivery record when receiver capacity has been confirmed.</p>
          <Link to="/app/bookings" className="mt-5 inline-flex min-h-10 items-center rounded-lg bg-[#315f3d] px-4 text-sm font-semibold text-white hover:bg-[#274d32]">Review bookings →</Link>
        </section>
      ) : (
        <section id="delivery-loads" aria-label="Delivery records" className="grid gap-5">
          {dispatchable.map((booking, index) => (
            <motion.div key={booking.id} initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ delay: Math.min(index * 0.04, 0.2), duration: 0.35 }}>
              <LoadCard booking={booking} />
            </motion.div>
          ))}
        </section>
      )}
    </div>
  );
}

function LoadCard({ booking }: { booking: Booking }) {
  const { dataset, dispatchAction } = useGreenLoopStore();
  const receiver = dataset.receivers.find((item) => item.id === booking.receiverId);
  const demand = booking.demandId ? dataset.demands.find((item) => item.id === booking.demandId) : undefined;
  const material = dataset.materials.find((item) => item.id === booking.materialId);
  const contact = dataset.transactionContacts?.find((item) => item.materialId === booking.materialId && item.receiverId === booking.receiverId);
  const offer = dataset.offers?.find((item) => item.demandId === booking.demandId && item.passportId === booking.materialId);
  const unitPrice = booking.agreedPricePerT ?? offer?.agreedPricePerT ?? offer?.pricePerT ?? material?.pricePerT;
  const slot = dataset.slots.find((item) => item.id === booking.slotId);
  const verification = dataset.verifications.find((item) => item.bookingId === booking.id);
  const project = material && dataset.projects.find((item) => item.id === material.projectId);
  const events = dataset.events
    .filter((event) => event.subjectIds.includes(booking.id) || event.subjectIds.includes(booking.allocationId) || event.subjectIds.includes(verification?.id ?? ""))
    .sort((a, b) => a.at.localeCompare(b.at));
  const dispatchEvent = events.find((event) => event.kind === "load.dispatched");
  const dispatched = Boolean(booking.loadRef || dispatchEvent);
  const loadRef = verification?.loadRef ?? booking.loadRef ?? "?";
  const currentStatus = verification?.status ?? (dispatched ? "dispatched" : "confirmed");
  const isEnRoute = dispatched && !verification;
  const isVerified = verification?.status === "verified";
  const isRejected = verification?.status === "rejected";
  const stageIndex = verification ? isVerified ? 4 : 3 : dispatched ? 2 : booking.receiverAcceptedAt ? 1 : 0;
  const stages = [
    { label: "Booking ready", detail: formatStamp(booking.createdAt), complete: true },
    { label: "Dispatched", detail: dispatchEvent ? formatStamp(dispatchEvent.at) : dispatched ? "Load dispatched" : "Awaiting dispatch", complete: dispatched },
    { label: "In transit", detail: isEnRoute ? "Load on the road" : dispatched ? "Journey recorded" : "Awaiting dispatch", complete: dispatched },
    { label: "Received", detail: verification ? formatStamp(verification.verifiedAt ?? "") : "Awaiting arrival", complete: Boolean(verification) },
    { label: "Verified", detail: verification ? isVerified ? `${verification.acceptedT.toFixed(1)} t accepted` : "Rejected on inspection" : "Awaiting verification", complete: isVerified },
  ];
  const materialImage = materialMediaFor(material?.type ?? "concrete");
  const currentLabel = verification ? isVerified ? "Delivered" : "Delivery exception" : dispatched ? "On the road" : booking.receiverAcceptedAt ? "Ready to send" : "Waiting for receiver";
  const shipmentRows = [
    { label: "Material passport", value: material ? `${material.id} · ${TYPE_LABEL[material.type] ?? material.type} (surveyed ${formatDate(material.surveyedAt)})` : booking.materialId, to: material ? `/app/materials/${material.id}` : undefined },
    { label: "Booking reference", value: `${booking.id} · ${booking.tonnesT.toFixed(1)} t · ${slot ? formatDate(slot.date) : "Date pending"}`, to: "/app/bookings" },
    { label: "Receiver site", value: receiver ? `${receiver.name} · ${receiver.location}` : booking.receiverId },
    { label: "Driver / transport", value: "No transport details recorded" },
    { label: "Final status", value: verification ? isVerified ? `Load verified · ${verification.acceptedT.toFixed(1)} t received and accepted` : `Load rejected · ${verification.acceptedT.toFixed(1)} t accepted` : dispatched ? "Load dispatched · awaiting receiver verification" : booking.receiverAcceptedAt ? "Booking confirmed · ready to dispatch" : "Waiting for receiver approval" },
  ];

  return (
    <article className="overflow-hidden border border-[#e5e2da] bg-white shadow-[0_2px_12px_rgba(26,42,31,0.04)] dark:border-steel-800 dark:bg-[#17251d] rounded-surface">
      <div className="grid sm:grid-cols-[112px_minmax(0,1fr)_132px]">
        <div className="relative min-h-[104px] overflow-hidden bg-[#ecebe5] dark:bg-[#24372b]">
          <img src={materialImage.src} alt={materialImage.alt} loading="lazy" className="absolute inset-0 size-full object-cover" />
        </div>
        <div className="min-w-0 p-3.5 sm:p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7c857d]">{currentLabel}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h2 className="font-archivo text-lg font-bold uppercase tracking-wide text-[#26362c] dark:text-white">{TYPE_LABEL[material?.type ?? ""] ?? material?.type ?? "Material"}</h2>
            <StatusBadge status={currentStatus} size="sm" />
          </div>
          <p className="mt-1 truncate text-xs text-[#778078] dark:text-gray-400"><span className="font-semibold text-[#405245] dark:text-gray-200">{receiver?.name ?? "Receiver"}</span> · Ref: {loadRef}</p>
          <p className="mt-1 text-xs font-semibold text-[#426b4c] dark:text-loop-300">{unitPrice !== undefined ? `${formatINRPerT(unitPrice)} · ${formatINR(unitPrice * booking.tonnesT)}` : "Price on request"}</p>
          <details className="mt-2 text-xs text-[#526b58] dark:text-[#b6cfbd]">
            <summary className="w-fit cursor-pointer font-semibold">View shipment details →</summary>
            <div className="mt-3 border-t border-[#eeeae2] pt-3 dark:border-steel-800">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#899189]">Project origin</p><p className="mt-1 truncate text-xs font-semibold text-[#334439] dark:text-white">{project?.name ?? "Origin unavailable"}</p><p className="mt-0.5 truncate text-xs text-[#778078] dark:text-gray-400">{project?.location ?? "—"}</p></div>
                <div className="flex min-w-24 flex-1 items-center gap-2 px-2 text-center text-xs font-semibold text-[#5f7e65] sm:flex-col"><span className="h-px flex-1 bg-[#d5dfd5] sm:h-5 sm:w-px sm:flex-none" /><span className="whitespace-nowrap rounded-full border border-[#d5dfd5] bg-[#f4f6f2] px-2 py-1 dark:border-steel-700 dark:bg-[#1c2b22] rounded-surface">{receiver?.distanceKm ?? "—"} km</span><span className="h-px flex-1 bg-[#d5dfd5] sm:h-5 sm:w-px sm:flex-none" /></div>
                <div className="min-w-0 sm:text-right"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#899189]">Receiver</p><p className="mt-1 truncate text-xs font-semibold text-[#334439] dark:text-white">{receiver?.name ?? "Destination unavailable"}</p><p className="mt-0.5 truncate text-xs text-[#778078] dark:text-gray-400">{receiver?.location ?? "—"}</p></div>
              </div>

              <div className="mt-4 rounded-lg bg-[#f8f7f2] px-3 py-3 dark:bg-[#1c2b22]">
                <ol className="grid grid-cols-1 gap-x-3 gap-y-3 sm:grid-cols-2 md:grid-cols-5" aria-label="Delivery timeline">
                  {stages.map((stage, index) => {
                    const active = index === stageIndex && !verification;
                    const exception = index === 4 && isRejected;
                    return (
                      <li key={stage.label} className="relative min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border text-[8px] font-bold", stage.complete ? "border-[#5b8965] bg-[#5b8965] text-white" : exception ? "border-signal-400 bg-signal-50 text-signal-700 dark:border-signal-500 dark:bg-signal-500/10 dark:text-signal-300" : active ? "border-[#5b8965] bg-white text-[#426b4c] dark:bg-[#17251d] dark:text-[#c6ddca]" : "border-[#d6dbd4] bg-white text-[#a0a79f] dark:border-steel-700 dark:bg-[#17251d] dark:text-gray-500")}>{stage.complete ? "✓" : exception ? "!" : `0${index + 1}`}</span>
                          {index < stages.length - 1 && <span aria-hidden="true" className="hidden h-px flex-1 bg-[#dfe4dd] md:block" />}
                        </div>
                        <p className={cn("mt-1.5 text-xs font-bold uppercase tracking-wide", stage.complete || active ? "text-[#405b46] dark:text-gray-200" : exception ? "text-signal-700 dark:text-signal-300" : "text-[#929990]")}>{stage.label}</p>
                        <p className="mt-0.5 truncate text-xs text-[#7c857d] dark:text-gray-400">{stage.detail}</p>
                      </li>
                    );
                  })}
                </ol>
              </div>

              {(demand?.geo ?? receiver?.geo) && <div className="mt-3"><LocationMap geo={demand?.geo ?? receiver?.geo} className="h-44" /></div>}
              {contact && <div className="mt-3 border border-[#e5e2da] p-3 text-xs dark:border-steel-800"><p className="font-semibold text-[#2c3e31] dark:text-white">Accepted receiver contact · {contact.name}</p><a className="mt-1 block underline" href={`mailto:${contact.email}`}>{contact.email}</a>{contact.phone && <a className="mt-1 block underline" href={`tel:${contact.phone}`}>{contact.phone}</a>}</div>}
              <div className="mt-3 grid gap-detail md:grid-cols-2">
                <section className="rounded-lg border border-[#e5e2da] p-3.5 dark:border-steel-800" aria-label="Delivery evidence">
                  <h3 className="text-xs font-bold text-[#2c3e31] dark:text-white">Delivery evidence</h3>
                  {verification?.evidence.length ? (
                    <ul className="mt-3 space-y-2.5">
                      {verification.evidence.map((evidence, index) => {
                        const isImage = evidence.kind === "site-photo" && evidence.ref?.startsWith("/");
                        return <li key={evidence.ref ?? `${evidence.label}-${index}`} className="flex min-w-0 items-center gap-2.5">
                          <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-[#edf3ed] text-[#52785a] dark:bg-[#294334] dark:text-[#b6d1bd]">
                            {isImage ? <img src={evidence.ref} alt={evidence.label} className="size-full object-cover" /> : <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-4"><path d="M6 3.75h8l4 4V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.75a1 1 0 0 1 1-1Z" /><path d="M14 4v4h4M8 13h8m-8 3.5h5" /></svg>}
                          </span>
                          <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-[#34483a] dark:text-gray-200">{evidence.label}</p><p className="mt-0.5 text-xs text-[#899189]">{formatStamp(evidence.recordedAt)} · {evidence.kind.replaceAll("-", " ")}</p></div>
                          {isImage ? <a href={evidence.ref} target="_blank" rel="noreferrer" className="shrink-0 text-xs font-semibold text-[#426b4c] underline underline-offset-2 dark:text-[#b8d0bd]">View</a> : <Link to="/app/verification" className="shrink-0 text-xs font-semibold text-[#426b4c] underline underline-offset-2 dark:text-[#b8d0bd]">View record</Link>}
                        </li>;
                      })}
                    </ul>
                  ) : <p className="mt-2 text-xs leading-4 text-[#778078] dark:text-gray-400">Weighbridge tickets and delivery evidence appear here after receiver verification.</p>}
                  {verification?.rejectReason && <div className="mt-3 border border-signal-200 bg-signal-50 px-3 py-2 text-xs text-signal-900 dark:border-signal-500/40 dark:bg-signal-500/10 dark:text-signal-100 rounded-surface"><span className="font-bold">Inspection note:</span> {verification.rejectReason}</div>}
                  {verification && (verification.rejectedT > 0 || verification.acceptedT !== verification.actualT) && <p className="mt-2 text-xs text-[#778078] dark:text-gray-400">{verification.acceptedT.toFixed(1)} t accepted · {verification.rejectedT.toFixed(1)} t rejected</p>}
                </section>

                <section className="rounded-lg border border-[#e5e2da] p-3.5 dark:border-steel-800" aria-label="Shipment details">
                  <div className="flex items-center justify-between gap-2"><h3 className="text-xs font-bold text-[#2c3e31] dark:text-white">Shipment details</h3><Link to="/app/verification" className="text-xs font-semibold text-[#426b4c] hover:underline dark:text-[#b8d0bd]">View record →</Link></div>
                  <dl className="mt-2 divide-y divide-[#efede7] dark:divide-white/[0.07]">
                    {shipmentRows.map((row, index) => (
                      <div key={row.label} className="flex items-start gap-2 py-2">
                        <span aria-hidden="true" className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded bg-[#f1f4ef] text-xs font-bold text-[#56775c] dark:bg-white/[0.06] dark:text-[#b8d0bd]">{["P", "B", "R", "T", "✓"][index]}</span>
                        <dt className="w-24 shrink-0 text-xs text-[#899189]">{row.label}</dt>
                        <dd className="min-w-0 flex-1 text-right text-xs font-medium leading-4 text-[#425446] dark:text-gray-200">{row.to ? <Link to={row.to} className="hover:text-[#315f3d] hover:underline dark:hover:text-loop-300">{row.value}</Link> : row.value}</dd>
                      </div>
                    ))}
                  </dl>
                  {events.length > 0 && <div className="mt-2 border-t border-[#efede7] pt-2 dark:border-white/[0.07]"><p className="text-xs font-semibold uppercase tracking-wide text-[#899189]">Recent shipment events</p><ul className="mt-1 space-y-1">{events.slice(-3).map((event) => <li key={event.id} className="text-xs leading-4 text-[#69766c] dark:text-gray-400"><span className="font-medium">{formatStamp(event.at)}</span> · {event.summary}{event.detail ? ` — ${event.detail}` : ""}</li>)}</ul></div>}
                </section>
              </div>
            </div>
          </details>
        </div>

        <div className="flex flex-row items-center justify-between gap-3 border-t border-[#eeeae2] bg-[#f8f7f2] p-3.5 sm:flex-col sm:items-end sm:justify-center sm:border-l sm:border-t-0 sm:p-4 dark:border-steel-800 dark:bg-[#1c2b22]">
          <div className="sm:text-right">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#929990] sm:hidden">Delivered quantity</p>
            <p className="font-archivo text-xl font-bold text-[#26362c] dark:text-white">{booking.tonnesT.toFixed(1)}<span className="ml-1 text-xs font-medium text-[#7d867e]">t</span></p>
            <p className="mt-0.5 text-xs text-[#7c857d] dark:text-gray-400">{slot ? formatDate(slot.date) : "Date pending"}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {!dispatched && !verification && !booking.receiverAcceptedAt ? (
              <span className="inline-flex min-h-9 items-center text-xs font-semibold text-[#8a754c]">Waiting for approval</span>
            ) : !dispatched && !verification ? (
              <Button size="md" className="min-h-9 rounded-lg bg-[#315f3d] px-3 text-xs font-semibold text-white hover:bg-[#274d32] dark:bg-[#315f3d] dark:text-white" onClick={() => dispatchAction({ bookingId: booking.id })}>Send load</Button>
            ) : (
              <Link to="/app/verification" className="inline-flex min-h-9 items-center justify-center rounded-lg bg-[#315f3d] px-3 text-xs font-semibold text-white hover:bg-[#274d32]">View record →</Link>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

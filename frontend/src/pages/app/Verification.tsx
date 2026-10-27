import PageMeta from "@/components/common/PageMeta";
import EventLog from "@/components/greenloop/EventLog";
import StatusBadge from "@/components/greenloop/StatusBadge";
import VerificationDetails from "@/components/greenloop/VerificationDetails";
import { ambientMedia, materialMediaFor } from "@/config/appMedia";
import { eventsForSubjects } from "@/domain/events";
import type { VerificationRecord } from "@shared/domain/types";
import { useGreenLoopStore } from "@/store/GreenLoopStore.helpers";
import { cn, formatINR, formatINRPerT, formatStamp } from "@/utils";
import { AnimatePresence, motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

const TYPE_LABEL: Record<string, string> = {
  concrete: "Concrete",
  brick: "Brick",
  steel: "Steel",
  timber: "Timber",
  plasterboard: "Plasterboard",
  glass: "Glass",
};

export default function Verification() {
  const { dataset } = useGreenLoopStore();
  const totalAccepted = dataset.verifications.reduce((total, record) => total + record.acceptedT, 0);
  const totalRejected = dataset.verifications.reduce((total, record) => total + record.rejectedT, 0);

  return (
    <div className="relative min-h-screen pb-16">
      <PageMeta
        title="Proof of Recovery | GreenLoop"
        description="Evidence-backed records of loads received and accepted by material receivers."
      />

      <header className="relative mb-6 min-h-48 overflow-hidden border border-ink-900 bg-ink-900 sm:min-h-52 rounded-surface">
        <img
          src={ambientMedia.sortingFacility.src}
          alt={ambientMedia.sortingFacility.alt}
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-ink-950/95 via-ink-950/75 to-ink-950/25" />
        <div className="relative flex min-h-48 flex-col justify-end p-5 text-white sm:min-h-52 sm:p-7">
          <p className="eyebrow-label text-loop-300">GreenLoop operations</p>
          <h1 className="mt-2 font-archivo font-bold tracking-tight gl-page-title">Proof of Recovery</h1>
          <p className="mt-3 text-xs font-medium text-white/90 sm:text-sm">
            Status: {dataset.verifications.length} {dataset.verifications.length === 1 ? "record" : "records"} · {totalAccepted.toFixed(1)} t accepted · {totalRejected.toFixed(1)} t rejected
          </p>
        </div>
      </header>

      <AnimatePresence>
        {totalRejected > 0 && (
          <motion.section
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-5 overflow-hidden border border-signal-200 bg-signal-50 px-4 py-3 dark:border-signal-500/40 dark:bg-signal-500/10 sm:px-5 rounded-surface"
            aria-label="Intake discrepancies"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-archivo text-base font-bold text-signal-900 dark:text-signal-100">Intake Discrepancies</p>
                <p className="mt-0.5 text-xs text-signal-800/80 dark:text-signal-200/80">Across all records, some material was rejected or differed from the dispatched plan.</p>
              </div>
              <div className="text-right">
                <span className="ledger-numeral text-2xl font-bold text-signal-700 dark:text-signal-400">{totalRejected.toFixed(1)} t</span>
                <span className="block text-xs font-semibold uppercase tracking-wider text-signal-700 dark:text-signal-300">Rejected total</span>
              </div>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      <div className="space-y-4">
        {dataset.verifications.map((verification, index) => (
          <motion.div
            key={verification.id}
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ delay: Math.min(index * 0.06, 0.24), duration: 0.35 }}
          >
            <VerificationRecordCard verification={verification} />
          </motion.div>
        ))}

        {dataset.verifications.length === 0 && (
          <section className="flex flex-col items-center justify-center border border-dashed border-steel-300 bg-white px-6 py-14 text-center dark:border-steel-700 dark:bg-white/[0.02] rounded-surface">
            <div className="mb-4 flex size-12 items-center justify-center border border-steel-200 bg-steel-50 text-steel-500 dark:border-steel-700 dark:bg-white/[0.04]" aria-hidden="true">
              <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M7 3.75h7l4 4v12.5H7a2 2 0 0 1-2-2v-12.5a2 2 0 0 1 2-2Z" />
                <path d="M14 3.75v4h4M8.5 13h7M8.5 16.5h7" />
              </svg>
            </div>
            <p className="eyebrow-label text-steel-500 dark:text-steel-400">No proof of recovery yet</p>
            <h2 className="mt-2 font-archivo text-xl font-bold text-ink-900 dark:text-white sm:text-2xl">A recovery record appears after the receiver checks a load</h2>
            <p className="mt-2 max-w-md text-sm text-steel-600 dark:text-gray-400">Send an approved load. The receiver records what arrived and accepted tonnes, with weighbridge ticket evidence.</p>
            <Link to="/app/deliveries" className="mt-5 inline-flex min-h-10 items-center bg-ink-900 px-4 text-sm font-semibold text-white transition-colors hover:bg-loop-700 dark:bg-white dark:text-ink-900">View deliveries</Link>
          </section>
        )}
      </div>
    </div>
  );
}

export function VerificationRecordCard({ verification }: { verification: VerificationRecord }) {
  const { t } = useTranslation();
  const { dataset } = useGreenLoopStore();
  const material = dataset.materials.find((item) => item.id === verification.materialId);
  const project = material && dataset.projects.find((item) => item.id === material.projectId);
  const receiver = dataset.receivers.find((item) => item.id === verification.receiverId);
  const booking = dataset.bookings.find((item) => item.id === verification.bookingId);
  const offer = booking?.demandId ? dataset.offers?.find((item) => item.demandId === booking.demandId && item.passportId === verification.materialId) : undefined;
  const unitPrice = booking?.agreedPricePerT ?? offer?.agreedPricePerT ?? offer?.pricePerT ?? material?.pricePerT;
  const events = eventsForSubjects(dataset, [verification.bookingId, verification.id]);
  const dispatchEvent = events.find((event) => event.kind === "load.dispatched");
  const variance = verification.actualT - verification.plannedT;
  const acceptedVsPlan = verification.plannedT > 0
    ? Math.min(100, Math.max(0, (verification.acceptedT / verification.plannedT) * 100))
    : 0;
  const media = materialMediaFor(material?.type ?? "concrete");

  const milestones = [
    { label: "Planned", value: `${verification.plannedT.toFixed(1)} t`, detail: booking ? formatStamp(booking.createdAt) : "Dispatch plan", complete: Boolean(booking) },
    { label: "Dispatched", value: `${verification.plannedT.toFixed(1)} t`, detail: dispatchEvent ? formatStamp(dispatchEvent.at) : "Not recorded", complete: Boolean(dispatchEvent) },
    { label: "Received", value: `${verification.actualT.toFixed(1)} t`, detail: verification.verifiedAt ? formatStamp(verification.verifiedAt) : "Weighbridge record", complete: verification.actualT > 0 },
    { label: "Accepted", value: `${verification.acceptedT.toFixed(1)} t`, detail: verification.status === "verified" ? "Confirmed" : verification.status === "rejected" ? "Rejected" : "Pending review", complete: verification.status === "verified", attention: verification.status === "rejected" },
  ];

  return (
    <article className="overflow-hidden border border-steel-200 bg-white shadow-sm shadow-ink-900/[0.03] dark:border-steel-800 dark:bg-white/[0.02] rounded-surface">
      <VerificationDetails
        image={media.src}
        name={TYPE_LABEL[material?.type ?? ""] ?? material?.type ?? ""}
        status={t(verification.status === "pending" ? "verificationCards.pending" : verification.status === "rejected" ? "verificationCards.rejected" : "verificationCards.complete", { quantity: verification.acceptedT.toFixed(1) })}
      >
      <div className="gl-card-pad">
        <div className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
            <div className="min-w-0">
              <p className="eyebrow-label text-steel-500 dark:text-steel-400">Proof of Recovery</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
                <h2 className="font-archivo text-xl font-bold uppercase tracking-tight text-ink-900 dark:text-white sm:text-2xl">
                  {TYPE_LABEL[material?.type ?? ""] ?? material?.type ?? "Material"}
                </h2>
                <StatusBadge status={verification.status} size="sm" />
              </div>
              <p className="mt-1.5 text-sm text-steel-600 dark:text-gray-400">
                {receiver?.name ?? verification.receiverId} <span className="px-1 text-steel-300">·</span>
                <span className="ledger-numeral">Ref: {verification.loadRef}</span>
              </p>
              <p className="mt-2 text-xs font-semibold text-loop-700 dark:text-loop-300">{unitPrice !== undefined ? `${formatINRPerT(unitPrice)} · ${formatINR(unitPrice * verification.acceptedT)} accepted value` : "Price on request"}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex shrink-0 items-center gap-1.5 border border-steel-200 px-2.5 py-1 text-xs font-medium text-steel-600 dark:border-steel-700 dark:text-steel-300">
                <span className="size-1.5 rounded-full bg-loop-600" aria-hidden="true" />
                {verification.evidence.length} evidence {verification.evidence.length === 1 ? "record" : "records"}
              </span>
              {verification.bookingId && (
                <Link
                  to={`/app/orders/${verification.bookingId}`}
                  className="rounded-lg bg-[#1a3827] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[#28573d] dark:bg-[#00e599] dark:text-[#0c1811]"
                >
                  Order Workspace →
                </Link>
              )}
              {material?.id && (
                <Link
                  to={`/app/materials/${material.id}`}
                  className="rounded-lg border border-steel-300 bg-white px-2.5 py-1 text-xs font-semibold text-steel-700 hover:bg-steel-50 dark:border-steel-700 dark:bg-steel-800 dark:text-gray-300"
                >
                  Passport →
                </Link>
              )}
            </div>
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
            <ReconciliationMetric label="Expected" value={`${verification.plannedT.toFixed(1)} t`} detail="Dispatch plan" />
            <ReconciliationMetric label="Received" value={`${verification.actualT.toFixed(1)} t`} detail="Weighbridge" />
            <ReconciliationMetric label="Accepted" value={`${verification.acceptedT.toFixed(1)} t`} detail={`${acceptedVsPlan.toFixed(1)}% of expected`} tone="accepted" />
            <ReconciliationMetric label="Variance" value={`${variance > 0 ? "+" : ""}${variance.toFixed(1)} t`} detail="Received vs expected" tone={variance !== 0 ? "alert" : "normal"} />
            <ReconciliationMetric label="Rejected" value={`${verification.rejectedT.toFixed(1)} t`} detail="Not accepted" tone={verification.rejectedT > 0 ? "alert" : "normal"} />
          </dl>
          <div className="mt-3">
            <div className="mb-1.5 flex items-center justify-between gap-3 text-xs text-steel-600 dark:text-gray-400">
              <span>Accepted against expected</span>
              <span className="ledger-numeral font-semibold text-loop-700 dark:text-loop-400">{acceptedVsPlan.toFixed(1)}%</span>
            </div>
            <div className="h-2 overflow-hidden bg-steel-100 dark:bg-steel-800" role="img" aria-label={`${acceptedVsPlan.toFixed(1)} percent of expected quantity accepted`}>
              <div className="h-full bg-loop-600 dark:bg-loop-500" style={{ width: `${acceptedVsPlan}%` }} />
            </div>
          </div>

          <div>
            <div className="mt-4 border-t border-steel-100 pt-4 dark:border-steel-800">
              <section aria-label="Material journey">
                <div className="grid gap-detail md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-center">
                  <div className="min-w-0 border border-steel-200 bg-steel-50/70 p-3 dark:border-steel-800 dark:bg-white/[0.02] rounded-surface">
                    <p className="eyebrow-label text-steel-500 dark:text-steel-400">Project origin</p>
                    <p className="mt-1 font-semibold text-ink-900 dark:text-white">{project?.name ?? "Unavailable"}</p>
                    <p className="mt-0.5 text-xs text-steel-600 dark:text-gray-400">{project?.location ?? "Location unavailable"}</p>
                  </div>
                  <div className="flex items-center justify-center gap-2 text-xs font-semibold text-steel-500 md:flex-col md:gap-1">
                    <span className="hidden h-px w-12 bg-steel-300 md:block dark:bg-steel-700" aria-hidden="true" />
                    <span className="ledger-numeral border border-steel-200 bg-white px-2.5 py-1.5 text-ink-800 dark:border-steel-700 dark:bg-ink-900 dark:text-white rounded-surface">
                      {receiver && receiver.distanceKnown !== false ? `${receiver.distanceKm} km` : "Distance unavailable"}
                    </span>
                    <span className="hidden h-px w-12 bg-steel-300 md:block dark:bg-steel-700" aria-hidden="true" />
                  </div>
                  <div className="min-w-0 border border-steel-200 bg-steel-50/70 p-3 dark:border-steel-800 dark:bg-white/[0.02] rounded-surface">
                    <p className="eyebrow-label text-steel-500 dark:text-steel-400">Receiver</p>
                    <p className="mt-1 font-semibold text-ink-900 dark:text-white">{receiver?.name ?? verification.receiverId}</p>
                    <p className="mt-0.5 text-xs text-steel-600 dark:text-gray-400">{receiver?.location ?? "Location unavailable"}</p>
                  </div>
                </div>
              </section>

              <ol className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4" aria-label="Recovery lifecycle">
                {milestones.map((milestone, index) => (
                  <li key={milestone.label} className="relative flex gap-2.5 border border-steel-200 p-3 dark:border-steel-800">
                    <span className={cn(
                      "mt-0.5 flex size-5 shrink-0 items-center justify-center border",
                      milestone.complete ? "border-loop-600 bg-loop-600 text-white" : milestone.attention ? "border-signal-500 bg-signal-50 text-signal-700 dark:bg-signal-500/10" : "border-steel-300 bg-white text-steel-400 dark:border-steel-700 dark:bg-transparent",
                    )} aria-hidden="true">
                      {milestone.complete ? <span className="text-xs">✓</span> : milestone.attention ? <span className="text-xs">!</span> : <span className="size-1.5 rounded-full bg-current" />}
                    </span>
                    <div className="min-w-0">
                      <p className="eyebrow-label text-steel-500 dark:text-steel-400">{index + 1}. {milestone.label}</p>
                      <p className={cn("ledger-numeral mt-1 text-lg font-bold", milestone.complete ? "text-loop-700 dark:text-loop-400" : milestone.attention ? "text-signal-700 dark:text-signal-400" : "text-ink-800 dark:text-white")}>{milestone.value}</p>
                      <p className="mt-0.5 text-xs text-steel-500 dark:text-steel-400">{milestone.detail}</p>
                    </div>
                  </li>
                ))}
              </ol>

              {(verification.rejectReason || variance !== 0 || verification.rejectedT > 0) && (
                <div className="mt-4 border-s-2 border-signal-500 bg-signal-50 px-4 py-3 dark:bg-signal-500/10">
                  <p className="text-sm font-bold text-signal-900 dark:text-signal-100">Reconciliation Note</p>
                  {verification.rejectReason && <p className="mt-1 text-sm leading-relaxed text-signal-800 dark:text-signal-200">{verification.rejectReason}</p>}
                  {variance !== 0 && (
                    <p className="mt-1 text-sm text-signal-800 dark:text-signal-200">Received quantity differs from plan by <span className="ledger-numeral font-bold">{variance > 0 ? "+" : ""}{variance.toFixed(1)} t</span>.</p>
                  )}
                </div>
              )}

              <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
                <section>
                  <div className="mb-2 flex items-baseline justify-between gap-3">
                    <h3 className="font-archivo text-base font-bold text-ink-900 dark:text-white">Attached Evidence</h3>
                    <span className="text-xs text-steel-500 dark:text-steel-400">{verification.evidence.length} records</span>
                  </div>
                  {verification.evidence.length > 0 ? (
                    <ul className="divide-y divide-steel-100 border border-steel-200 dark:divide-steel-800 dark:border-steel-800">
                      {verification.evidence.map((evidence) => (
                        <li key={evidence.ref ?? evidence.label} className="flex min-w-0 items-center gap-3 p-3">
                          <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden border border-steel-200 bg-steel-50 text-steel-600 dark:border-steel-700 dark:bg-white/[0.03] dark:text-steel-300">
                            {evidence.kind === "site-photo" && evidence.ref?.startsWith("/images/") ? (
                              <img src={evidence.ref} alt={evidence.label} className="size-full object-cover" />
                            ) : (
                              <EvidenceIcon kind={evidence.kind} />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-ink-900 dark:text-white">{evidence.label}</p>
                            <p className="mt-0.5 text-xs font-semibold uppercase tracking-wider text-steel-500 dark:text-steel-400">{evidence.kind.replaceAll("-", " ")}</p>
                            <time className="ledger-numeral mt-1 block text-xs text-steel-500 dark:text-steel-400" dateTime={evidence.recordedAt}>{formatStamp(evidence.recordedAt)}</time>
                            {evidence.ref?.startsWith("/api/uploads/") ? <a href={evidence.ref} target="_blank" rel="noreferrer" className="mt-1 block text-xs text-loop-700 underline dark:text-loop-300">{t("receiverDelivery.viewTicket")}</a> : evidence.ref && <span className="ledger-numeral mt-0.5 block truncate text-xs text-steel-500 dark:text-steel-400">Ref: {evidence.ref}</span>}
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="border border-steel-200 p-3 text-sm text-steel-500 dark:border-steel-800">No evidence attached to this verification record.</p>
                  )}
                </section>

                <section>
                  <h3 className="font-archivo text-base font-bold text-ink-900 dark:text-white">Load event trail</h3>
                  <div className="mt-2 border border-steel-200 bg-steel-50/50 p-3 dark:border-steel-800 dark:bg-white/[0.02] sm:p-4 rounded-surface">
                    <EventLog events={events} limit={6} />
                  </div>
                </section>
              </div>
            </div>
          </div>
        </div>
      </div>
      </VerificationDetails>
    </article>
  );
}

function EvidenceIcon({ kind }: { kind: string }) {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      {kind === "weighbridge-ticket" ? (
        <><path d="M6 3.75h8l4 4v12.5H6a2 2 0 0 1-2-2V5.75a2 2 0 0 1 2-2Z" /><path d="M14 3.75v4h4M8 13h8M8 16.5h5" /></>
      ) : (
        <><rect x="3.75" y="5.25" width="16.5" height="13.5" rx="1" /><circle cx="9" cy="10" r="1.5" /><path d="m5 17 5-4 3 2 3-3 4 4" /></>
      )}
    </svg>
  );
}

function ReconciliationMetric({
  label,
  value,
  detail,
  tone = "normal",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "normal" | "accepted" | "alert";
}) {
  const valueClass = tone === "accepted"
    ? "text-loop-700 dark:text-loop-400"
    : tone === "alert"
      ? "text-signal-700 dark:text-signal-400"
      : "text-ink-900 dark:text-white";

  return (
    <div className="min-w-0 border-s-2 border-steel-200 bg-steel-50 px-3 py-2.5 dark:border-steel-700 dark:bg-white/[0.03]">
      <dt className="eyebrow-label text-steel-600 dark:text-steel-400">{label}</dt>
      <dd className={cn("ledger-numeral mt-1 text-lg font-bold sm:text-xl", valueClass)}>{value}</dd>
      <p className="mt-0.5 text-xs text-steel-600 dark:text-gray-400">{detail}</p>
    </div>
  );
}

import PageMeta from "@/components/common/PageMeta";
import { LocationMap } from "@/components/greenloop/LocationMap";
import StatusBadge from "@/components/greenloop/StatusBadge";
import VerificationDetails from "@/components/greenloop/VerificationDetails";
import WorkflowPageHeader from "@/components/greenloop/WorkflowPageHeader";
import Button from "@/components/ui/button/Button";
import { ambientMedia, materialMediaFor } from "@/config/appMedia";
import { useAuth } from "@/context/AuthContext.helpers";
import type { Evidence } from "@shared/domain/types";
import { TruckDelivery } from "@/icons";
import { uploadFile } from "@/lib/api";
import { useGreenLoopStore } from "@/store/GreenLoopStore.helpers";
import { formatDate, formatINR, formatINRPerT } from "@/utils";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

export default function ReceiverDeliveries({ embedded = false, bookingId, onRecorded }: { embedded?: boolean; bookingId?: string; onRecorded?: () => void }) {
  const { t } = useTranslation();
  const { dataset, receiveLoadAction } = useGreenLoopStore();
  const { user } = useAuth();
  const receiverId = user?.receiverId ?? "";
  
  // Confirmed bookings that don't have a verification record yet
  const expectedDeliveries = dataset.bookings.filter((booking) =>
    booking.receiverId === receiverId && (!bookingId || booking.id === bookingId) && booking.status === "confirmed" && Boolean(booking.loadRef) &&
    !dataset.verifications.some((verification) => verification.bookingId === booking.id)
  );

  const [receivingId, setReceivingId] = useState<string | null>(bookingId ?? null);
  const [actualT, setActualT] = useState<string>(expectedDeliveries.find(booking => booking.id === bookingId)?.tonnesT.toString() ?? "");
  const [ticket, setTicket] = useState<Evidence | null>(null);
  const [uploadingTicket, setUploadingTicket] = useState(false);
  const [ticketError, setTicketError] = useState("");
  const [saving, setSaving] = useState(false);

  const handleTicketUpload = async (file?: File) => {
    if (!file) return;
    setUploadingTicket(true);
    setTicket(null);
    setTicketError("");
    try {
      const ref = await uploadFile(file);
      setTicket({ kind: "weighbridge-ticket", label: file.name, ref, recordedAt: new Date().toISOString() });
    } catch (cause) {
      setTicketError(cause instanceof Error ? cause.message : "Could not upload the weighbridge ticket.");
    } finally {
      setUploadingTicket(false);
    }
  };

  if (embedded && expectedDeliveries.length === 0) return null;

  return (
    <div className={embedded ? "mb-6" : "relative min-h-screen pb-24"}>
      {!embedded && <>
      <PageMeta title="Incoming Deliveries | GreenLoop" description="See expected loads and record their arrival." />
      <WorkflowPageHeader
        title="Incoming Deliveries"
        description="See what providers are sending to your facility. When a truck arrives, record the amount shown on the Weighbridge Ticket."
        status={`${expectedDeliveries.length} load${expectedDeliveries.length === 1 ? "" : "s"} expected`}
      />

      {/* Incoming deliveries — loads arriving at the intake gate */}
      <figure className="relative mb-section h-40 w-full overflow-hidden rounded-lg border border-steel-200 sm:h-52 lg:h-60 dark:border-steel-800">
        <img
          src={ambientMedia.authTruck.src}
          alt={ambientMedia.authTruck.alt}
          className="size-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950/75 via-ink-950/25 to-ink-950/10" aria-hidden="true" />
        <figcaption className="absolute inset-x-0 bottom-0 px-6 pb-5 sm:px-8 sm:pb-6">
          <p className="font-archivo text-lg font-bold uppercase tracking-wide text-white sm:text-xl">Incoming deliveries</p>
          <p className="mt-1 text-sm text-white/80">Track and record material deliveries to keep your facility operations accurate.</p>
        </figcaption>
      </figure>
      </>}

      {expectedDeliveries.length === 0 ? (
        <div className="flex min-h-[42vh] flex-col items-center justify-center border border-steel-200 bg-white/70 px-6 py-14 text-center dark:border-steel-800 dark:bg-white/[0.02] rounded-surface">
          <span className="flex size-16 items-center justify-center rounded-full bg-loop-50 dark:bg-loop-500/10">
            <TruckDelivery className="size-8 text-loop-600 dark:text-loop-400" />
          </span>
          <h2 className="mt-5 font-archivo text-2xl font-bold text-ink-900 dark:text-white">No upcoming deliveries</h2>
          <p className="mt-2 max-w-md text-steel-600 dark:text-gray-400">
            You have no confirmed incoming material deliveries at this time.
          </p>
        </div>
      ) : (
        <div className="grid gap-card">
          <AnimatePresence>
            {expectedDeliveries.map(booking => {
              const material = dataset.materials.find(m => m.id === booking.materialId);
              const project = dataset.projects.find(p => p.id === material?.projectId);
              const receiver = dataset.receivers.find(item => item.id === receiverId);
              const demand = booking.demandId ? dataset.demands.find(item => item.id === booking.demandId) : undefined;
              const contact = dataset.transactionContacts?.find(item => item.materialId === booking.materialId && item.receiverId === receiverId);
              const offer = dataset.offers?.find(item => item.demandId === booking.demandId && item.passportId === booking.materialId);
              const unitPrice = booking.agreedPricePerT ?? offer?.agreedPricePerT ?? offer?.pricePerT ?? material?.pricePerT;
              const isReceiving = receivingId === booking.id;

              return (
                <motion.article
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  key={booking.id}
                  className="overflow-hidden border border-steel-200 bg-white shadow-xs transition-colors hover:border-steel-400 dark:border-steel-800 dark:bg-white/[0.02] dark:hover:border-steel-600 rounded-surface"
                >
                  <VerificationDetails enabled={embedded} image={materialMediaFor(material?.type ?? "concrete").src} name={material?.type ?? ""} status={t("verificationCards.awaiting")}>
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
                          <StatusBadge status="confirmed" size="sm" />
                          <p className="font-semibold text-ink-900 dark:text-white">{booking.tonnesT.toFixed(1)} t {material?.type} from {project?.name ?? "provider"}</p>
                          <p className="text-xs font-semibold text-loop-700 dark:text-loop-300">{unitPrice !== undefined ? `${formatINRPerT(unitPrice)} · ${formatINR(unitPrice * booking.tonnesT)}` : "Price on request"}</p>
                        </div>

                        <div className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
                          <div>
                            <p className="eyebrow-label text-steel-500 dark:text-steel-400">Material</p>
                            <p className="mt-1.5 font-semibold text-ink-900 dark:text-white capitalize">{material?.type}</p>
                          </div>
                          <div>
                            <p className="eyebrow-label text-steel-500 dark:text-steel-400">Source project</p>
                            <p className="mt-1.5 font-semibold text-ink-900 dark:text-white">{project?.location ?? project?.name}</p>
                          </div>
                          <div>
                            <p className="eyebrow-label text-steel-500 dark:text-steel-400">Expected date</p>
                            <p className="mt-1.5 font-semibold text-ink-900 dark:text-white">{formatDate(dataset.slots.find(s => s.id === booking.slotId)?.date ?? "")}</p>
                          </div>
                          <div>
                            <p className="eyebrow-label text-steel-500 dark:text-steel-400">Expected amount</p>
                            <p className="ledger-numeral mt-1.5 text-2xl font-bold tracking-tight text-ink-900 dark:text-white">
                              {booking.tonnesT.toFixed(1)} <span className="text-sm font-bold text-steel-400">t</span>
                            </p>
                          </div>
                        </div>
                        {(demand?.geo ?? receiver?.geo) && <LocationMap geo={demand?.geo ?? receiver?.geo} className="mt-4 h-44" />}
                        {contact && <div className="mt-4 border border-steel-200 p-3 text-xs dark:border-steel-800"><p className="font-semibold text-ink-900 dark:text-white">Provider contact · {contact.name}</p><a className="mt-1 block underline" href={`mailto:${contact.email}`}>{contact.email}</a>{contact.phone && <a className="mt-1 block underline" href={`tel:${contact.phone}`}>{contact.phone}</a>}</div>}
                        <div className="mt-4 text-xs text-steel-500"><span className="mt-2 block">Booking ID: {booking.id} · Load reference: {booking.loadRef}</span></div>
                      </div>
                    </div>

                    <div className="mt-6 md:mt-0">
                      {isReceiving ? (
                        <div className="mt-6 flex flex-col gap-3 border-t border-steel-100 pt-5 sm:flex-row sm:items-end sm:justify-end dark:border-steel-800/60">
                          <div>
                            <label className="eyebrow-label text-steel-500 dark:text-steel-400">Amount received (t)</label>
                            <input
                              type="number"
                              className="mt-1.5 block w-full rounded-sm border-steel-300 text-sm shadow-sm focus:border-loop-500 focus:ring-loop-500 sm:w-40 dark:border-steel-700 dark:bg-black dark:text-white"
                              value={actualT}
                              onChange={e => setActualT(e.target.value)}
                              placeholder={booking.tonnesT.toFixed(1)}
                              min="0"
                              step="0.1"
                            />
                          </div>
                          <label className="text-xs font-medium text-steel-600 dark:text-gray-300">Weighbridge ticket
                            <input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" disabled={uploadingTicket} onChange={(event) => handleTicketUpload(event.target.files?.[0])} className="mt-1 block max-w-full text-xs file:me-3 file:border file:border-steel-300 file:bg-white file:px-2 file:py-1 file:text-xs dark:file:border-steel-700 dark:file:bg-black" />
                            {uploadingTicket && <span role="status" className="mt-1 block">Uploading ticket…</span>}
                            {ticket && <span className="mt-1 block text-loop-700 dark:text-loop-300">Attached: {ticket.label}</span>}
                            {ticketError && <span role="alert" className="mt-1 block text-error-500">{ticketError}</span>}
                          </label>
                          <div className="flex gap-3">
                            <Button
                              size="sm"
                              disabled={saving || !actualT || !Number.isFinite(Number(actualT)) || Number(actualT) < 0 || !ticket || uploadingTicket}
                              onClick={async () => {
                                if (!ticket || saving) return;
                                setSaving(true);
                                try {
                                  if (!await receiveLoadAction(booking.id, Number(actualT), [ticket])) return;
                                  setReceivingId(null);
                                  setTicket(null);
                                  setTicketError("");
                                  onRecorded?.();
                                } finally { setSaving(false); }
                              }}
                            >
                              Record arrival
                            </Button>
                            <Button size="sm" variant="outline" disabled={saving || uploadingTicket} onClick={() => { setReceivingId(null); setTicket(null); setTicketError(""); }}>
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-6 border-t border-steel-100 pt-5 dark:border-steel-800/60">
                          <Button size="md" className="min-h-11 w-full sm:w-auto" onClick={() => {
                            setReceivingId(booking.id);
                            setActualT(booking.tonnesT.toString());
                          }}>
                            Receive load
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                  </VerificationDetails>
                </motion.article>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

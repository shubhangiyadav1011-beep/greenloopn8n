import Button from "@/components/ui/button/Button";
import { Modal } from "@/components/ui/modal";
import { useAuth } from "@/context/AuthContext.helpers";
import type { ProviderMaterialListing } from "@shared/domain/types";
import { useModal } from "@/hooks/useModal";
import { useGreenLoopStore } from "@/store/GreenLoopStore.helpers";
import { materialTypeLabel } from "@/utils";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

interface DirectMaterialRequestProps {
  listing: ProviderMaterialListing;
  initialQuantity?: number | string;
  initialDate?: string;
  initialNotes?: string;
  buttonLabel?: string;
  buttonClassName?: string;
}

export default function DirectMaterialRequest({
  listing,
  initialQuantity,
  initialDate,
  initialNotes,
  buttonLabel,
  buttonClassName,
}: DirectMaterialRequestProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { addDemandAction } = useGreenLoopStore();
  const { isOpen, openModal, closeModal } = useModal();
  const navigate = useNavigate();
  const defaultQty = initialQuantity !== undefined
    ? String(Math.min(listing.availableT, Number(initialQuantity) || listing.availableT))
    : String(listing.availableT);
  const today = new Date().toISOString().slice(0, 10);
  const minDate = listing.availableFrom && listing.availableFrom > today ? listing.availableFrom : today;
  const recommendedDate = initialDate || (listing.availableFrom && listing.availableFrom > today ? listing.availableFrom : (() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 10);
  })());

  const [quantity, setQuantity] = useState(defaultQty);
  const [date, setDate] = useState(recommendedDate);
  const [location, setLocation] = useState(user?.location ?? user?.organization ?? "Main Receiving Yard");
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [submittedDemand, setSubmittedDemand] = useState<{ id: string } | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    if (!Number.isFinite(Number(quantity)) || Number(quantity) <= 0 || Number(quantity) > listing.availableT || !date || date < minDate || !location.trim()) {
      setError(t("directRequest.invalid"));
      return;
    }
    setSaving(true);
    setError("");
    try {
      const request = await addDemandAction({ receiverId: user?.receiverId, materialType: listing.materialType, requiredT: Number(quantity), period: date, location: location.trim(), notes: notes.trim(), targetMaterialId: listing.materialId });
      if (!request) { setError(t("directRequest.failed")); return; }
      setSubmittedDemand({ id: request.id });
    } finally { setSaving(false); }
  };
  const field = "mt-1 min-h-11 w-full rounded-control border border-steel-300 bg-white px-3 text-sm text-ink-900 dark:border-steel-700 dark:bg-ink-900 dark:text-white";
  return (
    <>
      <button
      type="button"
      className={buttonClassName || "mt-6 inline-flex min-h-11 items-center justify-center rounded-control bg-loop-700 px-5 text-sm font-semibold text-white hover:bg-loop-800 disabled:opacity-50"}
      disabled={listing.availableT <= 0}
      onClick={() => {
        setQuantity(defaultQty);
        setDate(recommendedDate);
        if (initialNotes) setNotes(initialNotes);
        setError("");
        setSubmittedDemand(null);
        openModal();
      }}
    >
      {buttonLabel || t("directRequest.open")}
    </button>
    <Modal isOpen={isOpen} onClose={() => { if (!saving) closeModal(); }} className="mx-4 max-w-lg gl-card-pad" showCloseButton={false}>
      {submittedDemand ? (
        <div className="py-2 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
            <svg className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6 9 17l-5-5" /></svg>
          </div>
          <h2 className="mt-3 font-archivo text-xl font-bold text-ink-900 dark:text-white">
            Material Request Published!
          </h2>
          <p className="mt-1 text-sm text-steel-600 dark:text-steel-300">
            Your request for <strong>{quantity} t</strong> of {materialTypeLabel(listing.materialType)} has been submitted directly to {listing.organization}.
          </p>
          <div className="mt-6 flex justify-center">
            <button
              type="button"
              onClick={() => {
                closeModal();
                navigate(`/app/receiver/demand?demand=${encodeURIComponent(submittedDemand.id)}`);
              }}
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#164b2d] px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#22633e] dark:bg-[#1e5836] dark:hover:bg-[#2a7347]"
            >
              View Request
            </button>
          </div>
        </div>
      ) : (
        <>
          <h2 className="font-archivo text-xl font-bold text-ink-900 dark:text-white">{t("directRequest.title", { provider: listing.organization })}</h2>
          <p className="mt-2 text-sm text-steel-600 dark:text-steel-300">{t("directRequest.linked", { material: materialTypeLabel(listing.materialType), reference: listing.materialId, quantity: listing.availableT })}</p>
          <form onSubmit={submit} className="mt-card space-y-detail">
            <div className="grid gap-detail sm:grid-cols-2">
              <div>
                <label className="text-sm font-medium text-steel-700 dark:text-steel-300">
                  {t("directRequest.quantity")}
                  <input type="number" min="0.1" step="0.1" max={listing.availableT} required value={quantity} onChange={event => setQuantity(event.target.value)} className={field} />
                </label>
                <div className="mt-1.5 flex gap-1.5">
                  {[0.25, 0.5, 1].map((pct) => {
                    const val = (Math.round((listing.availableT * pct) * 10) / 10).toFixed(1);
                    return (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => setQuantity(String(val))}
                        className="rounded-md border border-steel-200 bg-steel-50 px-2 py-0.5 text-[11px] font-semibold text-steel-700 hover:bg-steel-100 dark:border-steel-700 dark:bg-steel-800 dark:text-steel-200"
                      >
                        {pct === 1 ? "100% (All)" : `${pct * 100}%`}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-steel-700 dark:text-steel-300">
                  {t("directRequest.date")}
                  <input type="date" min={minDate} required value={date} onChange={event => setDate(event.target.value)} className={field} />
                </label>
                <p className="mt-1.5 text-[11px] text-steel-500 dark:text-steel-400">Default: 14 days lead time</p>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-steel-700 dark:text-steel-300">
                {t("directRequest.location")}
                <input required value={location} maxLength={250} onChange={event => setLocation(event.target.value)} className={field} />
              </label>
              {(user?.location || user?.organization) && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {user?.location && (
                    <button
                      type="button"
                      onClick={() => setLocation(user.location!)}
                      className="rounded-md border border-steel-200 bg-steel-50 px-2 py-0.5 text-[11px] font-medium text-steel-600 hover:bg-steel-100 dark:border-steel-700 dark:bg-steel-800 dark:text-steel-300"
                    >
                      🏢 {user.location}
                    </button>
                  )}
                  {user?.organization && (
                    <button
                      type="button"
                      onClick={() => setLocation(user.organization!)}
                      className="rounded-md border border-steel-200 bg-steel-50 px-2 py-0.5 text-[11px] font-medium text-steel-600 hover:bg-steel-100 dark:border-steel-700 dark:bg-steel-800 dark:text-steel-300"
                    >
                      📍 {user.organization}
                    </button>
                  )}
                </div>
              )}
            </div>
            <label className="block text-sm font-medium text-steel-700 dark:text-steel-300">{t("directRequest.notes")}<textarea value={notes} maxLength={5000} placeholder="Intake site constraints, gate access hours, or spec notes..." onChange={event => setNotes(event.target.value)} className={`${field} min-h-20 py-2.5`} /></label>
            <p className="text-xs text-steel-600 dark:text-steel-300">{t("directRequest.flow")}</p>
            {error && <p role="alert" className="text-sm text-error-600 dark:text-error-300">{error}</p>}
            <div className="flex justify-end gap-detail pt-detail"><Button variant="outline" disabled={saving} onClick={closeModal}>{t("directRequest.cancel")}</Button><Button type="submit" disabled={saving}>{t(saving ? "directRequest.sending" : "directRequest.send")}</Button></div>
          </form>
        </>
      )}
    </Modal>
    </>
  );
}

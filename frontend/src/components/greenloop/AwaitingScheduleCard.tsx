import Button from "@/components/ui/button/Button";
import StatusBadge from "@/components/greenloop/StatusBadge";
import { materialMediaFor } from "@/config/appMedia";
import { useGreenLoopStore } from "@/store/GreenLoopStore.helpers";
import { formatDate, formatINRPerT, materialTypeLabel } from "@/utils";
import { availableT, slotMatchesDemandPeriod } from "@shared/domain/capacity";
import type { MaterialOffer } from "@shared/domain/types";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

export default function AwaitingScheduleCard({ offer, receiverWorkspace }: { offer: MaterialOffer; receiverWorkspace: boolean }) {
  const { t } = useTranslation();
  const { dataset, scheduleAcceptedOfferAction } = useGreenLoopStore();
  const [slotId, setSlotId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const demand = dataset.demands.find(item => item.id === offer.demandId);
  const material = dataset.materials.find(item => item.id === offer.passportId);
  const type = material?.type ?? demand?.materialType ?? "unknown";
  const media = materialMediaFor(type);
  const price = offer.agreedPricePerT ?? offer.counters?.at(-1)?.pricePerT ?? offer.pricePerT;
  const slots = dataset.slots.filter(slot => demand && slot.receiverId === demand.receiverId && slot.materialType === type &&
    slot.date >= new Date().toISOString().slice(0, 10) && slotMatchesDemandPeriod(slot, demand.period) &&
    (!material?.availableFrom || slot.date >= material.availableFrom) && availableT(slot, dataset.bookings) >= offer.offeredQuantityT)
    .sort((a, b) => a.date.localeCompare(b.date));
  const schedule = async () => {
    if (!slotId || saving) return;
    setSaving(true); setError(false);
    try { setError(!await scheduleAcceptedOfferAction(offer.id, slotId)); }
    finally { setSaving(false); }
  };
  return (
    <article className="flex flex-col gap-4 rounded-2xl border border-steel-200 bg-white p-4 shadow-sm sm:flex-row dark:border-steel-800 dark:bg-ink-900">
      <img src={media.src} alt={media.alt} loading="lazy" className="h-24 w-full shrink-0 rounded-xl object-cover sm:w-32" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-archivo text-base font-bold text-ink-900 dark:text-white">{materialTypeLabel(type)} · {offer.offeredQuantityT} t</h3>
          <StatusBadge status="accepted" />
        </div>
        <p className="mt-1 text-sm font-semibold text-loop-700 dark:text-loop-300">{t("acceptedOrders.awaitingSchedule")}</p>
        <p className="mt-1 text-sm text-steel-600 dark:text-steel-400">{t(receiverWorkspace ? "acceptedOrders.receiverHint" : "acceptedOrders.providerHint")}</p>
        <p className="mt-2 text-xs text-steel-500 dark:text-steel-400">{offer.id} · {offer.passportId}{price !== undefined ? ` · ${formatINRPerT(price)}` : ""}</p>
        {receiverWorkspace ? (
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="min-w-0 flex-1 text-xs font-medium text-steel-700 dark:text-steel-300" htmlFor={`date-input-${offer.id}`}>
              Proposed Delivery Date
              <input
                id={`date-input-${offer.id}`}
                type="date"
                min={new Date().toISOString().slice(0, 10)}
                value={slotId}
                disabled={saving}
                onChange={event => setSlotId(event.target.value)}
                className="mt-1 block h-10 w-full rounded-lg border border-steel-200 bg-white px-3 text-sm text-ink-900 shadow-2xs focus:border-loop-500 focus:ring-loop-500 dark:border-steel-700 dark:bg-ink-900 dark:text-white"
              />
            </label>

            {slots.length > 0 && (
              <label className="min-w-0 flex-1 text-xs font-medium text-steel-700 dark:text-steel-300" htmlFor={`slot-select-${offer.id}`}>
                Or existing slot:
                <select
                  id={`slot-select-${offer.id}`}
                  value={slotId}
                  disabled={saving}
                  onChange={event => setSlotId(event.target.value)}
                  className="mt-1 block h-10 w-full rounded-lg border border-steel-200 bg-white px-3 text-sm text-ink-900 dark:border-steel-700 dark:bg-ink-900 dark:text-white"
                >
                  <option value="">Choose slot</option>
                  {slots.map(slot => (
                    <option key={slot.id} value={slot.date}>
                      {formatDate(slot.date)} · {availableT(slot, dataset.bookings)} t
                    </option>
                  ))}
                </select>
              </label>
            )}

            <Button size="sm" disabled={!slotId || saving} onClick={() => void schedule()}>
              {t(saving ? "recordCrud.saving" : "Confirm Delivery Date")}
            </Button>
            <Link
              to={`/app/negotiations/${encodeURIComponent(offer.id)}`}
              className="inline-flex min-h-10 items-center rounded-lg border border-steel-200 bg-white px-3 text-sm font-semibold text-steel-700 hover:bg-steel-50 dark:border-steel-700 dark:bg-ink-900 dark:text-steel-200 dark:hover:bg-steel-800"
            >
              Discuss Delivery
            </Link>
          </div>
        ) : (
          <div className="mt-3 flex items-center gap-3">
            <Link
              to={`/app/negotiations/${encodeURIComponent(offer.id)}`}
              className="inline-flex min-h-9 items-center rounded-lg border border-steel-200 bg-white px-3.5 text-sm font-semibold text-steel-700 hover:bg-steel-50 dark:border-steel-700 dark:bg-ink-900 dark:text-steel-200 dark:hover:bg-steel-800"
            >
              Discuss Delivery
            </Link>
          </div>
        )}
        {error && <p role="alert" className="mt-2 text-sm text-error-600 dark:text-error-400">{t("acceptedOrders.failed")}</p>}
      </div>
    </article>
  );
}

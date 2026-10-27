import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import Button from "@/components/ui/button/Button";
import { slotLedger, slotMatchesDemandPeriod } from "@shared/domain/capacity";
import type { DemandRecord, GreenLoopDataset } from "@shared/domain/types";
import type { GreenLoopStoreValue } from "@/store/contracts";
import { formatDate, materialTypeLabel } from "@/utils";

interface DemandCapacityProps {
  demand: DemandRecord;
  dataset: GreenLoopDataset;
  receiverId: string;
  addCapacityAction: GreenLoopStoreValue["addCapacityAction"];
  updateCapacityAction: GreenLoopStoreValue["updateCapacityAction"];
}

export default function DemandCapacity({ demand, dataset, receiverId, addCapacityAction, updateCapacityAction }: DemandCapacityProps) {
  const { t } = useTranslation();
  const today = new Date().toISOString().slice(0, 10);
  const deadline = /^\d{4}-\d{2}-\d{2}$/.test(demand.period) ? demand.period : undefined;
  const slots = dataset.slots.filter(slot => slot.receiverId === receiverId && slot.materialType === demand.materialType).sort((a, b) => a.date.localeCompare(b.date));
  const usable = slots.filter(slot => slot.date >= today && slotMatchesDemandPeriod(slot, demand.period));
  const other = slots.filter(slot => !usable.includes(slot));
  const pendingOffers = dataset.offers?.filter(offer => offer.demandId === demand.id && offer.status === "pending") ?? [];
  const bookedT = dataset.bookings.filter(booking => booking.demandId === demand.id && booking.status !== "cancelled").reduce((sum, booking) => sum + booking.tonnesT, 0);
  const remainingT = Math.max(0, demand.requiredT - bookedT);
  const suggestedT = pendingOffers.length ? Math.min(remainingT, Math.max(...pendingOffers.map(offer => offer.offeredQuantityT))) : remainingT;
  const initialDate = usable[0]?.date ?? (deadline && deadline >= today ? deadline : today);
  const [date, setDate] = useState(initialDate);
  const [tonnes, setTonnes] = useState(() => usable[0] ? (slotLedger(dataset, usable[0].id)?.available ?? 0).toString() : suggestedT > 0 ? suggestedT.toString() : "");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const dateFits = slotMatchesDemandPeriod({ date }, demand.period);
  const expired = !slotMatchesDemandPeriod({ date: today }, demand.period);
  const savedPlan = usable[0];
  const chooseDate = (value: string) => {
    setDate(value);
    const existing = slots.find(slot => slot.date === value);
    setTonnes(existing ? (slotLedger(dataset, existing.id)?.available ?? 0).toString() : suggestedT > 0 ? suggestedT.toString() : "");
    setSaved(false);
    setError("");
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    const quantity = Number(tonnes);
    if (!date || date < today || !dateFits || !Number.isFinite(quantity) || quantity <= 0) { setError(t("receivingPlan.invalid")); return; }
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      const existing = slots.find(slot => slot.date === date);
      // Set free space while preserving space reserved for accepted deliveries.
      const result = existing
        ? await updateCapacityAction(existing.id, Math.round(((slotLedger(dataset, existing.id)?.reserved ?? 0) + quantity) * 10) / 10)
        : await addCapacityAction({ receiverId, date, materialType: demand.materialType, capacityT: quantity });
      if (!result) { setError(t("receivingPlan.failed")); return; }
      setSaved(true);
    } finally { setSaving(false); }
  };

  return <section className="mt-4 rounded-xl border border-steel-200 bg-steel-50/50 p-3 dark:border-steel-700 dark:bg-white/[0.02]" aria-label={t("receivingPlan.title")}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <h4 className="text-sm font-semibold text-ink-900 dark:text-white">{t("receivingPlan.title")}</h4>
        {savedPlan ? (
          <p className="mt-1 text-xs text-steel-600 dark:text-steel-400">
            {formatDate(savedPlan.date)} <span aria-hidden="true">·</span> Receiving capacity {savedPlan.capacityT.toFixed(1)} t
          </p>
        ) : (
          <p className="mt-1 text-xs text-steel-600 dark:text-steel-400">Receiving plan not set</p>
        )}
      </div>
      <button
        type="button"
        onClick={() => setIsEditing(value => !value)}
        aria-expanded={isEditing}
        className="shrink-0 text-xs font-semibold text-loop-700 transition hover:text-loop-900 dark:text-loop-300 dark:hover:text-loop-200"
      >
        {isEditing ? "Close" : savedPlan ? "Change →" : "Set receiving plan →"}
      </button>
    </div>
    {isEditing && <>
    <p className="mt-3 text-sm text-steel-600 dark:text-steel-400">{t("receivingPlan.intro", { material: materialTypeLabel(demand.materialType), deadline: deadline ? formatDate(deadline) : demand.period })}</p>
    <p className="mt-2 text-xs text-steel-500 dark:text-steel-400">{t("offerChecks.automaticDate")}</p>
    {expired ? <p role="alert" className="mt-3 text-sm text-warning-700 dark:text-warning-400">{t("receivingPlan.expired")}</p> : <form onSubmit={save} className="mt-3 grid items-end gap-detail sm:grid-cols-3">
      <label className="text-sm font-medium text-steel-700 dark:text-steel-300">{t("receivingPlan.date")}
        <input type="date" required min={today} max={deadline} value={date} disabled={saving} onChange={event => chooseDate(event.target.value)} className="mt-1 block min-h-11 w-full border border-steel-300 bg-white px-3 text-sm dark:border-steel-700 dark:bg-ink-900 dark:text-white rounded-surface" />
      </label>
      <label className="text-sm font-medium text-steel-700 dark:text-steel-300">{t("receivingPlan.tonnes")}
        <input type="number" required min="0.1" step="0.1" value={tonnes} disabled={saving} onChange={event => { setTonnes(event.target.value); setSaved(false); }} className="mt-1 block min-h-11 w-full border border-steel-300 bg-white px-3 text-sm dark:border-steel-700 dark:bg-ink-900 dark:text-white rounded-surface" />
      </label>
      <Button type="submit" size="sm" className="min-h-11" disabled={saving || !dateFits}>{t(saving ? "receivingPlan.saving" : "receivingPlan.save")}</Button>
      {suggestedT > 0 && <p className="text-xs text-steel-600 dark:text-steel-400 sm:col-span-3">{t("receivingPlan.hint", { quantity: suggestedT.toFixed(1) })}</p>}
    </form>}
    {error && <p role="alert" className="mt-3 text-sm text-error-600 dark:text-error-400">{error}</p>}
    {saved && <p role="status" className="mt-3 text-sm font-medium text-loop-700 dark:text-loop-300">{t("receivingPlan.saved")}</p>}
    <div className="mt-4 border-t border-steel-200 pt-3 dark:border-steel-700">
      {usable.length ? <ul className="space-y-2">{usable.map(slot => {
        const ledger = slotLedger(dataset, slot.id);
        return <li key={slot.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 dark:bg-ink-900">
          <div><p className="text-sm font-medium text-ink-900 dark:text-white">{formatDate(slot.date)} · {t("receivingPlan.available", { quantity: (ledger?.available ?? 0).toFixed(1) })}</p>
            {(ledger?.reserved ?? 0) > 0 && <p className="text-xs text-steel-500 dark:text-steel-400">{t("receivingPlan.reserved", { quantity: ledger!.reserved.toFixed(1) })}</p>}
          </div>
          <button type="button" disabled={saving} onClick={() => chooseDate(slot.date)} className="min-h-10 text-sm font-semibold text-loop-700 underline dark:text-loop-300">{t("receivingPlan.edit")}</button>
        </li>;
      })}</ul> : <p className="text-sm text-steel-500 dark:text-steel-400">{t("receivingPlan.empty")}</p>}
      {other.length > 0 && <details className="mt-3 text-xs text-steel-500 dark:text-steel-400">
        <summary className="cursor-pointer">{t("receivingPlan.otherDates")}</summary>
        <ul className="mt-2 space-y-1">{other.map(slot => <li key={slot.id}>{formatDate(slot.date)} · {t(slot.date < today ? "receivingPlan.past" : "receivingPlan.tooLate")}</li>)}</ul>
      </details>}
    </div>
    </>}
  </section>;
}

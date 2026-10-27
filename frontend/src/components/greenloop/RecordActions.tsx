import Button from "@/components/ui/button/Button";
import { Modal } from "@/components/ui/modal";
import { useModal } from "@/hooks/useModal";
import { useGreenLoopStore } from "@/store/GreenLoopStore.helpers";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

type Fields = { material: string; quantity: string; date: string; price: string; location: string; notes: string; condition: string; grade: string };

export default function RecordActions({ kind, id, redirectAfterDelete, compact = false }: { kind: "passport" | "request"; id: string; redirectAfterDelete?: string; compact?: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { dataset, updateMaterialAction, deleteMaterialAction, updateDemandAction, deleteDemandAction } = useGreenLoopStore();
  const { isOpen, openModal, closeModal } = useModal();
  const [mode, setMode] = useState<"edit" | "delete">("edit");
  const [fields, setFields] = useState<Fields>({ material: "", quantity: "", date: "", price: "", location: "", notes: "", condition: "good", grade: "A" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const material = dataset.materials.find(record => record.id === id);
  const request = dataset.demands.find(record => record.id === id);
  const isPassport = kind === "passport";
  const orders = dataset.bookings.filter(booking => isPassport ? booking.materialId === id : booking.demandId === id);
  const hasOrders = orders.length > 0;
  const activeOffers = dataset.offers?.some(offer => (isPassport ? offer.passportId === id : offer.demandId === id) && ["pending", "accepted"].includes(offer.status));
  const typeLocked = hasOrders || Boolean(activeOffers);
  const editBlocked = isPassport ? hasOrders : request?.status === "CANCELLED";
  const committedT = orders.filter(order => order.status !== "cancelled").reduce((sum, order) => sum + order.tonnesT, 0);
  if ((isPassport && !material) || (!isPassport && !request)) return null;
  const open = (action: "edit" | "delete") => {
    setFields({ material: (isPassport ? material?.type : request?.materialType) ?? "", quantity: String(isPassport ? material?.quantityT : request?.requiredT), date: (isPassport ? material?.availableFrom : request?.period) ?? "", price: (isPassport ? material?.pricePerT : request?.budgetPerT)?.toString() ?? "", location: request?.location ?? "", notes: (isPassport ? material?.surveyNotes : request?.notes) ?? "", condition: material?.condition ?? "good", grade: material?.grade ?? "A" });
    setMode(action); setError(""); setSuccess(false); openModal();
  };
  const change = (field: keyof Fields, value: string) => setFields(previous => ({ ...previous, [field]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setError("");
    try {
      const result = mode === "delete"
        ? await (isPassport ? deleteMaterialAction(id) : deleteDemandAction(id))
        : isPassport
          ? await updateMaterialAction(id, { type: fields.material, quantityT: Number(fields.quantity), condition: fields.condition as "good" | "fair" | "poor", grade: fields.grade as "A" | "B" | "C", pricePerT: fields.price === "" ? null : Number(fields.price), availableFrom: fields.date || null, surveyNotes: fields.notes })
          : await updateDemandAction(id, { materialType: fields.material, requiredT: Number(fields.quantity), period: fields.date, location: fields.location, notes: fields.notes, budgetPerT: fields.price === "" ? null : Number(fields.price) });
      if (!result) { setError(t("recordCrud.failed")); return; }
      closeModal();
      if (mode === "delete" && redirectAfterDelete) navigate(redirectAfterDelete);
      else if (mode === "edit") setSuccess(true);
    } finally { setSaving(false); }
  };
  const inputClass = "mt-1 block min-h-11 w-full rounded-lg border border-steel-300 bg-white px-3 text-sm disabled:bg-steel-100 dark:border-steel-700 dark:bg-ink-900 dark:text-white dark:disabled:bg-steel-800";
  return <div className="space-y-2">
    {compact ? (
      <details className="relative">
        <summary aria-label="Passport actions" className="flex size-8 cursor-pointer list-none items-center justify-center rounded-full bg-white/95 text-[#34493a] shadow-sm transition hover:bg-white [&::-webkit-details-marker]:hidden">
          <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="size-4"><circle cx="4" cy="10" r="1.5" /><circle cx="10" cy="10" r="1.5" /><circle cx="16" cy="10" r="1.5" /></svg>
        </summary>
        <div className="absolute right-0 top-9 z-20 min-w-32 rounded-xl border border-[#e2e5de] bg-white p-1.5 shadow-lg dark:border-steel-700 dark:bg-[#17251d]">
          <button type="button" disabled={editBlocked} onClick={() => open("edit")} className="block w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-[#34493a] transition hover:bg-[#f1f4ef] disabled:cursor-not-allowed disabled:opacity-50 dark:text-white dark:hover:bg-white/[0.06]">{t("recordCrud.edit")}</button>
          <button type="button" disabled={hasOrders} onClick={() => open("delete")} className="block w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-[#9b3e35] transition hover:bg-[#fbf0ee] disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-white/[0.06]">{t("recordCrud.delete")}</button>
        </div>
      </details>
    ) : (
      <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={editBlocked} onClick={() => open("edit")}>{t("recordCrud.edit")}</Button><Button size="sm" variant="outline" disabled={hasOrders} onClick={() => open("delete")}>{t("recordCrud.delete")}</Button></div>
    )}
    {hasOrders && <p className="text-xs text-steel-500 dark:text-steel-400">{t(isPassport ? "recordCrud.passportLinked" : "recordCrud.requestLinked")}</p>}
    {success && <p role="status" className="text-xs text-loop-700 dark:text-loop-300">{t("recordCrud.saved")}</p>}
    <Modal isOpen={isOpen} onClose={() => { if (!saving) closeModal(); }} showCloseButton={!saving} className="mx-4 max-w-xl p-5 sm:p-7">
      <form onSubmit={submit} aria-label={t(`recordCrud.${mode}`)}>
        <h2 className="pe-10 font-archivo text-xl font-bold text-ink-900 dark:text-white">{t(`recordCrud.${mode}`)} · {id}</h2>
        {mode === "delete" ? <p className="mt-4 text-sm text-steel-600 dark:text-steel-300">{t("recordCrud.confirmDelete")}</p> : <div className="mt-4 grid max-h-96 gap-card overflow-y-auto sm:grid-cols-2">
          <label className="text-sm text-steel-700 dark:text-steel-300">{t("recordCrud.material")}<input required minLength={2} maxLength={100} value={fields.material} disabled={saving || typeLocked} onChange={event => change("material", event.target.value)} className={inputClass} /></label>
          <label className="text-sm text-steel-700 dark:text-steel-300">{t("recordCrud.quantity")}<input type="number" required min={Math.max(0.1, isPassport ? 0.1 : committedT)} step="0.1" value={fields.quantity} disabled={saving} onChange={event => change("quantity", event.target.value)} className={inputClass} /></label>
          <label className="text-sm text-steel-700 dark:text-steel-300">{t(isPassport ? "recordCrud.availableFrom" : "recordCrud.neededBy")}<input type="date" required={!isPassport} min={isPassport ? undefined : new Date().toISOString().slice(0, 10)} value={fields.date} disabled={saving} onChange={event => change("date", event.target.value)} className={inputClass} /></label>
          <label className="text-sm text-steel-700 dark:text-steel-300">{t(isPassport ? "recordCrud.price" : "recordCrud.budget")}<input type="number" min="0" step="0.01" value={fields.price} disabled={saving} onChange={event => change("price", event.target.value)} className={inputClass} /></label>
          {isPassport ? <>
            <label className="text-sm text-steel-700 dark:text-steel-300">{t("recordCrud.condition")}<select value={fields.condition} disabled={saving || typeLocked} onChange={event => change("condition", event.target.value)} className={inputClass}>{["good", "fair", "poor"].map(value => <option key={value} value={value}>{t(`recordCrud.${value}`)}</option>)}</select></label>
            <label className="text-sm text-steel-700 dark:text-steel-300">{t("recordCrud.grade")}<select value={fields.grade} disabled={saving || typeLocked} onChange={event => change("grade", event.target.value)} className={inputClass}>{["A", "B", "C"].map(value => <option key={value}>{value}</option>)}</select></label>
          </> : <label className="text-sm text-steel-700 dark:text-steel-300 sm:col-span-2">{t("recordCrud.location")}<input required maxLength={250} value={fields.location} disabled={saving || hasOrders} onChange={event => change("location", event.target.value)} className={inputClass} /></label>}
          <label className="text-sm text-steel-700 dark:text-steel-300 sm:col-span-2">{t("recordCrud.notes")}<textarea maxLength={5000} value={fields.notes} disabled={saving} onChange={event => change("notes", event.target.value)} className={`${inputClass} min-h-24 py-2`} /></label>
          {typeLocked && <p className="text-xs text-steel-500 dark:text-steel-400 sm:col-span-2">{t("recordCrud.typeLocked")}</p>}
        </div>}
        {error && <p role="alert" className="mt-3 text-sm text-error-600 dark:text-error-400">{error}</p>}
        <div className="mt-5 flex gap-3"><Button type="submit" size="sm" disabled={saving}>{t(saving ? "recordCrud.saving" : mode === "delete" ? "recordCrud.delete" : "recordCrud.save")}</Button><Button size="sm" variant="outline" disabled={saving} onClick={closeModal}>{t("recordCrud.cancel")}</Button></div>
      </form>
    </Modal>
  </div>;
}

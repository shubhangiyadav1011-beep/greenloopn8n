import { useState, useId } from "react";
import { Modal } from "@/components/ui/modal";
import { materialTypeLabel } from "@/utils";
import type { MaterialPassport, ReceiverFacility } from "@shared/domain/types";
import type { MaterialLedger } from "@shared/domain/capacity";

interface AllocateSurplusModalProps {
  isOpen: boolean;
  onClose: () => void;
  material: MaterialPassport | null;
  ledger: MaterialLedger | null;
  receivers: ReceiverFacility[];
  initialReceiverId?: string;
  onAllocate: (materialId: string, receiverId: string, slotDate: string, tonnesT: number) => Promise<boolean>;
}

export default function AllocateSurplusModal({
  isOpen,
  onClose,
  material,
  ledger,
  receivers,
  initialReceiverId,
  onAllocate,
}: AllocateSurplusModalProps) {
  const receiverSelectId = useId();
  const dateInputId = useId();
  const tonnageInputId = useId();

  const todayStr = new Date().toISOString().slice(0, 10);
  const defaultDate = material?.availableFrom && material.availableFrom >= todayStr
    ? material.availableFrom
    : todayStr;

  const [selectedReceiverId, setSelectedReceiverId] = useState<string>(
    initialReceiverId && receivers.some((r) => r.id === initialReceiverId)
      ? initialReceiverId
      : (receivers[0]?.id ?? "")
  );
  const [deliveryDate, setDeliveryDate] = useState<string>(defaultDate);
  const [tonnesT, setTonnesT] = useState<string>(ledger ? Math.min(ledger.availableT, 20).toString() : "10");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!material || !ledger) return null;

  const availableT = ledger.availableT;
  const numTonnes = Number(tonnesT);
  const remainingSurplus = Number.isFinite(numTonnes) ? Math.max(0, Math.round((availableT - numTonnes) * 10) / 10) : availableT;
  const isOverAllocated = numTonnes > availableT;

  const handleClose = () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!selectedReceiverId) {
      setErrorMsg("Please select a receiver facility.");
      return;
    }
    if (!deliveryDate || deliveryDate < todayStr) {
      setErrorMsg("Please choose a future delivery date.");
      return;
    }
    if (!numTonnes || numTonnes <= 0) {
      setErrorMsg("Allocation quantity must be greater than 0 tonnes.");
      return;
    }
    if (numTonnes > availableT) {
      setErrorMsg(`Requested quantity (${numTonnes} t) exceeds available surplus (${availableT.toFixed(1)} t).`);
      return;
    }

    setIsSubmitting(true);
    try {
      const ok = await onAllocate(material.id, selectedReceiverId, deliveryDate, numTonnes);
      if (ok) {
        setSuccessMsg(`Successfully allocated ${numTonnes.toFixed(1)} t to receiver!`);
        setTimeout(() => {
          handleClose();
        }, 1200);
      } else {
        setErrorMsg("Failed to allocate capacity. Please verify receiver compatibility or slot capacity.");
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Error allocating surplus.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} className="max-w-xl p-6 sm:p-7">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#00e599]/15 text-[#00a86b] dark:text-[#00e599]">
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
          </svg>
        </span>
        <div>
          <h2 className="font-archivo text-xl font-bold text-[#14261c] dark:text-white">
            Allocate Surplus Material
          </h2>
          <p className="text-xs text-[#6e7b71] dark:text-gray-400">
            {materialTypeLabel(material.type)} · <span className="font-mono">{material.id}</span>
          </p>
        </div>
      </div>

      {/* Ledger Snapshot Bar */}
      <div className="mt-5 grid grid-cols-4 gap-2 rounded-xl border border-[#e4e1d7] bg-[#f9f9f6] p-3 text-center dark:border-steel-800 dark:bg-white/[0.02]">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#8b958c]">Total Stock</p>
          <p className="font-archivo text-sm font-bold text-[#14261c] dark:text-white">
            {ledger.totalT.toFixed(1)} t
          </p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#8b958c]">Committed</p>
          <p className="font-archivo text-sm font-bold text-[#2563eb] dark:text-[#60a5fa]">
            {ledger.committedT.toFixed(1)} t
          </p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#8b958c]">Reserved</p>
          <p className="font-archivo text-sm font-bold text-[#d97706] dark:text-[#fbbf24]">
            {ledger.reservedT.toFixed(1)} t
          </p>
        </div>
        <div className="rounded-lg bg-[#00e599]/10 py-0.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#00a86b] dark:text-[#00e599]">Available Surplus</p>
          <p className="font-archivo text-sm font-black text-[#008f5d] dark:text-[#00e599]">
            {ledger.availableT.toFixed(1)} t
          </p>
        </div>
      </div>

      {/* Info notice */}
      <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-[#cbe4d3] bg-[#f2f9f4] p-3 text-xs leading-relaxed text-[#235836] dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-[#a0cfae]">
        <span aria-hidden="true" className="shrink-0 text-sm font-bold">ℹ</span>
        <p>
          Allocating surplus reserves capacity for a specific receiver and proposed delivery date. <strong>Existing valid bookings and committed orders are fully preserved</strong> and will not be cancelled.
        </p>
      </div>

      {errorMsg && (
        <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          {errorMsg}
        </div>
      )}

      {successMsg && (
        <div role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
          {successMsg}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-5 space-y-4">
        {/* Receiver Select */}
        <div>
          <label htmlFor={receiverSelectId} className="block text-xs font-bold uppercase tracking-wider text-[#5a6b5e] dark:text-gray-300">
            Target Receiver Facility
          </label>
          <select
            id={receiverSelectId}
            value={selectedReceiverId}
            onChange={(e) => setSelectedReceiverId(e.target.value)}
            disabled={isSubmitting}
            className="mt-1.5 w-full rounded-xl border border-[#d2cfc4] bg-white px-3.5 py-2.5 text-sm text-[#14261c] shadow-xs focus:border-[#00e599] focus:outline-none focus:ring-1 focus:ring-[#00e599] dark:border-steel-700 dark:bg-[#121f17] dark:text-white"
          >
            {receivers.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} · {r.location || "Facility"} {r.dailyIntakeT ? `(${r.dailyIntakeT} t/day)` : ""}
              </option>
            ))}
          </select>
        </div>

        {/* Delivery Date */}
        <div>
          <label htmlFor={dateInputId} className="block text-xs font-bold uppercase tracking-wider text-[#5a6b5e] dark:text-gray-300">
            Proposed Delivery Date
          </label>
          <input
            id={dateInputId}
            type="date"
            min={todayStr}
            value={deliveryDate}
            onChange={(e) => setDeliveryDate(e.target.value)}
            disabled={isSubmitting}
            className="mt-1.5 w-full rounded-xl border border-[#d2cfc4] bg-white px-3.5 py-2.5 text-sm text-[#14261c] shadow-xs focus:border-[#00e599] focus:outline-none focus:ring-1 focus:ring-[#00e599] dark:border-steel-700 dark:bg-[#121f17] dark:text-white"
          />
        </div>

        {/* Quantity */}
        <div>
          <div className="flex items-center justify-between">
            <label htmlFor={tonnageInputId} className="block text-xs font-bold uppercase tracking-wider text-[#5a6b5e] dark:text-gray-300">
              Allocation Quantity (Tonnes)
            </label>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-[#00a86b] dark:text-[#00e599]">
                Max available: {availableT.toFixed(1)} t
              </span>
              {availableT > 0 && numTonnes !== availableT && (
                <button
                  type="button"
                  onClick={() => setTonnesT(availableT.toString())}
                  className="rounded bg-[#00e599]/15 px-1.5 py-0.5 text-[10px] font-bold text-[#008f5d] transition hover:bg-[#00e599]/25 dark:text-[#00e599]"
                >
                  Use Max ({availableT.toFixed(1)} t)
                </button>
              )}
            </div>
          </div>
          <input
            id={tonnageInputId}
            type="number"
            step="0.1"
            min="0.1"
            max={availableT}
            value={tonnesT}
            onChange={(e) => setTonnesT(e.target.value)}
            disabled={isSubmitting || availableT <= 0}
            className={`mt-1.5 w-full rounded-xl border px-3.5 py-2.5 text-sm shadow-xs focus:outline-none focus:ring-1 ${
              isOverAllocated
                ? "border-red-400 bg-red-50 text-red-900 focus:border-red-500 focus:ring-red-500 dark:border-red-800 dark:bg-red-950/20 dark:text-red-200"
                : "border-[#d2cfc4] bg-white text-[#14261c] focus:border-[#00e599] focus:ring-[#00e599] dark:border-steel-700 dark:bg-[#121f17] dark:text-white"
            }`}
          />

          {isOverAllocated && (
            <div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
              <p className="font-semibold">Quantity exceeds available surplus ({availableT.toFixed(1)} t)</p>
              <p className="mt-0.5 opacity-90">
                The remaining {((ledger.committedT || 0) + (ledger.reservedT || 0)).toFixed(1)} t is already committed or reserved for active receiver bookings.
              </p>
              <button
                type="button"
                onClick={() => setTonnesT(availableT.toString())}
                className="mt-2 inline-flex items-center gap-1 rounded-md bg-red-600 px-2.5 py-1 text-[11px] font-bold text-white transition hover:bg-red-700"
              >
                Cap at Maximum Available ({availableT.toFixed(1)} t)
              </button>
            </div>
          )}

          {availableT <= 0 && (
            <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
              <p className="font-semibold">No surplus available to allocate</p>
              <p className="mt-0.5 opacity-90">
                All {ledger.totalT.toFixed(1)} t of this asset is committed ({ledger.committedT.toFixed(1)} t) or reserved ({ledger.reservedT.toFixed(1)} t). Fulfill existing deliveries or reschedule to release capacity.
              </p>
            </div>
          )}

          <div className="mt-2 flex items-center justify-between text-[11px] text-[#6e7b71] dark:text-gray-400">
            <span>Remaining surplus after allocation:</span>
            <span className={`font-mono font-bold ${isOverAllocated ? "text-red-600 dark:text-red-400" : "text-[#14261c] dark:text-white"}`}>
              {remainingSurplus.toFixed(1)} t
            </span>
          </div>
        </div>

        {/* Buttons */}
        <div className="mt-6 flex items-center justify-end gap-3 pt-3 border-t border-[#edebe4] dark:border-steel-800">
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="rounded-full border border-[#d2cfc4] px-4 py-2 text-xs font-semibold text-[#48564c] transition hover:bg-[#f2f1ec] dark:border-steel-700 dark:text-gray-300 dark:hover:bg-steel-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting || isOverAllocated || availableT <= 0}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#00e599] px-5 py-2 text-xs font-bold text-[#0c1811] shadow-xs transition hover:bg-[#34f5b0] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? "Allocating..." : "Confirm Partial Allocation"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

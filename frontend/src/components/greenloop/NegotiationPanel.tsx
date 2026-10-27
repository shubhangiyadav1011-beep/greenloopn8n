import { useState } from "react";
import type { MaterialOffer } from "@shared/domain/types";
import { formatINR, formatINRPerT } from "@/utils";
import Button from "@/components/ui/button/Button";
import StatusBadge from "@/components/greenloop/StatusBadge";

export default function NegotiationPanel({ offer, canCounter, onCounter }: {
  offer: MaterialOffer;
  canCounter: boolean;
  onCounter: (pricePerT: number) => Promise<boolean>;
}) {
  const [price, setPrice] = useState("");
  const [error, setError] = useState("");
  const original = offer.pricePerT;
  const latest = offer.counters?.at(-1)?.pricePerT ?? original;
  const finalPrice = offer.agreedPricePerT ?? latest;
  const delta = original !== undefined && finalPrice !== undefined ? finalPrice - original : undefined;
  const percentage = delta !== undefined && original ? (delta / original) * 100 : undefined;

  const submitCounter = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextPrice = Number(price);
    if (!Number.isFinite(nextPrice) || nextPrice <= 0) {
      setError("Enter a price greater than zero.");
      return;
    }
    if (!await onCounter(nextPrice)) return;
    setPrice("");
    setError("");
  };

  return <section className="mt-4 border border-steel-200 bg-steel-50/70 p-4 dark:border-steel-800 dark:bg-white/[0.03] rounded-surface" aria-label="Negotiation ledger">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="eyebrow-label text-steel-500 dark:text-steel-400">Transaction analysis</p>
        <h4 className="mt-1 font-archivo text-base font-bold text-ink-900 dark:text-white">Price negotiation</h4>
      </div>
      <div className="flex flex-wrap items-center gap-2"><StatusBadge status={offer.status} /><p className="text-xs font-medium text-steel-600 dark:text-gray-300">{offer.offeredQuantityT.toLocaleString("en-IN")} t · {finalPrice !== undefined ? formatINR(finalPrice * offer.offeredQuantityT) : "Price on request"}</p></div>
    </div>

    <ol className="mt-4 space-y-2 border-s-2 border-loop-300 ps-4 dark:border-loop-700">
      <li className="relative text-sm"><span className="absolute -start-[1.35rem] top-1.5 size-2 rounded-full bg-loop-600" /><span className="font-semibold text-ink-900 dark:text-white">Original offer</span><span className="ms-2 text-steel-600 dark:text-gray-300">{original !== undefined ? formatINRPerT(original) : "No price supplied"}</span></li>
      {(offer.counters ?? []).map((counter, index) => <li key={`${counter.at}-${index}`} className="relative text-sm"><span className="absolute -start-[1.35rem] top-1.5 size-2 rounded-full bg-steel-400" /><span className="font-semibold capitalize text-ink-900 dark:text-white">{counter.actor} counter</span><span className="ms-2 text-steel-600 dark:text-gray-300">{formatINRPerT(counter.pricePerT)}</span><time className="ms-2 text-xs text-steel-500">{new Date(counter.at).toLocaleDateString("en-IN")}</time></li>)}
      {offer.agreedPricePerT !== undefined && <li className="relative text-sm"><span className="absolute -start-[1.35rem] top-1.5 size-2 rounded-full bg-loop-700" /><span className="font-semibold text-ink-900 dark:text-white">Final agreed price</span><span className="ms-2 font-bold text-loop-700 dark:text-loop-300">{formatINRPerT(offer.agreedPricePerT)}</span></li>}
    </ol>

    <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 border-t border-steel-200 pt-3 text-xs dark:border-steel-800">
      {finalPrice !== undefined && <p><span className="text-steel-500">Unit price</span> <strong className="ms-1 text-ink-900 dark:text-white">{formatINRPerT(finalPrice)}</strong></p>}
      {delta !== undefined && <p><span className="text-steel-500">Difference</span> <strong className="ms-1 text-ink-900 dark:text-white">{delta >= 0 ? "+" : "−"}{formatINR(Math.abs(delta))}/t{percentage !== undefined ? ` (${percentage >= 0 ? "+" : "−"}${Math.abs(percentage).toFixed(1)}%)` : ""}</strong></p>}
      {finalPrice !== undefined && <p><span className="text-steel-500">Total value</span> <strong className="ms-1 text-ink-900 dark:text-white">{formatINR(finalPrice * offer.offeredQuantityT)}</strong></p>}
    </div>

    {canCounter && <form onSubmit={submitCounter} className="mt-4 flex flex-col gap-2 border-t border-steel-200 pt-3 sm:flex-row sm:items-end dark:border-steel-800">
      <label className="flex-1 text-xs font-medium text-steel-700 dark:text-gray-300">Counter price per tonne (₹)
        <input type="number" min="0.01" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} className="mt-1 block h-10 w-full rounded-sm border-steel-300 bg-white px-3 text-sm dark:border-steel-700 dark:bg-black dark:text-white" />
      </label>
      <Button size="sm" type="submit">Send counter</Button>
      {error && <p role="alert" className="text-xs text-error-500 sm:basis-full">{error}</p>}
    </form>}
  </section>;
}

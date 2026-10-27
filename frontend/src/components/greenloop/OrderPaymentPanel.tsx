import { useState } from "react";
import Button from "@/components/ui/button/Button";
import type { Booking, BookingPayment } from "@shared/domain/types";
import { useGreenLoopStore } from "@/store/GreenLoopStore.helpers";
import { useTranslation } from "react-i18next";
import ReceiverCheckoutModal from "./ReceiverCheckoutModal";
import { generateOrderInvoice, type OrderInvoiceData } from "@/lib/orderInvoice";
import { useAuth } from "@/context/AuthContext.helpers";

const money = (minor: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(minor / 100);

export default function OrderPaymentPanel({
  booking,
  workspace,
}: {
  booking: Booking;
  workspace?: string;
}) {
  const { t } = useTranslation();
  const { dataset, disputePaymentAction } = useGreenLoopStore();
  const { user } = useAuth();

  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [isGeneratingReceipt, setIsGeneratingReceipt] = useState(false);

  const material = dataset.materials.find((m) => m.id === booking.materialId);
  const offer = dataset.offers?.find(
    (item) => item.demandId === booking.demandId && item.passportId === booking.materialId,
  );
  const agreedPricePerT = Number(
    booking.agreedPricePerT ?? offer?.agreedPricePerT ?? offer?.pricePerT ?? material?.pricePerT ?? 0,
  );

  const allPayments = (dataset.payments || []).filter((item) => item.bookingId === booking.id);
  const payment = allPayments[0]; // Latest attempt
  const verification = dataset.verifications.find((item) => item.bookingId === booking.id);

  const receiver = workspace === "receiver";
  const provider = workspace === "provider";

  const isConfirmed = booking.status === "confirmed" && Boolean(booking.receiverAcceptedAt);
  const isPaid = payment && ["paid", "adjustment"].includes(payment.paymentStatus);
  const isDispatched = Boolean(booking.loadRef);
  const isVerified = verification && ["verified", "rejected"].includes(verification.status);
  const isSettled = payment?.payoutStatus === "settled";

  const canStart = receiver && isConfirmed && (!payment || payment.paymentStatus === "failed");
  const canDispute = receiver && isDispatched && isPaid && payment?.payoutStatus !== "settled";

  const dispute = async () => {
    setBusy(true);
    try {
      if (await disputePaymentAction(booking.id, reason)) {
        setReason("");
      }
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadReceipt = async (targetPayment?: BookingPayment) => {
    const pay = targetPayment || payment;
    if (!pay) return;
    setIsGeneratingReceipt(true);
    try {
      const receiverFacility = dataset.receivers.find((r) => r.id === booking.receiverId);
      const project = dataset.projects.find((p) => p.id === material?.projectId);

      const invoiceData: OrderInvoiceData = {
        bookingId: booking.id,
        invoiceDate: new Date(),
        orderDate: new Date(booking.createdAt).toLocaleDateString("en-IN"),
        loadReference: booking.loadRef,
        provider: {
          name: "Material Provider",
          organization: project?.name ? `${project.name} Site` : "Provider Yard",
          email: "provider@demo.greenloop",
        },
        receiver: {
          name: user?.name || "Material Receiver",
          organization: receiverFacility?.name || user?.organization || "Receiver Facility",
          email: user?.email,
          address: receiverFacility?.location,
        },
        projectName: project?.name,
        projectLocation: project?.location,
        materialId: booking.materialId,
        materialType: material?.type || "Material",
        quantityT: booking.tonnesT,
        unitPricePerT: agreedPricePerT,
        payment: pay,
      };

      const doc = await generateOrderInvoice(invoiceData);
      const url = URL.createObjectURL(doc.blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Receipt generation failed:", e);
    } finally {
      setIsGeneratingReceipt(false);
    }
  };

  // Determine active lifecycle step:
  // 1: Confirmed, 2: Escrow Funded, 3: In Transit, 4: Weighbridge Verified, 5: Settled
  const currentStep = isSettled
    ? 5
    : isVerified
    ? 4
    : isDispatched
    ? 3
    : isPaid
    ? 2
    : isConfirmed
    ? 1
    : 0;

  const totalPayableMinor = Math.round(booking.tonnesT * agreedPricePerT * 100);

  return (
    <section
      className="mt-card rounded-2xl border border-steel-200 bg-white p-5 shadow-xs dark:border-steel-800 dark:bg-steel-950"
      aria-label="Demo Payment & Settlement Panel"
    >
      {/* DEMO Disclaimer Banner */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2 text-xs font-semibold text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300">
        <div className="flex items-center gap-2">
          <span className="flex size-2 rounded-full bg-amber-500" />
          <span className="font-bold uppercase tracking-wider">DEMO — No real money charged</span>
        </div>
        <span className="text-[11px] font-medium opacity-90">
          Simulated escrow with 5% GreenLoop commission and automated weighbridge settlement.
        </span>
      </div>

      {/* Header and Financial Summary */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-steel-200 pb-4 dark:border-steel-800">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-loop-700 dark:text-loop-400">
            Escrow & Settlement Workflow
          </p>
          <h4 className="mt-1 font-archivo text-xl font-bold text-ink-900 dark:text-white">
            {payment?.paymentStatus === "disputed"
              ? "Payment Disputed"
              : isSettled
              ? "Settlement Finalized"
              : isVerified
              ? "Weighbridge Verified · Settling"
              : isPaid
              ? "Escrow Funded · Ready to Dispatch"
              : payment?.paymentStatus === "failed"
              ? "Payment Authorization Failed"
              : "Escrow Deposit Required"}
          </h4>
        </div>
        <div className="text-end">
          <span className="font-mono text-xl font-bold text-ink-900 dark:text-white">
            {payment ? money(payment.amountMinor) : money(totalPayableMinor)}
          </span>
          <p className="text-xs text-steel-500 dark:text-steel-400">
            {booking.tonnesT} t @ ₹{agreedPricePerT.toLocaleString("en-IN")}/t
          </p>
        </div>
      </div>

      {/* 5-Step Visual Escrow Lifecycle Bar */}
      <div className="my-5">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-steel-500 dark:text-steel-400">
          Simulated Settlement Pipeline
        </p>
        <div className="grid grid-cols-5 gap-2 text-center text-xs font-semibold">
          {[
            { step: 1, title: "1. Confirmed", done: currentStep >= 1 },
            { step: 2, title: "2. Escrow Funded", done: currentStep >= 2 },
            { step: 3, title: "3. Dispatched", done: currentStep >= 3 },
            { step: 4, title: "4. Verified", done: currentStep >= 4 },
            { step: 5, title: "5. Settled", done: currentStep >= 5 },
          ].map((item) => (
            <div key={item.step} className="flex flex-col items-center">
              <div
                className={`flex h-8 w-full items-center justify-center rounded-lg border text-xs transition ${
                  item.done
                    ? "border-loop-600 bg-loop-600 text-white font-bold"
                    : currentStep + 1 === item.step
                    ? "border-loop-500 bg-loop-50 text-loop-800 dark:border-loop-400 dark:bg-loop-950/60 dark:text-loop-200 font-bold animate-pulse"
                    : "border-steel-200 bg-steel-100 text-steel-400 dark:border-steel-800 dark:bg-steel-900"
                }`}
              >
                {item.done ? "✓ " : ""}
                {item.title}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Role-Specific Context & Actions */}
      <div className="space-y-4">
        {/* Receiver checkout CTA */}
        {receiver && canStart && (
          <div className="rounded-xl border border-loop-200 bg-loop-50/70 p-4 dark:border-loop-900/50 dark:bg-loop-950/30">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h5 className="font-semibold text-loop-900 dark:text-loop-200">
                  {payment?.paymentStatus === "failed" ? "Retry Escrow Deposit" : "Deposit Funds into Escrow"}
                </h5>
                <p className="text-xs text-steel-600 dark:text-steel-400">
                  Select simulated UPI, Corporate Card, or Net Banking. Funds are locked securely in demo escrow.
                </p>
              </div>
              <Button size="sm" variant="primary" onClick={() => setCheckoutOpen(true)}>
                {payment?.paymentStatus === "failed" ? "Retry Payment (Demo)" : "Pay Now / Open Checkout"}
              </Button>
            </div>
            {payment?.paymentStatus === "failed" && (
              <p className="mt-2 text-xs font-medium text-error-700 dark:text-error-300">
                {t("orderPayment.failedNote")}
              </p>
            )}
          </div>
        )}

        {/* Provider perspective notice */}
        {provider && !isPaid && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
            <span className="font-bold">Awaiting Receiver Escrow Deposit:</span> Do not dispatch this load until the
            receiver funds escrow. Once funds are locked, GreenLoop guarantees provider payout upon weighbridge acceptance.
          </div>
        )}

        {provider && isPaid && !isDispatched && (
          <div className="rounded-xl border border-loop-200 bg-loop-50/60 p-4 text-xs text-loop-900 dark:border-loop-900/40 dark:bg-loop-950/30 dark:text-loop-200">
            <span className="font-bold">Escrow Funded ({money(payment.amountMinor)}):</span> Safe to dispatch! Payout
            will be automatically scheduled upon delivery and weighbridge tonnage verification.
          </div>
        )}

        {/* Settlement and Financial Itemization (when payment exists) */}
        {payment && (
          <div className="rounded-xl border border-steel-200 bg-steel-50/60 p-4 text-xs dark:border-steel-800 dark:bg-steel-900/40">
            <div className="flex items-center justify-between border-b border-steel-200 pb-2 dark:border-steel-800">
              <span className="font-bold uppercase tracking-wider text-steel-600 dark:text-steel-400">
                Simulated Financial Breakdown
              </span>
              <span className="font-mono text-[11px] text-steel-500">Ref: {payment.providerReference}</span>
            </div>

            <dl className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-steel-500 dark:text-steel-400">Gross Escrow Deposit</dt>
                <dd className="font-mono font-semibold text-ink-900 dark:text-white">
                  {money(payment.amountMinor)}
                </dd>
              </div>

              {payment.acceptedT !== undefined && (
                <div>
                  <dt className="text-steel-500 dark:text-steel-400">Weighbridge Accepted Material</dt>
                  <dd className="font-mono font-semibold text-ink-900 dark:text-white">
                    {payment.acceptedT} tonnes · {money(payment.acceptedValueMinor)}
                  </dd>
                </div>
              )}

              {payment.acceptedT !== undefined && (
                <div>
                  <dt className="text-steel-500 dark:text-steel-400">GreenLoop Commission (5%)</dt>
                  <dd className="font-mono font-semibold text-steel-700 dark:text-steel-300">
                    -{money(payment.commissionMinor)}
                  </dd>
                </div>
              )}

              {payment.refundAmountMinor > 0 && (
                <div className="rounded-md bg-amber-50 p-2 dark:bg-amber-950/40">
                  <dt className="font-bold text-amber-800 dark:text-amber-300">Buyer Partial-Delivery Refund</dt>
                  <dd className="font-mono font-semibold text-amber-900 dark:text-amber-200">
                    {money(payment.refundAmountMinor)} · Status: {payment.refundStatus.toUpperCase()}
                  </dd>
                </div>
              )}

              {payment.payoutAmountMinor > 0 && (
                <div className="rounded-md bg-loop-50 p-2 dark:bg-loop-950/40">
                  <dt className="font-bold text-loop-800 dark:text-loop-300">Provider Net Payout</dt>
                  <dd className="font-mono font-semibold text-loop-900 dark:text-loop-200">
                    {money(payment.payoutAmountMinor)} · Status: {payment.payoutStatus.toUpperCase()}
                    {payment.payoutReference && (
                      <span className="block text-[10px] text-steel-500">Trf Ref: {payment.payoutReference}</span>
                    )}
                  </dd>
                </div>
              )}
            </dl>

            {/* Direct receipt download */}
            {isPaid && (
              <div className="mt-3.5 flex items-center justify-between border-t border-steel-200 pt-3 dark:border-steel-800">
                <span className="text-[11px] text-steel-500">
                  Official demo receipt with simulated transaction ID & commission breakdown.
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleDownloadReceipt()}
                  disabled={isGeneratingReceipt}
                >
                  {isGeneratingReceipt ? "Generating…" : "Download Demo Receipt"}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Dispute Section for Receiver */}
        {canDispute && (
          <div className="space-y-2 rounded-xl border border-warning-200 bg-warning-50/50 p-4 text-xs dark:border-warning-900/40 dark:bg-warning-950/20">
            <label
              className="block font-semibold text-warning-900 dark:text-warning-300"
              htmlFor={`payment-dispute-${booking.id}`}
            >
              Dispute Delivery & Hold Settlement Payout
            </label>
            <p className="text-steel-600 dark:text-steel-400">
              If load arrived with quality or compliance issues, record a dispute to hold provider payout in escrow.
            </p>
            <textarea
              id={`payment-dispute-${booking.id}`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="State reason for dispute (e.g. material contaminated, specification mismatch)…"
              maxLength={1000}
              className="min-h-16 w-full rounded-lg border border-steel-300 bg-white p-2.5 text-xs text-ink-900 focus:outline-hidden dark:border-steel-700 dark:bg-steel-950 dark:text-white"
            />
            <Button size="sm" variant="outline" disabled={busy || !reason.trim()} onClick={dispute}>
              {busy ? "Submitting Dispute…" : "Dispute Delivery"}
            </Button>
          </div>
        )}

        {payment?.paymentStatus === "disputed" && (
          <div className="rounded-xl border border-warning-300 bg-warning-50 p-3 text-xs text-warning-900 dark:border-warning-900 dark:bg-warning-950/40 dark:text-warning-200">
            <span className="font-bold">Dispute Active:</span> Provider payout is held in simulated escrow pending
            resolution. Reason: {payment.disputeReason || "Delivery disputed"}.
          </div>
        )}

        {/* Multi-Attempt Payment History Accordion */}
        {allPayments.length > 0 && (
          <div className="rounded-xl border border-steel-200 dark:border-steel-800">
            <button
              type="button"
              onClick={() => setHistoryOpen(!historyOpen)}
              className="flex w-full items-center justify-between p-3.5 text-xs font-bold text-steel-700 transition hover:bg-steel-50 dark:text-steel-300 dark:hover:bg-steel-900/50"
            >
              <div className="flex items-center gap-2">
                <svg
                  aria-hidden="true"
                  className="size-4 text-steel-500"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                <span>Payment Attempt History & Audit Trail ({allPayments.length} recorded)</span>
              </div>
              <span className="text-[11px] font-normal text-steel-500">{historyOpen ? "Hide ▲" : "Show ▼"}</span>
            </button>

            {historyOpen && (
              <div className="border-t border-steel-200 p-3 text-xs dark:border-steel-800">
                <div className="overflow-x-auto">
                  <table className="w-full text-start text-xs">
                    <thead>
                      <tr className="border-b border-steel-200 text-steel-500 dark:border-steel-800">
                        <th className="pb-2 text-start font-semibold">Timestamp</th>
                        <th className="pb-2 text-start font-semibold">Transaction ID</th>
                        <th className="pb-2 text-start font-semibold">Amount</th>
                        <th className="pb-2 text-start font-semibold">Status</th>
                        <th className="pb-2 text-end font-semibold">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-steel-100 dark:divide-steel-800/60">
                      {allPayments.map((p) => (
                        <tr key={p.attemptId || p.providerReference}>
                          <td className="py-2 font-mono text-[11px] text-steel-600 dark:text-steel-400">
                            {new Date(p.createdAt).toLocaleString("en-IN")}
                          </td>
                          <td className="py-2 font-mono text-[11px] text-ink-900 dark:text-steel-200">
                            {p.providerReference}
                          </td>
                          <td className="py-2 font-mono font-semibold text-ink-900 dark:text-white">
                            {money(p.amountMinor)}
                          </td>
                          <td className="py-2">
                            <span
                              className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                                p.paymentStatus === "paid" || p.paymentStatus === "adjustment"
                                  ? "bg-loop-100 text-loop-800 dark:bg-loop-950 dark:text-loop-300"
                                  : p.paymentStatus === "failed"
                                  ? "bg-error-100 text-error-800 dark:bg-error-950 dark:text-error-300"
                                  : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                              }`}
                            >
                              {p.paymentStatus}
                            </span>
                          </td>
                          <td className="py-2 text-end">
                            {["paid", "adjustment"].includes(p.paymentStatus) ? (
                              <button
                                type="button"
                                onClick={() => handleDownloadReceipt(p)}
                                className="font-semibold text-loop-700 hover:underline dark:text-loop-400"
                              >
                                Receipt
                              </button>
                            ) : (
                              <span className="text-steel-400">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Receiver Checkout Modal */}
      {checkoutOpen && (
        <ReceiverCheckoutModal
          isOpen={checkoutOpen}
          onClose={() => setCheckoutOpen(false)}
          booking={booking}
          material={material}
          agreedPricePerT={agreedPricePerT}
          existingPayment={payment}
        />
      )}
    </section>
  );
}

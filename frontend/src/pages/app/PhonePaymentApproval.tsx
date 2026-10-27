import { useState, useEffect } from "react";
import { useParams, Link } from "react-router";
import PageMeta from "@/components/common/PageMeta";

interface PaymentSession {
  reference: string;
  attemptId: string;
  bookingId: string;
  merchantName: string;
  materialName: string;
  amountMinor: number;
  currency: string;
  status: "pending" | "paid" | "failed" | "adjustment" | "disputed";
  paidAt?: string;
  transactionReference?: string;
  createdAt: string;
  isDemo: boolean;
}

export default function PhonePaymentApproval() {
  const { reference = "" } = useParams();
  const [session, setSession] = useState<PaymentSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState(false);
  const [error, setError] = useState("");
  const [outcome, setOutcome] = useState<"pending" | "approved" | "cancelled">("pending");
  const [txRef, setTxRef] = useState("");

  useEffect(() => {
    let active = true;
    const fetchSession = async () => {
      try {
        const res = await fetch(`/api/payments/session/${encodeURIComponent(reference)}`);
        if (!res.ok) {
          throw new Error("Payment session expired or not found.");
        }
        const data = await res.json();
        if (active && data.session) {
          setSession(data.session);
          if (data.session.status === "paid") {
            setOutcome("approved");
            setTxRef(data.session.transactionReference || "UPI-GL-CONFIRMED");
          } else if (data.session.status === "failed") {
            setOutcome("cancelled");
          }
        }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Failed to load payment session");
      } finally {
        if (active) setLoading(false);
      }
    };
    void fetchSession();
    return () => {
      active = false;
    };
  }, [reference]);

  const handleApprove = async () => {
    if (actionBusy || !reference) return;
    setActionBusy(true);
    try {
      const res = await fetch(`/api/payments/session/${encodeURIComponent(reference)}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-GreenLoop-Client": "web" },
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Approval failed.");
      }
      setOutcome("approved");
      setTxRef(data.session?.transactionReference || `UPI-GL-${Math.random().toString(36).slice(2, 9).toUpperCase()}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Approval failed.");
    } finally {
      setActionBusy(false);
    }
  };

  const handleCancel = async () => {
    if (actionBusy || !reference) return;
    setActionBusy(true);
    try {
      const res = await fetch(`/api/payments/session/${encodeURIComponent(reference)}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-GreenLoop-Client": "web" },
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Cancellation failed.");
      }
      setOutcome("cancelled");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Cancellation failed.");
    } finally {
      setActionBusy(false);
    }
  };

  const amountINR = session ? Math.round(session.amountMinor / 100) : 0;

  return (
    <main className="min-h-screen bg-[#f3f6f4] px-4 py-6 sm:py-10 flex flex-col items-center justify-center font-outfit text-gray-900">
      <PageMeta
        title="UPI Payment Approval · GreenLoop Escrow"
        description="Approve your GreenLoop escrow payment securely on mobile"
      />

      <div className="w-full max-w-md">
        {/* Header Branding */}
        <div className="flex items-center justify-between mb-4 px-1">
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-xl bg-[#164b2d] text-white shadow-xs">
              <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <polyline points="9 12 11 14 15 10" />
              </svg>
            </div>
            <div>
              <h1 className="font-archivo text-base font-bold text-gray-900 leading-tight">
                GreenLoop Pay
              </h1>
              <p className="text-[10px] text-emerald-800 font-semibold tracking-wide uppercase">
                Escrow Protected Payment
              </p>
            </div>
          </div>

          <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold text-amber-900">
            DEMO SANDBOX
          </span>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="rounded-3xl border border-gray-200/90 bg-white p-8 text-center shadow-sm">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-emerald-50 text-[#164b2d] animate-pulse">
              <svg className="size-6 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
              </svg>
            </div>
            <p className="mt-4 font-semibold text-sm text-gray-700">Loading payment request…</p>
            <p className="text-xs text-gray-400 mt-1">Retrieving order details from GreenLoop Escrow</p>
          </div>
        )}

        {/* Error State */}
        {!loading && error && (
          <div className="rounded-3xl border border-rose-200 bg-white p-8 text-center shadow-sm">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-rose-100 text-rose-700">
              <svg className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </div>
            <h2 className="mt-4 font-archivo text-lg font-bold text-gray-900">Session Unavailable</h2>
            <p className="mt-1 text-xs text-gray-500">{error}</p>
            <Link
              to="/app"
              className="mt-6 inline-flex rounded-xl bg-gray-900 px-4 py-2 text-xs font-semibold text-white hover:bg-black"
            >
              Return to Platform
            </Link>
          </div>
        )}

        {/* Pending State — The Payment Request Card */}
        {!loading && !error && session && outcome === "pending" && (
          <div className="rounded-3xl border border-gray-200/90 bg-white p-6 sm:p-7 shadow-sm">
            {/* Payee Info */}
            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                  Paying To Merchant
                </span>
                <p className="font-archivo text-base font-bold text-gray-900 mt-0.5">
                  {session.merchantName}
                </p>
                <p className="text-xs text-emerald-800 font-medium flex items-center gap-1 mt-0.5">
                  <span className="size-1.5 rounded-full bg-emerald-600" />
                  Verified Circular Material Provider
                </p>
              </div>
              <div className="flex size-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-800 shrink-0">
                <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
              </div>
            </div>

            {/* Order Specs */}
            <div className="py-4 space-y-2.5 text-xs text-gray-600 border-b border-gray-100">
              <div className="flex justify-between">
                <span className="text-gray-400">Order Reference</span>
                <span className="font-mono font-bold text-gray-900">#{session.bookingId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Material</span>
                <span className="font-semibold text-gray-900">{session.materialName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Payment Channel</span>
                <span className="font-semibold text-gray-900">UPI Instant Escrow (Simulated)</span>
              </div>
            </div>

            {/* Amount Big Display */}
            <div className="py-5 text-center bg-[#f0f9f3] rounded-2xl my-4 border border-emerald-100/60">
              <span className="text-xs font-semibold text-emerald-950 uppercase tracking-wider">
                Total Amount To Lock In Escrow
              </span>
              <p className="font-archivo text-3xl font-bold text-[#164b2d] mt-1 tracking-tight">
                ₹{amountINR.toLocaleString("en-IN")}
              </p>
              <p className="text-[11px] text-emerald-800 mt-1">
                Released only upon verified site delivery &amp; intake weighbridge
              </p>
            </div>

            {/* Demo Notice */}
            <div className="rounded-xl bg-amber-50/80 p-3 border border-amber-200/60 text-[11px] text-amber-900 mb-5 leading-relaxed">
              <strong>Simulated Sandbox:</strong> This demo environment simulates phone UPI approval without debiting real bank accounts or UPI VPAs.
            </div>

            {/* Actions */}
            <div className="space-y-2.5">
              <button
                type="button"
                id="phone-approve-btn"
                disabled={actionBusy}
                onClick={handleApprove}
                className="w-full rounded-xl bg-[#164b2d] hover:bg-[#123e25] text-white py-3.5 px-4 font-bold text-base shadow-sm transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <svg className="size-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>{actionBusy ? "Authorizing Escrow…" : `Approve Payment (₹${amountINR.toLocaleString("en-IN")})`}</span>
              </button>

              <button
                type="button"
                id="phone-cancel-btn"
                disabled={actionBusy}
                onClick={handleCancel}
                className="w-full rounded-xl border border-gray-300 hover:bg-gray-50 text-gray-700 py-3 px-4 font-semibold text-sm transition"
              >
                Cancel Payment
              </button>
            </div>
          </div>
        )}

        {/* Approved Success State */}
        {!loading && outcome === "approved" && (
          <div className="rounded-3xl border border-emerald-200 bg-white p-8 text-center shadow-sm">
            <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-emerald-100 text-[#164b2d]">
              <svg className="size-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>

            <span className="mt-4 inline-block rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-[#164b2d] uppercase tracking-wider">
              Payment Approved
            </span>

            <h2 className="mt-2 font-archivo text-2xl font-bold text-gray-900">
              ₹{amountINR.toLocaleString("en-IN")} Locked in Escrow
            </h2>

            <p className="mt-1 text-xs text-gray-500 leading-relaxed">
              Your simulated payment was approved! Funds are securely deposited into GreenLoop Escrow.
            </p>

            <div className="mt-5 rounded-2xl bg-[#f0f9f3] p-4 text-start text-xs border border-emerald-100/60 space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-500">Transaction Reference:</span>
                <span className="font-mono font-bold text-gray-900">{txRef}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Order ID:</span>
                <span className="font-mono font-bold text-gray-900">#{session?.bookingId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Status:</span>
                <span className="font-bold text-emerald-800">Escrow Held (Safe)</span>
              </div>
            </div>

            <div className="mt-6 p-3 rounded-xl bg-gray-50 border border-gray-200 text-xs text-gray-600">
              ✨ <strong>Desktop Updated:</strong> Your checkout screen on desktop has transitioned automatically to confirmed order status. You can now close this tab.
            </div>
          </div>
        )}

        {/* Cancelled State */}
        {!loading && outcome === "cancelled" && (
          <div className="rounded-3xl border border-gray-200 bg-white p-8 text-center shadow-sm">
            <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-gray-100 text-gray-500">
              <svg className="size-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </div>

            <h2 className="mt-4 font-archivo text-xl font-bold text-gray-900">
              Payment Cancelled
            </h2>

            <p className="mt-1 text-xs text-gray-500 leading-relaxed">
              You cancelled the payment request. No funds were debited or deposited.
            </p>

            <p className="mt-4 text-xs text-gray-400">
              Return to your desktop checkout screen to retry or review order details.
            </p>
          </div>
        )}

        {/* Footer */}
        <p className="mt-6 text-center text-[11px] text-gray-400">
          GreenLoop Escrow Guarantee · Verified Circular Material Settlement
        </p>
      </div>
    </main>
  );
}

import { cn, materialTypeLabel } from "@/utils";
import { ambientMedia, materialMediaFor } from "@/config/appMedia";
import { motion, useReducedMotion } from "motion/react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import PageMeta from "@/components/common/PageMeta";
import OrderDedicatedDetails from "@/components/greenloop/OrderDedicatedDetails";
import StatusBadge from "@/components/greenloop/StatusBadge";
import AwaitingScheduleCard from "@/components/greenloop/AwaitingScheduleCard";
import { acceptedOffersAwaitingBooking } from "@shared/domain/orders";
import { useAuth } from "@/context/AuthContext.helpers";
import type { Booking, GreenLoopDataset, MaterialPassport } from "@shared/domain/types";
import { useGreenLoopStore } from "@/store/GreenLoopStore.helpers";
import { useMemo, useState } from "react";

const EASE = [0.22, 1, 0.36, 1] as const;

type OrderTab = "ALL" | "ACTIVE" | "SCHEDULED" | "IN_TRANSIT" | "COMPLETED";

const TABS: { key: OrderTab; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "ACTIVE", label: "Active" },
  { key: "SCHEDULED", label: "Scheduled" },
  { key: "IN_TRANSIT", label: "In Transit" },
  { key: "COMPLETED", label: "Completed" },
];

/* ------------------------------------------------------------------ */
/* Classification & Helper types                                      */
/* ------------------------------------------------------------------ */

type OrderBadgeStatus = Parameters<typeof StatusBadge>[0]["status"];

interface BookingFacts {
  booking: Booking;
  material?: MaterialPassport;
  verification: { status: string } | undefined;
  dispatched: boolean;
  tab: Exclude<OrderTab, "ALL">;
  badge: OrderBadgeStatus;
}

function classifyBooking(
  booking: Booking,
  isVerified: boolean,
  verificationStatus: string | undefined,
  dispatched: boolean
): { tab: Exclude<OrderTab, "ALL">; badge: OrderBadgeStatus } {
  const isCompleted = isVerified || verificationStatus === "rejected" || booking.status === "cancelled";
  if (isCompleted) {
    return {
      tab: "COMPLETED",
      badge: isVerified ? "verified" : verificationStatus === "rejected" ? "rejected" : "cancelled",
    };
  }
  if (dispatched) return { tab: "IN_TRANSIT", badge: "dispatched" };
  if (booking.status === "hold") return { tab: "ACTIVE", badge: "hold" };
  if (booking.status === "confirmed" && !booking.slotId) return { tab: "ACTIVE", badge: "confirmed" };
  return { tab: "SCHEDULED", badge: "confirmed" };
}

export function getCompactStatus(
  facts: BookingFacts,
  dataset: GreenLoopDataset
): { label: string; tone: "emerald" | "blue" | "gray" | "amber" | "red" } {
  const { booking, verification, dispatched } = facts;
  if (booking.status === "cancelled") {
    return { label: "Cancelled", tone: "red" };
  }
  const isVerified = verification && ["verified", "rejected"].includes(verification.status);
  if (isVerified) {
    return { label: "Delivered", tone: "emerald" };
  }
  if (dispatched) {
    return { label: "In Transit", tone: "blue" };
  }
  const payments = (dataset.payments || []).filter((p) => p.bookingId === booking.id);
  const payment = payments[0];
  const isPaid = payment?.paymentStatus === "paid" || payment?.paymentStatus === "adjustment";
  if (!isPaid) {
    return { label: "Payment Due", tone: "emerald" };
  }
  return { label: "Preparing", tone: "gray" };
}

export function formatOrderCardDate(slotDate?: string, createdAt?: string) {
  if (slotDate) {
    const d = new Date(slotDate);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    }
  }
  const base = createdAt ? new Date(createdAt) : new Date();
  base.setDate(base.getDate() + 5);
  return base.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

/* ------------------------------------------------------------------ */
/* Hero Stat Icons                                                    */
/* ------------------------------------------------------------------ */

function HeroStatIcon({ kind }: { kind: "orders" | "active" | "completed" }) {
  const paths = {
    orders: (
      <>
        <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h15A1.5 1.5 0 0 1 21 7.5v11A1.5 1.5 0 0 1 19.5 20h-15A1.5 1.5 0 0 1 3 18.5v-11Z" />
        <path d="M7.5 6h9V4.2A1.2 1.2 0 0 0 15.3 3H8.7a1.2 1.2 0 0 0-1.2 1.2V6Z" />
        <path d="M12 10.5v5M9.5 13h5" strokeLinecap="round" />
      </>
    ),
    active: (
      <>
        <path
          d="M6 6h13l-1.4 7.6a1.6 1.6 0 0 1-1.6 1.4H8.7a1.6 1.6 0 0 1-1.6-1.3L5.5 4.6A1 1 0 0 0 4.5 3.8H3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="9.4" cy="18.6" r="1.5" />
        <circle cx="16.4" cy="18.6" r="1.5" />
      </>
    ),
    completed: (
      <>
        <circle cx="12" cy="12" r="8.4" />
        <path d="m8.4 12.4 2.4 2.4 4.8-5.2" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
  };
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" className="size-5">
      {paths[kind]}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Compact Horizontal Order Summary Card (Matching Reference Image)    */
/* ------------------------------------------------------------------ */

export function OrderCompactSummaryCard({
  facts,
  isSelected = false,
  onClick,
}: {
  facts: BookingFacts;
  isSelected?: boolean;
  onClick: () => void;
}) {
  const { dataset } = useGreenLoopStore();
  const { booking, material } = facts;
  const media = materialMediaFor(material?.type ?? "concrete");
  const slot = dataset.slots.find((s) => s.id === booking.slotId);

  const statusInfo = getCompactStatus(facts, dataset);
  const dateFormatted = formatOrderCardDate(slot?.date, booking.createdAt);
  const materialTitle = material?.name || (material?.type ? materialTypeLabel(material.type) : "Concrete");

  return (
    <div
      role="button"
      tabIndex={0}
      data-order-id={booking.id}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        "group/compact flex items-center gap-3.5 rounded-2xl border p-3 transition-all duration-200 cursor-pointer text-start select-none shadow-2xs hover:shadow-xs",
        isSelected
          ? "border-emerald-600 bg-emerald-50/20 ring-2 ring-emerald-600/40 dark:border-emerald-500 dark:bg-emerald-950/30"
          : "border-gray-200/90 bg-white hover:border-gray-300 dark:border-steel-800 dark:bg-[#16271e]"
      )}
    >
      <img
        src={media.src}
        alt={materialTitle}
        loading="lazy"
        className="size-16 rounded-xl object-cover shrink-0 border border-gray-100 shadow-2xs dark:border-steel-800"
      />

      <div className="flex flex-1 flex-col justify-between self-stretch min-w-0 py-0.5">
        <div className="flex items-center justify-between gap-2">
          <span className="font-archivo text-sm font-bold text-gray-900 dark:text-white">
            {booking.id}
          </span>
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-tight shrink-0",
              statusInfo.tone === "emerald"
                ? "bg-[#dcfce7] text-[#166534] dark:bg-emerald-950/70 dark:text-emerald-300"
                : statusInfo.tone === "blue"
                ? "bg-[#e0f2fe] text-[#0369a1] dark:bg-sky-950/70 dark:text-sky-300"
                : statusInfo.tone === "amber"
                ? "bg-[#fef3c7] text-[#92400e] dark:bg-amber-950/70 dark:text-amber-300"
                : statusInfo.tone === "red"
                ? "bg-[#fee2e2] text-[#991b1b] dark:bg-red-950/70 dark:text-red-300"
                : "bg-[#f3f4f6] text-[#4b5563] dark:bg-steel-800 dark:text-gray-300"
            )}
          >
            {statusInfo.label}
          </span>
        </div>

        <p className="text-xs text-gray-600 dark:text-gray-300 truncate">
          {materialTitle}
        </p>

        <div className="flex items-center justify-between gap-2 text-xs text-gray-500 dark:text-gray-400">
          <span>{booking.tonnesT} tonnes</span>
          <span>{dateFormatted}</span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main BookingsDeliveries Component                                   */
/* ------------------------------------------------------------------ */

export default function BookingsDeliveries() {
  const { dataset } = useGreenLoopStore();
  const { user } = useAuth();
  const activeWorkspace = user?.activeWorkspace;
  const reduceMotion = useReducedMotion();
  const navigate = useNavigate();
  const { orderId } = useParams<{ orderId?: string }>();
  const [searchParams] = useSearchParams();
  const urlBookingId = orderId || searchParams.get("booking") || searchParams.get("order") || null;

  const [activeTab, setActiveTab] = useState<OrderTab>("ALL");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(urlBookingId);
  const [prevUrlBookingId, setPrevUrlBookingId] = useState<string | null>(urlBookingId);
  const [showListSearch, setShowListSearch] = useState(false);

  if (urlBookingId !== prevUrlBookingId) {
    setPrevUrlBookingId(urlBookingId);
    if (urlBookingId) {
      setSelectedId(urlBookingId);
      setActiveTab("ALL");
    } else {
      setSelectedId(null);
    }
  }

  const bookingsWithMeta = useMemo<BookingFacts[]>(() => {
    return dataset.bookings.map((booking) => {
      const material = dataset.materials.find((m) => m.id === booking.materialId);
      const verification = dataset.verifications.find((v) => v.bookingId === booking.id);
      const events = dataset.events.filter((e) => e.subjectIds.includes(booking.id));
      const dispatched = Boolean(booking.loadRef || events.some((e) => e.kind === "load.dispatched"));
      const classified = classifyBooking(
        booking,
        verification?.status === "verified",
        verification?.status as string | undefined,
        dispatched
      );
      return { booking, material, verification, dispatched, ...classified };
    });
  }, [dataset.bookings, dataset.materials, dataset.verifications, dataset.events]);

  const awaitingOffers = useMemo(() => acceptedOffersAwaitingBooking(dataset), [dataset]);
  const visibleAwaitingOffers = awaitingOffers.filter((offer) => {
    if (activeTab !== "ALL" && activeTab !== "ACTIVE") return false;
    const material = dataset.materials.find((item) => item.id === offer.passportId);
    const demand = dataset.demands.find((item) => item.id === offer.demandId);
    return `${material?.type ?? demand?.materialType ?? ""} ${offer.id} ${offer.passportId} ${offer.providerId}`
      .toLowerCase()
      .includes(search.trim().toLowerCase());
  });

  const counts = useMemo(() => {
    const map: Record<OrderTab, number> = {
      ALL: bookingsWithMeta.length + awaitingOffers.length,
      ACTIVE: awaitingOffers.length,
      SCHEDULED: 0,
      IN_TRANSIT: 0,
      COMPLETED: 0,
    };
    for (const item of bookingsWithMeta) map[item.tab] += 1;
    return map;
  }, [bookingsWithMeta, awaitingOffers]);

  const visibleBookings = useMemo(() => {
    return bookingsWithMeta
      .filter(({ booking, material }) => {
        const query = search.trim().toLowerCase();
        if (!query) return true;
        const providerListing = dataset.providerListings?.find((l) => l.materialId === booking.materialId);
        return `${material?.type ?? ""} ${booking.id} ${material?.id ?? ""} ${providerListing?.organization ?? ""} ${providerListing?.providerName ?? ""}`
          .toLowerCase()
          .includes(query);
      })
      .filter(({ tab }) => activeTab === "ALL" || tab === activeTab)
      .sort((a, b) => b.booking.createdAt.localeCompare(a.booking.createdAt));
  }, [bookingsWithMeta, activeTab, search, dataset.providerListings]);

  const activeCount = counts.ACTIVE + counts.SCHEDULED + counts.IN_TRANSIT;
  const selectedFacts = selectedId
    ? bookingsWithMeta.find(
        ({ booking }) =>
          booking.id === selectedId || booking.offerId === selectedId || booking.materialId === selectedId
      )
    : undefined;

  const handleOrderSelect = (id: string) => {
    setSelectedId(id);
    navigate(`/app/orders/${id}`);
  };

  const handleBackToOrders = () => {
    setSelectedId(null);
    navigate("/app/orders");
  };

  return (
    <div className="pb-16 min-h-screen">
      <PageMeta
        title={selectedFacts ? `Order ${selectedFacts.booking.id} | GreenLoop` : "My Orders | GreenLoop"}
        description="Track accepted material transactions from booking through verified delivery."
      />

      {/* ------------------------------------------------------------- */}
      {/* CASE 1: Specific Order Clicked -> Dedicated Details Page       */}
      {/* (Opens ONLY when the user clicks a specific order)             */}
      {/* ------------------------------------------------------------- */}
      {selectedFacts ? (
        <div className="mx-auto max-w-[1600px] px-4 pt-6 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row items-start gap-6">
            {/* Left Column: My Orders List (Sidebar matching reference screenshot) */}
            <div className="hidden lg:block w-80 xl:w-88 shrink-0 space-y-3.5 sticky top-20">
              <div className="flex items-center justify-between pb-1">
                <h2 className="font-archivo text-xl font-bold text-gray-900 dark:text-white">
                  My Orders
                </h2>
                <button
                  type="button"
                  onClick={() => setShowListSearch(!showListSearch)}
                  className="flex size-9 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-steel-800 dark:bg-[#16271e] dark:text-gray-300 shadow-2xs transition"
                  title="Search orders"
                >
                  <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                </button>
              </div>

              {showListSearch && (
                <div className="relative">
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search orders…"
                    autoFocus
                    className="h-9 w-full rounded-xl border border-gray-200 bg-white px-3 text-xs text-gray-900 outline-none transition focus:border-emerald-600 dark:border-steel-700 dark:bg-[#122319] dark:text-white"
                  />
                </div>
              )}

              <div className="flex flex-col gap-3 max-h-[calc(100vh-140px)] overflow-y-auto pe-1">
                {visibleBookings.map((facts) => {
                  const isSelected = selectedFacts.booking.id === facts.booking.id;
                  return (
                    <OrderCompactSummaryCard
                      key={facts.booking.id}
                      facts={facts}
                      isSelected={isSelected}
                      onClick={() => handleOrderSelect(facts.booking.id)}
                    />
                  );
                })}
              </div>
            </div>

            {/* Right Column: Dedicated Order Details (Progress Tracker, Payment, Actions) */}
            <div className="min-w-0 flex-1 w-full">
              <OrderDedicatedDetails
                booking={selectedFacts.booking}
                onBackToOrders={handleBackToOrders}
              />
            </div>
          </div>
        </div>
      ) : (
        /* ----------------------------------------------------------- */
        /* CASE 2: Main Orders Page -> Compact Summary Cards Only      */
        /* ----------------------------------------------------------- */
        <>
          {/* Cinematic Hero */}
          <section className="relative isolate" aria-labelledby="my-orders-title">
            <div className="relative h-[250px] overflow-hidden sm:h-[280px] lg:h-[300px]">
              <img
                src={ambientMedia.authTruck.src}
                alt={ambientMedia.authTruck.alt}
                className={`absolute inset-0 size-full object-cover ${reduceMotion ? "" : "motion-safe:animate-gl-hero-zoom"}`}
              />
              <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-r from-[#0a1c10]/85 via-[#0a1c10]/60 to-[#0a1c10]/15" />
              <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-[#f6f5f0] to-transparent dark:from-[#101913]" />

              <motion.div
                className="relative z-10 mx-auto flex h-full w-full max-w-[1600px] flex-col justify-center px-5 pt-12 sm:px-9 lg:px-12 xl:px-16"
                initial={reduceMotion ? false : { opacity: 0, y: 22 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: EASE }}
              >
                <p className="w-fit rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#d8e5d9] backdrop-blur-sm sm:text-xs">
                  {activeWorkspace === "receiver" ? "Receiver Workspace" : "Operations"}
                </p>
                <h1 id="my-orders-title" className="mt-3 font-archivo text-3xl font-bold tracking-tight text-white drop-shadow-sm sm:text-4xl lg:text-5xl">
                  My <span className="text-[#6ee584]">Orders</span>
                </h1>

                <dl className="mt-5 flex flex-wrap items-center gap-x-8 gap-y-3">
                  {([
                    { kind: "orders", value: counts.ALL.toLocaleString("en-IN"), label: "Total orders" },
                    { kind: "active", value: activeCount.toLocaleString("en-IN"), label: "Active" },
                    { kind: "completed", value: counts.COMPLETED.toLocaleString("en-IN"), label: "Completed" },
                  ] as const).map((stat) => (
                    <div key={stat.label} className="flex items-center gap-2.5">
                      <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10 text-[#b9d8bf]">
                        <HeroStatIcon kind={stat.kind} />
                      </span>
                      <div>
                        <dd className="ledger-numeral font-archivo text-base font-bold leading-5 text-white">{stat.value}</dd>
                        <dt className="text-xs leading-4 text-white/70">{stat.label}</dt>
                      </div>
                    </div>
                  ))}
                </dl>
              </motion.div>
            </div>
          </section>

          {/* Filter Tabs + Search + Compact Cards Grid */}
          <div className="mx-auto max-w-[1600px] px-4 pt-6 sm:px-6 lg:px-8">
            <div className="mb-6 flex flex-wrap items-center gap-2">
              {TABS.map((tab) => {
                const active = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setActiveTab(tab.key)}
                    className={cn(
                      "flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-all duration-200 hover:-translate-y-px",
                      active
                        ? "border-[#315b3c] bg-[#0f2d1c] text-white shadow-[0_4px_12px_rgba(15,45,28,0.28)] dark:border-[#527e5c] dark:bg-[#2c4233]"
                        : "border-[#e3e3d9] bg-white/85 text-[#4f5b51] hover:border-[#b9c8ba] hover:bg-[#f1f5ef] hover:text-[#315c3d] dark:border-steel-700 dark:bg-[#17251d] dark:text-gray-300 dark:hover:bg-[#2c4233]/50 dark:hover:text-white"
                    )}
                  >
                    {tab.label}
                    <span className={cn("ledger-numeral rounded-full px-1.5 py-0.5 text-xs", active ? "bg-white/15 text-[#cfe6d3]" : "bg-[#eef2ec] text-[#5c6a5f] dark:bg-white/10 dark:text-gray-300")}>
                      {counts[tab.key]}
                    </span>
                  </button>
                );
              })}

              <label className="relative ms-auto hidden min-w-0 sm:block sm:w-60 lg:w-72">
                <span className="sr-only">Search orders</span>
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-steel-400">
                  <circle cx="10.8" cy="10.8" r="6.8" />
                  <path d="m16 16 4.2 4.2" />
                </svg>
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search orders…"
                  className="h-10 w-full rounded-full border border-[#e3e3d9] bg-white/85 ps-9 pe-3 text-sm text-ink-900 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15 dark:border-steel-700 dark:bg-[#17251d] dark:text-white"
                />
              </label>
            </div>

            {/* Compact Order Summary Cards Grid */}
            {visibleBookings.length === 0 && visibleAwaitingOffers.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-steel-300 bg-white/60 px-6 py-16 text-center dark:border-steel-700 dark:bg-white/[0.02]">
                <h2 className="font-archivo text-lg font-bold text-ink-900 dark:text-white">
                  {counts.ALL ? "No orders match this view" : "No orders yet"}
                </h2>
                <p className="mt-2 text-sm text-steel-600 dark:text-gray-400">
                  {counts.ALL ? "Try a different tab or clear the search." : "Accepted material transactions will appear here once a booking is confirmed."}
                </p>
              </div>
            ) : (
              <motion.div
                aria-label="Orders list"
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
                initial={reduceMotion ? false : "hidden"}
                animate="show"
                variants={{ hidden: {}, show: { transition: { staggerChildren: 0.04 } } }}
              >
                {visibleAwaitingOffers.map((offer) => (
                  <AwaitingScheduleCard key={offer.id} offer={offer} receiverWorkspace={activeWorkspace === "receiver"} />
                ))}
                {visibleBookings.map((facts) => (
                  <OrderCompactSummaryCard
                    key={facts.booking.id}
                    facts={facts}
                    onClick={() => handleOrderSelect(facts.booking.id)}
                  />
                ))}
              </motion.div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

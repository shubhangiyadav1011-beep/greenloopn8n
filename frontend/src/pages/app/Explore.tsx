import PageMeta from "@/components/common/PageMeta";
import { useGreeting } from "@/components/greenloop/AppExploration.helpers";
import { PageMotion, RevealItem } from "@/components/greenloop/kit";
import { ambientMedia, materialMediaFor } from "@/config/appMedia";
import { useAuth } from "@/context/AuthContext.helpers";
import { BoxMoving, CheckCircleIcon, TaskIcon, TruckDelivery } from "@/icons";
import { useGreenLoopStore } from "@/store/GreenLoopStore.helpers";
import { motion, useReducedMotion } from "motion/react";
import { type ReactNode } from "react";
import { Link } from "react-router";

type HomeCard = {
  title: string;
  description: string;
  action: string;
  to: string;
  image: { src: string; alt: string };
};

function ActivityCard({ icon, label, value, detail, to, image }: { icon: ReactNode; label: string; value: string; detail: string; to: string; image: HomeCard["image"] }) {
  return (
    <Link to={to} className="group relative isolate flex min-h-[58px] min-w-0 items-center gap-2 overflow-hidden rounded-xl border border-white/75 bg-[#e9ede6] p-2 shadow-[0_12px_32px_rgba(10,35,22,0.18)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_18px_38px_rgba(10,35,22,0.28)] dark:border-white/10 dark:bg-[#17241b] sm:gap-2.5 sm:p-2.5">
      <img src={image.src} alt="" aria-hidden="true" loading="lazy" className="absolute inset-0 z-0 size-full object-cover transition-transform duration-700 group-hover:scale-105" />
      <span className="pointer-events-none absolute inset-y-0 start-0 z-[1] w-[62%] bg-gradient-to-r from-[#f4f7ef]/85 via-[#f4f7ef]/55 to-transparent dark:from-[#17241b]/85 dark:via-[#17241b]/55 dark:to-transparent" aria-hidden="true" />
      <span className="relative z-10 flex size-8 shrink-0 items-center justify-center rounded-lg border border-white/90 bg-white text-[#16733d] shadow-sm dark:border-white/15 dark:bg-[#263c2e] dark:text-[#a6c7ad]" aria-hidden="true">{icon}</span>
      <span className="relative z-10 min-w-0">
        <span className="block font-archivo text-lg font-bold leading-5 tracking-tight text-[#14271a] drop-shadow-[0_1px_1px_rgba(255,255,255,.85)] dark:text-white dark:drop-shadow-[0_1px_2px_rgba(0,0,0,.65)] sm:text-xl">{value}</span>
        <span className="block truncate text-[9px] font-bold leading-3 text-[#263b2c] drop-shadow-[0_1px_1px_rgba(255,255,255,.8)] dark:text-[#f0f4ef] dark:drop-shadow-[0_1px_2px_rgba(0,0,0,.65)] sm:text-[10px]">{label}</span>
        <span className="mt-0.5 block truncate text-[8px] font-semibold leading-3 text-[#28613c] drop-shadow-[0_1px_1px_rgba(255,255,255,.8)] transition-colors group-hover:text-[#174b2c] dark:text-[#b9d9bf] dark:drop-shadow-[0_1px_2px_rgba(0,0,0,.65)] sm:text-[9px]">{detail}</span>
      </span>
      <span className="absolute bottom-2 end-2 z-10 flex size-7 items-center justify-center rounded-full border border-white/90 bg-white/95 text-sm text-[#263b2c] shadow-sm transition-transform group-hover:translate-x-0.5 dark:border-white/20 dark:bg-[#15251b] dark:text-white" aria-hidden="true">→</span>
    </Link>
  );
}

function ShortcutCard({ title, description, action, to, image }: HomeCard) {
  return (
    <Link to={to} className="group flex min-w-0 flex-col overflow-hidden rounded-xl border border-[#ebe9e1] bg-white shadow-[0_8px_20px_rgba(32,46,34,0.05)] transition duration-300 hover:-translate-y-0.5 hover:border-[#8db69a] hover:shadow-[0_14px_28px_rgba(32,46,34,0.11)] dark:border-white/10 dark:bg-[#17241b]">
      <div className="relative aspect-[2.15/1] max-h-20 shrink-0 overflow-hidden bg-[#e5e4dc]">
        <img src={image.src} alt={image.alt} loading="lazy" className="size-full object-cover transition-transform duration-700 group-hover:scale-105 motion-reduce:transform-none" />
        <span className="absolute inset-0 bg-gradient-to-t from-[#101d14]/35 via-transparent to-transparent" aria-hidden="true" />
      </div>
      <div className="relative min-h-[92px] flex-1 p-2.5">
        <span className="block min-w-0 pe-1">
          <h3 className="font-archivo text-[13px] font-bold leading-4 text-[#243229] dark:text-white">{title}</h3>
          <p className="mt-1 line-clamp-2 text-[10px] leading-[1.35] text-[#667168] dark:text-gray-300">{description}</p>
          <span className="mt-1.5 block pe-7 text-[10px] font-semibold leading-4 text-[#477e5d] dark:text-[#a6c7ad]">{action}</span>
        </span>
        <span className="absolute bottom-2.5 end-2.5 flex size-6 items-center justify-center rounded-full border border-[#cbd2ca] bg-white/90 text-xs text-[#263b2c] transition duration-300 group-hover:border-[#4b8b67] group-hover:bg-[#e8f2e9] group-hover:translate-x-0.5 dark:border-white/20 dark:bg-[#17241b] dark:text-white" aria-hidden="true">→</span>
      </div>
    </Link>
  );
}

export default function Explore() {
  const { dataset } = useGreenLoopStore();
  const { user } = useAuth();
  const greeting = useGreeting();
  const firstName = user?.name?.trim().split(/\s+/)[0];
  const activeAllocations = dataset.allocations.filter((allocation) => allocation.status !== "cancelled");
  const activeListings = dataset.materials.filter((material) => material.status !== "verified" && material.status !== "cancelled" && material.status !== "dispatched").length;
  const pendingMatches = dataset.materials.filter((material) =>
    material.status !== "verified" && material.status !== "dispatched" &&
    !activeAllocations.some((allocation) => allocation.materialId === material.id),
  ).length;
  const activeTransactions = dataset.bookings.filter((booking) => booking.status !== "cancelled").length;
  const materialReusedT = dataset.verifications
    .filter((verification) => verification.status === "verified")
    .reduce((total, verification) => total + verification.acceptedT, 0);
  const pendingActions = [
    ...dataset.materials.filter((material) => !activeAllocations.some((allocation) => allocation.materialId === material.id) && material.status !== "verified" && material.status !== "dispatched").map((material) => ({ id: material.id, label: `${material.quantityT.toFixed(1)} t ${material.type} is ready to offer`, to: "/app/market-demand" })),
    ...dataset.bookings.filter((booking) => booking.status === "hold").map((booking) => ({ id: booking.id, label: `${booking.tonnesT.toFixed(1)} t request is waiting on capacity`, to: "/app/bookings" })),
    ...dataset.bookings.filter((booking) => booking.status === "confirmed" && booking.receiverAcceptedAt && !booking.loadRef).map((booking) => ({ id: `dispatch-${booking.id}`, label: `${booking.tonnesT.toFixed(1)} t booking is ready to dispatch`, to: "/app/deliveries" })),
  ].slice(0, 5);
  const reduceMotion = useReducedMotion();
  const verifiedRecords = dataset.verifications
    .filter((verification) => verification.status === "verified")
    .sort((left, right) => (left.verifiedAt ?? "").localeCompare(right.verifiedAt ?? ""))
    .slice(-6);
  const maxVerifiedT = Math.max(0, ...verifiedRecords.map((record) => record.acceptedT));

  const shortcuts: HomeCard[] = [
    { title: "Materials", description: "Manage your listings and available materials.", action: "View materials", to: "/app/materials", image: materialMediaFor("brick") },
    { title: "Bookings", description: "Review active requests, confirmations, and transaction status.", action: "View bookings", to: "/app/bookings", image: ambientMedia.authTruck },
    { title: "Impact", description: "See the recovery recorded across your workspace.", action: "View impact", to: "/app/dashboard", image: ambientMedia.inspectionWorker },
    { title: "Recent Activity", description: "Review the latest recorded project events.", action: "View activity", to: "/app/audit-trail", image: ambientMedia.sortingFacility },
  ];

  return (
    <PageMotion className="provider-home">
      <PageMeta title="Home | GreenLoop" description="Offer recovered construction materials and track their journey through GreenLoop." />

      <section
        className="provider-home-hero relative isolate flex min-h-[520px] flex-col overflow-hidden bg-[#102218] text-white sm:min-h-[500px] lg:min-h-[480px]"
        aria-labelledby="provider-home-title"
      >
        <motion.video
          className="absolute inset-0 -z-20 size-full object-cover"
          src="/videos/provider-home-recovery.mp4"
          poster={ambientMedia.surveyHero.src}
          autoPlay={!reduceMotion}
          muted
          loop
          playsInline
          preload="metadata"
          aria-hidden="true"
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#07150c]/90 via-[#0b1d12]/65 to-[#111b12]/10" aria-hidden="true" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-[#08170d]/95 via-transparent to-[#07120b]/25" aria-hidden="true" />
        <div className="relative z-10 mx-auto flex w-full max-w-[1600px] flex-col px-5 pb-4 pt-20 sm:px-8 sm:pb-5 sm:pt-24 lg:px-10 lg:pb-4 lg:pt-20 xl:px-12">
          <div className="flex flex-col">
            <p className="flex items-center gap-2 text-lg font-bold leading-6 text-white sm:text-xl">
              <span className="flex size-6 items-center justify-center rounded-full bg-[#65df81] text-[#0c3319]" aria-hidden="true">↻</span>
              {greeting}{firstName ? `, ${firstName}` : ""}.
            </p>
            <h1 id="provider-home-title" className="mt-2.5 max-w-[720px] font-archivo text-[clamp(2rem,3.5vw,3rem)] font-bold leading-[1.04] tracking-[-0.04em] [overflow-wrap:normal] text-white drop-shadow-[0_4px_20px_rgba(0,0,0,.32)]">
              Turning construction waste{" "}
              <span className="text-[#75e98b]">into opportunities.</span>
            </h1>
            <Link to="/app/materials/new" className="mt-3 inline-flex min-h-9 w-fit items-center gap-2 rounded-xl border border-[#8bf1a0]/45 bg-[#1f8e4e] px-5 text-sm font-bold text-white shadow-[0_10px_30px_rgba(4,50,21,.32)] transition duration-300 hover:-translate-y-0.5 hover:bg-[#26a65a] hover:shadow-[0_14px_34px_rgba(4,50,21,.42)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8bf1a0]">
              Offer Material <span aria-hidden="true">→</span>
            </Link>

            <div className="mt-3 grid max-w-4xl grid-cols-2 gap-x-4 gap-y-2 border-t border-white/20 pt-2.5 sm:grid-cols-4 sm:gap-5">
              {[
                { icon: <BoxMoving className="size-5" />, title: "Find Materials", detail: "From verified providers", to: "/app/receiver/providers" },
                { icon: <TaskIcon className="size-5" />, title: "Manage Demands", detail: "For your projects", to: "/app/receiver/demand" },
                { icon: <TruckDelivery className="size-5" />, title: "Track Orders", detail: "End-to-end visibility", to: "/app/bookings" },
                { icon: <CheckCircleIcon className="size-5" />, title: "Recover Value", detail: "For a greener future", to: "/app/materials/new" },
              ].map((item) => (
                <Link key={item.title} to={item.to} className="group/item flex min-w-0 items-center gap-2.5 transition hover:translate-x-0.5">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-[#77ed8d] bg-[#07371d]/55 text-[#83f397] shadow-[0_0_22px_rgba(90,243,125,.18)] group-hover/item:bg-[#0f4e2b] transition-colors">{item.icon}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-bold text-white sm:text-sm group-hover/item:text-[#75e98b] transition-colors">{item.title}</span>
                    <span className="mt-0.5 block truncate text-[10px] text-white/65 sm:text-xs">{item.detail}</span>
                  </span>
                </Link>
              ))}
            </div>
          </div>
          <section aria-label="Provider activity" className="relative z-10 mt-5">
            <div className="mb-1 flex justify-end px-1">
              <Link to="/app/dashboard" className="text-[9px] font-semibold text-white/80 underline decoration-white/35 underline-offset-4 transition hover:text-[#8bf1a0] sm:text-[10px]">View dashboard <span aria-hidden="true">→</span></Link>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-2 lg:grid-cols-5 lg:gap-2">
              <ActivityCard icon={<BoxMoving className="size-4" />} label="Active Listings" value={String(activeListings)} detail="View listings" to="/app/materials" image={ambientMedia.brickPallets} />
              <ActivityCard icon={<TaskIcon className="size-4" />} label="Pending Matches" value={String(pendingMatches)} detail="Find a receiver" to="/app/market-demand?view=receivers" image={ambientMedia.authYard} />
              <ActivityCard icon={<TruckDelivery className="size-4" />} label="Active Transactions" value={String(activeTransactions)} detail="Review bookings" to="/app/bookings" image={ambientMedia.authTruck} />
              <ActivityCard icon={<CheckCircleIcon className="size-4" />} label="Material Reused" value={`${materialReusedT.toFixed(1)} t`} detail="View impact" to="/app/dashboard" image={ambientMedia.surveyHero} />
              <Link to="/app/dashboard" className="group relative flex min-h-[58px] min-w-0 items-center justify-between gap-2 overflow-hidden rounded-xl border border-[#78db8d]/45 bg-[#0c2918]/90 p-2 text-white shadow-[0_12px_32px_rgba(4,26,13,.24)] backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-[#94f2a6] hover:bg-[#10351e]/95 sm:p-2.5">
                <span className="relative z-10 min-w-0">
                  <span className="block text-[8px] font-bold uppercase tracking-[0.14em] text-white/65">Your Impact</span>
                  <span className="mt-0.5 block truncate font-archivo text-base font-bold tracking-tight sm:text-lg">{materialReusedT.toFixed(1)} tonnes</span>
                  <span className="block text-[8px] text-white/70">Material recovered</span>
                  <span className="mt-0.5 block truncate text-[8px] font-semibold text-[#8cf19e]">Keep making a difference <span aria-hidden="true">→</span></span>
                </span>
                <span className="flex h-8 shrink-0 items-end gap-1 opacity-90" aria-label={`${verifiedRecords.length} verified material recovery records`}>
                  {Array.from({ length: 6 }, (_, index) => {
                    const record = verifiedRecords[index];
                    const height = record && maxVerifiedT > 0
                      ? Math.max(7, Math.round((record.acceptedT / maxVerifiedT) * 28))
                      : 7;
                    return <span key={record?.id ?? `empty-${index}`} className="w-1 rounded-t-sm bg-gradient-to-t from-[#32a852] to-[#9af5a4]" style={{ height: `${height}px` }} />;
                  })}
                </span>
              </Link>
            </div>
          </section>
        </div>

      </section>

      <section className="bg-[#f7f5ef] px-4 py-4 text-[#202c23] dark:bg-[#101913] dark:text-white sm:px-7 sm:py-5 xl:px-10">
        <div className="mx-auto grid max-w-[1600px] items-start gap-4 xl:grid-cols-[minmax(0,1fr)_210px]">
          <RevealItem>
            <section aria-labelledby="provider-shortcuts-title">
              <div className="mb-2.5 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h2 id="provider-shortcuts-title" className="font-archivo text-lg font-bold leading-6 text-[#243229] dark:text-white sm:text-xl">Explore GreenLoop</h2>
                  <p className="mt-0.5 text-[10px] leading-4 text-[#748078] dark:text-gray-400 sm:text-xs">Quick ways to offer material and follow its journey.</p>
                </div>
                <Link to="/app/audit-trail" className="text-[10px] font-semibold text-[#477e5d] underline underline-offset-4 dark:text-[#a6c7ad] sm:text-xs">View all <span aria-hidden="true">→</span></Link>
              </div>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,130px),1fr))] gap-2.5">
                {shortcuts.map((shortcut) => <ShortcutCard key={shortcut.title} {...shortcut} />)}
              </div>
            </section>
          </RevealItem>

          <RevealItem className="xl:mt-[53px]">
            <section aria-labelledby="provider-pending-title" className="flex min-h-[172px] flex-col overflow-hidden rounded-xl border border-[#dce8dc] bg-[#edf4e8] shadow-[0_8px_20px_rgba(32,46,34,0.05)] dark:border-white/10 dark:bg-[#172d1d]">
              <div className="flex min-h-10 items-center justify-between gap-2 border-b border-[#d6e3d3] bg-[#e5f0e2] px-3 py-2 dark:border-white/10 dark:bg-[#203a28]">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-[#d5e6d3] bg-white text-[#16733d] shadow-sm dark:border-white/10 dark:bg-[#172d1d] dark:text-[#a6c7ad]" aria-hidden="true">◷</span>
                  <h2 id="provider-pending-title" className="truncate font-archivo text-xs font-bold text-[#1b3021] dark:text-white">Pending Actions</h2>
                  <p className="shrink-0 text-[10px] font-semibold text-[#536559] dark:text-gray-300">({pendingActions.length})</p>
                </div>
                <span className="shrink-0 text-sm font-semibold text-[#35443a] dark:text-gray-200" aria-label={`${pendingActions.length} pending actions`}>→</span>
              </div>
              {pendingActions.length ? (
                <ul className="relative z-10 grid flex-1 content-start gap-2 p-3">
                  {pendingActions.map((action) => (
                    <li key={action.id} className="flex items-start justify-between gap-3 rounded-xl border border-white/80 bg-white/65 px-3 py-3 transition hover:border-[#b2cfb4] hover:bg-white dark:border-white/5 dark:bg-white/[0.035] dark:hover:bg-white/[0.07]">
                      <span className="text-xs font-medium leading-5 text-[#35443a] dark:text-gray-200">{action.label}</span>
                      <Link to={action.to} className="shrink-0 text-[11px] font-semibold text-[#477e5d] underline underline-offset-2 dark:text-[#a6c7ad]">Review</Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center px-3 py-3 text-center">
                  <span className="flex size-6 items-center justify-center rounded-full bg-white/80 text-sm font-bold text-[#31a66a] shadow-sm dark:bg-white/10" aria-hidden="true">✓</span>
                  <p className="mt-1.5 text-[11px] font-bold text-[#35443a] dark:text-white">You’re all caught up!</p>
                  <p className="mt-1 max-w-[190px] text-[10px] leading-4 text-[#59685d] dark:text-gray-200">New tasks will appear here when a record needs attention.</p>
                </div>
              )}
            </section>
          </RevealItem>
        </div>

      </section>
    </PageMotion>
  );
}

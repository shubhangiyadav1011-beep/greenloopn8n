import { useState } from "react";
import { Link, useParams } from "react-router";
import PageMeta from "@/components/common/PageMeta";
import DirectMaterialRequest from "@/components/greenloop/DirectMaterialRequest";
import ReceiverCheckoutModal from "@/components/greenloop/ReceiverCheckoutModal";
import { LocationMap } from "@/components/greenloop/LocationMap";
import { materialMediaFor, ambientMedia } from "@/config/appMedia";
import { useGreenLoopStore } from "@/store/GreenLoopStore.helpers";
import { calculateLandedCost } from "@shared/domain/landedCost";
import LandedCostCard from "@/components/greenloop/LandedCostCard";
import StatusBadge from "@/components/greenloop/StatusBadge";
import { formatDate, formatINR, formatINRPerT, isReusableAsset, materialTypeLabel } from "@/utils";
import { useAuth } from "@/context/AuthContext.helpers";

export default function ProviderMaterialDetails() {
  const { materialId } = useParams<{ materialId: string }>();
  const { dataset } = useGreenLoopStore();
  const { user } = useAuth();
  const [isOrderNowOpen, setIsOrderNowOpen] = useState(false);
  const [activePhotoIdx, setActivePhotoIdx] = useState(0);

  const listing = (dataset.providerListings ?? []).find((item) => item.materialId === materialId);
  const contact = dataset.transactionContacts?.find((item) => item.materialId === materialId);
  const passport = dataset.materials.find((item) => item.id === materialId);

  const landedCalculation = listing ? calculateLandedCost({
    materialType: listing.materialType,
    quantityT: listing.availableT,
    pricePerT: listing.pricePerT,
    materialId: listing.materialId,
    destination: listing.location,
  }) : null;

  if (!listing) {
    return (
      <main className="mx-auto max-w-3xl py-16 text-center">
        <PageMeta title="Material unavailable | GreenLoop" description="This provider material is no longer available." />
        <h1 className="font-archivo text-2xl font-bold text-ink-900 dark:text-white">Material unavailable</h1>
        <p className="mt-2 text-sm text-steel-600 dark:text-gray-400">The listing may have been fully committed or removed.</p>
        <Link to="/app/receiver/providers" className="mt-4 inline-flex text-sm font-semibold text-loop-700 underline dark:text-loop-300">
          Back to Provider Directory
        </Link>
      </main>
    );
  }

  const primaryMedia = materialMediaFor(listing.materialType);
  const galleryPhotos = [
    { label: "Main Lot Overview", src: primaryMedia.src, alt: primaryMedia.alt },
    { label: "Section & Profile Inspection", src: ambientMedia.brickPallets.src, alt: "Lot section view" },
    { label: "Storage Depot Yard", src: ambientMedia.authYard.src, alt: "Depot staging view" },
  ];

  const activePhoto = galleryPhotos[activePhotoIdx] || galleryPhotos[0];
  const isReusable = passport ? isReusableAsset(passport) : (listing.condition === "good" && listing.grade === "A");
  const canDirectOrder = listing.pricePerT !== undefined && listing.pricePerT > 0 && listing.availableT >= 1;

  const isCertStandard = listing.materialType === "steel"
    ? "IS 2062 Grade E250 (Tensile & Bend Tested)"
    : listing.materialType === "concrete"
    ? "IS 516 / IS 456 (Compressive Tested)"
    : listing.materialType === "brick"
    ? "IS 1077 (Class 10 Certified)"
    : listing.materialType === "timber"
    ? "IS 3629 (Structural Graded)"
    : "IS Standard Commercial Grade";

  const isCertShortBadge = listing.materialType === "steel"
    ? "IS 2062 Lab Certified"
    : listing.materialType === "concrete"
    ? "IS 516 Lab Tested"
    : listing.materialType === "brick"
    ? "IS 1077 Quality Assured"
    : listing.materialType === "timber"
    ? "IS 3629 Graded"
    : "IS Standard Verified";

  return (
    <main className="mx-auto max-w-[1400px] px-4 pb-20 pt-4 sm:px-6 lg:px-8">
      <PageMeta
        title={`${listing.name || materialTypeLabel(listing.materialType)} from ${listing.organization} | GreenLoop`}
        description="Review reusable asset specifications, NABL certified evidence, landed costs, and order directly or request terms."
      />

      {/* Breadcrumb Navigation */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 text-xs text-steel-500 dark:text-steel-400">
        <div className="flex items-center gap-2">
          <Link
            to="/app/receiver/providers"
            className="font-semibold text-loop-700 hover:text-loop-800 dark:text-[#B7F34A] underline"
          >
            ← Back to Material Discovery
          </Link>
          <span>/</span>
          <span className="capitalize">{listing.materialType}</span>
          <span>/</span>
          <span className="font-mono text-ink-900 dark:text-white">{listing.materialId}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-steel-100 dark:bg-steel-800 px-2.5 py-1 text-[11px] font-medium text-steel-700 dark:text-steel-300">
            📍 Project Destination: {user?.location || "Pune Metro Corridors"}
          </span>
        </div>
      </div>

      {/* Main Two-Column Layout (65% Technical Dossier / 35% Sticky Commercial Decision Box) */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 items-start">
        {/* ========================================================= */}
        {/* LEFT COLUMN: Technical Dossier, Evidence & Provenance (7 Cols) */}
        {/* ========================================================= */}
        <section className="lg:col-span-7 space-y-6">
          {/* 1. Interactive Inspection Photo Gallery */}
          <div className="overflow-hidden rounded-3xl border border-steel-200 bg-white shadow-sm dark:border-steel-800 dark:bg-[#121f16]">
            <div className="relative h-80 w-full overflow-hidden sm:h-96">
              <img
                src={activePhoto.src}
                alt={activePhoto.alt}
                className="size-full object-cover transition duration-300"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

              <div className="absolute bottom-4 left-4 right-4 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-white/95 px-3 py-1 font-mono text-xs font-bold text-[#14301d] shadow-sm">
                    {listing.materialId}
                  </span>
                  <StatusBadge status={listing.verificationStatus ?? passport?.verificationStatus ?? "unverified"} />
                  {isReusable && (
                    <span className="rounded-full bg-[#00e599] px-3 py-1 text-xs font-bold text-[#0c1811] shadow-sm">
                      ♻ Reusable Asset
                    </span>
                  )}
                  <span className="rounded-full bg-black/60 backdrop-blur-md px-3 py-1 text-xs font-semibold text-white">
                    {isCertShortBadge}
                  </span>
                </div>
                <span className="rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-medium text-white/90">
                  {activePhoto.label}
                </span>
              </div>
            </div>

            {/* Gallery Thumbnail Selector Strip */}
            <div className="flex items-center gap-3 border-t border-steel-100 bg-[#fbfaf8] p-3 dark:border-steel-800 dark:bg-[#16271c]">
              {galleryPhotos.map((photo, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setActivePhotoIdx(idx)}
                  className={`flex items-center gap-2 rounded-xl border p-1.5 transition text-start ${
                    activePhotoIdx === idx
                      ? "border-[#16733d] bg-white shadow-sm dark:border-[#B7F34A] dark:bg-[#1f3727]"
                      : "border-transparent hover:border-steel-300 dark:hover:border-steel-700"
                  }`}
                >
                  <img
                    src={photo.src}
                    alt=""
                    className="size-11 rounded-lg object-cover"
                  />
                  <div className="hidden sm:block">
                    <p className="text-[11px] font-bold text-ink-900 dark:text-white leading-tight">{photo.label}</p>
                    <p className="text-[10px] text-steel-500 dark:text-steel-400">Verified Inspection</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* 2. Technical Title & Asset Overview */}
          <div className="rounded-3xl border border-steel-200 bg-white p-6 shadow-sm dark:border-steel-800 dark:bg-[#152319]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-loop-700 dark:text-[#B7F34A]">
                {listing.organization} · Origin Lot
              </span>
              <span className="text-xs text-steel-500 dark:text-steel-400">
                Project: {listing.projectName} ({listing.projectLocation})
              </span>
            </div>

            <h1 className="mt-2 font-archivo text-2xl font-bold text-ink-900 dark:text-white sm:text-3xl">
              {listing.name || `${materialTypeLabel(listing.materialType)} Lots`}
            </h1>
            {listing.dimensions && (
              <p className="mt-1 font-mono text-sm text-[#4b6151] dark:text-steel-300">
                Specifications: {listing.dimensions}
              </p>
            )}

            {/* Fact Grid */}
            <dl className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3 border-y border-steel-100 py-4 text-xs dark:border-steel-800">
              <div>
                <dt className="text-steel-500 dark:text-steel-400 font-medium">Standard Compliance</dt>
                <dd className="mt-1 font-semibold text-ink-900 dark:text-white">{isCertStandard}</dd>
              </div>
              <div>
                <dt className="text-steel-500 dark:text-steel-400 font-medium">Quality Condition</dt>
                <dd className="mt-1 font-semibold capitalize text-ink-900 dark:text-white">
                  {listing.condition} · Grade {listing.grade}
                </dd>
              </div>
              <div>
                <dt className="text-steel-500 dark:text-steel-400 font-medium">Lot Volume</dt>
                <dd className="mt-1 font-archivo font-bold text-ink-900 dark:text-white">
                  {listing.availableT.toFixed(1)} Tonnes
                </dd>
              </div>
              <div>
                <dt className="text-steel-500 dark:text-steel-400 font-medium">Dispatch Readiness</dt>
                <dd className="mt-1 font-semibold text-ink-900 dark:text-white">
                  {listing.availableFrom ? formatDate(listing.availableFrom) : "Ready Now"}
                </dd>
              </div>
            </dl>

            {listing.surveyNotes && (
              <div className="mt-4 rounded-xl bg-steel-50 p-3.5 text-xs text-steel-700 dark:bg-white/[0.03] dark:text-steel-300">
                <strong className="text-ink-900 dark:text-white">Pre-demolition Site Notes:</strong> {listing.surveyNotes}
              </div>
            )}
          </div>

          {/* 3. Evidence Dossier & NABL Lab Certifications */}
          <div className="rounded-3xl border border-steel-200 bg-white p-6 shadow-sm dark:border-steel-800 dark:bg-[#152319]">
            <div className="flex items-center justify-between border-b border-steel-100 pb-3 dark:border-steel-800">
              <div>
                <h2 className="font-archivo text-base font-bold text-ink-900 dark:text-white">
                  Quality &amp; Evidence Dossier
                </h2>
                <p className="text-xs text-steel-500 dark:text-steel-400">
                  National standard laboratory assays and chartered structural surveyor audits
                </p>
              </div>
              <Link
                to={`/app/materials/${listing.materialId}`}
                className="text-xs font-bold text-loop-700 underline dark:text-[#B7F34A]"
              >
                View Full Material Passport →
              </Link>
            </div>

            {((listing.evidence && listing.evidence.length > 0) || (passport?.evidence && passport.evidence.length > 0)) ? (
              <div className="mt-4 space-y-2.5">
                {(listing.evidence ?? passport?.evidence ?? []).map((ev, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-xl border border-steel-200 bg-steel-50/70 p-3 text-xs dark:border-steel-800 dark:bg-white/[0.02]"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className={`flex size-6 items-center justify-center rounded-full text-xs font-bold ${
                        ev.status === "valid" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : "bg-blue-100 text-blue-800"
                      }`}>
                        {ev.status === "valid" ? "✓" : "📄"}
                      </span>
                      <div>
                        <p className="font-semibold text-ink-900 dark:text-white">{ev.label}</p>
                        <p className="text-[11px] text-steel-500">
                          {ev.kind.replace(/-/g, " ").toUpperCase()} · {formatDate(ev.recordedAt)}
                        </p>
                      </div>
                    </div>
                    {ev.ref && (
                      <span className="rounded bg-white px-2 py-1 font-mono text-[10px] text-steel-600 shadow-xs dark:bg-steel-800 dark:text-steel-300">
                        NABL Accredited
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/60 p-3.5 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
                <p className="font-bold">⚠ Self-Reported Site Estimates</p>
                <p className="mt-0.5">
                  No laboratory assay certificate is on file yet. This material will undergo mandatory facility weighbridge and intake QA testing before final settlement.
                </p>
              </div>
            )}
          </div>

          {/* 4. Landed Cost Transparency & Virgin Benchmark Comparison */}
          {landedCalculation && (
            <div className="rounded-3xl border border-steel-200 bg-white p-6 shadow-sm dark:border-steel-800 dark:bg-[#152319]">
              <h2 className="font-archivo text-base font-bold text-ink-900 dark:text-white">
                Delivered Landed Cost Transparency
              </h2>
              <p className="text-xs text-steel-500 dark:text-steel-400">
                Itemized ex-works rate, road freight, crane handling, and CPWD virgin material benchmark comparison
              </p>

              <div className="mt-4">
                <LandedCostCard
                  calculation={landedCalculation}
                  title="Delivered Cost Economics"
                />
              </div>
            </div>
          )}

          {/* 5. Geographic Origin & Location Map */}
          {listing.geo && (
            <div className="rounded-3xl border border-steel-200 bg-white p-6 shadow-sm dark:border-steel-800 dark:bg-[#152319]">
              <h2 className="font-archivo text-base font-bold text-ink-900 dark:text-white">
                Depot Location &amp; Haulage Origin
              </h2>
              <p className="text-xs text-steel-500 dark:text-steel-400">
                {listing.location} · Origin Project: {listing.projectName}
              </p>
              <LocationMap geo={listing.geo} className="mt-4 h-56 rounded-2xl" />
            </div>
          )}

          {/* 6. Recovery Contingency & Weighbridge Protocol */}
          <div className="rounded-3xl border border-[#bce2c4]/50 bg-gradient-to-br from-[#f4faf5] to-[#ebf6ed] p-6 text-xs text-[#1e4428] dark:border-steel-800 dark:from-[#112317] dark:to-[#0f1d13] dark:text-[#a6d5b0]">
            <h3 className="font-archivo text-sm font-bold uppercase tracking-wider text-[#145025] dark:text-[#8fe0a4]">
              🛡️ Facility Weighbridge Guarantee &amp; Escrow Refund Protocol
            </h3>
            <p className="mt-1 leading-relaxed">
              Every GreenLoop order is backed by automated weighbridge settlement safeguards. When the carrier arrives at your site gate:
            </p>
            <ul className="mt-2.5 space-y-1.5 list-disc list-inside">
              <li><strong>Fractional Acceptance:</strong> You accept conforming tonnes and reject any non-compliant fractions.</li>
              <li><strong>Immediate Refund:</strong> Non-conforming tonnes are instantly credited back to your account from escrow.</li>
              <li><strong>Audit Proof:</strong> Digital Material Passport is updated with verified gross weights and test tickets.</li>
            </ul>
          </div>
        </section>

        {/* ========================================================= */}
        {/* RIGHT COLUMN: Sticky Commercial Buying Decision Box (5 Cols) */}
        {/* ========================================================= */}
        <aside className="lg:col-span-5 lg:sticky lg:top-6 space-y-5">
          <div className="rounded-3xl border border-steel-200 bg-white p-6 shadow-xl dark:border-steel-800 dark:bg-[#121c15]">
            <span className="text-[10px] font-bold uppercase tracking-wider text-loop-700 dark:text-[#B7F34A]">
              Commercial Decision Hub
            </span>

            {/* Price Headline */}
            <div className="mt-2 flex items-baseline justify-between border-b border-steel-100 pb-4 dark:border-steel-800">
              <div>
                <span className="font-archivo text-3xl font-bold text-ink-900 dark:text-white">
                  {listing.pricePerT !== undefined ? formatINRPerT(listing.pricePerT) : "Price on Request"}
                </span>
                <p className="text-xs text-steel-500">Ex-works Depot Rate</p>
              </div>

              {landedCalculation?.reusableLandedCostPerT && (
                <div className="text-end">
                  <span className="font-mono text-sm font-bold text-loop-700 dark:text-[#B7F34A]">
                    {formatINRPerT(landedCalculation.reusableLandedCostPerT)}
                  </span>
                  <p className="text-[10px] text-steel-500">Est. Delivered Landed</p>
                </div>
              )}
            </div>

            {/* Key Commercial Metrics */}
            <div className="mt-4 space-y-2 text-xs">
              <div className="flex justify-between text-steel-600 dark:text-steel-300">
                <span>Available Lot Stock:</span>
                <strong className="font-archivo text-ink-900 dark:text-white">
                  {listing.availableT.toFixed(1)} Tonnes (Ready)
                </strong>
              </div>
              <div className="flex justify-between text-steel-600 dark:text-steel-300">
                <span>Estimated Lot Total:</span>
                <strong className="text-ink-900 dark:text-white font-mono">
                  {listing.pricePerT ? formatINR(listing.availableT * listing.pricePerT) : "Negotiable"}
                </strong>
              </div>
              {landedCalculation?.savingsPercentage !== null && (landedCalculation?.savingsPercentage ?? 0) > 0 && (
                <div className="flex justify-between text-emerald-700 dark:text-emerald-400 font-semibold">
                  <span>Virgin CPWD Benchmark Savings:</span>
                  <span>Save ~{Math.round(landedCalculation?.savingsPercentage ?? 0)}%</span>
                </div>
              )}
              <div className="flex justify-between text-steel-600 dark:text-steel-300">
                <span>Delivery Corridor:</span>
                <span>{listing.location} → {user?.location || "Pune West"}</span>
              </div>
            </div>

            {/* DUAL NEXT ACTIONS: Route A vs Route B */}
            <div className="mt-6 space-y-3 pt-4 border-t border-steel-100 dark:border-steel-800">
              <p className="text-[11px] font-bold uppercase tracking-wider text-steel-500">
                Choose Commercial Route:
              </p>

              {/* ROUTE A: Order Now */}
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3.5 dark:border-emerald-900/50 dark:bg-emerald-950/20">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-emerald-950 dark:text-[#B7F34A]">
                    ⚡ Route A: Order Now
                  </span>
                  <span className="rounded bg-emerald-200/80 px-2 py-0.5 text-[10px] font-bold text-emerald-900 dark:bg-emerald-900/80 dark:text-emerald-200">
                    Instant Booking
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-emerald-900/80 dark:text-emerald-200/80 leading-relaxed">
                  Reserve this lot instantly at published terms with 10% refundable earnest deposit. Certified at your gate weighbridge.
                </p>

                <div className="mt-3">
                  <button
                    type="button"
                    disabled={!canDirectOrder}
                    onClick={() => setIsOrderNowOpen(true)}
                    className="w-full inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#16733d] px-4 text-xs font-bold text-white shadow-md transition hover:bg-[#1f8e4e] disabled:opacity-50 dark:bg-[#00e599] dark:text-[#0c1811] dark:hover:bg-[#34f5b0]"
                  >
                    <span>⚡ Order Now ({listing.availableT.toFixed(1)} t Available)</span>
                  </button>
                </div>
              </div>

              {/* ROUTE B: Request Terms */}
              <div className="rounded-2xl border border-steel-200 bg-steel-50/60 p-3.5 dark:border-steel-800 dark:bg-steel-900/40">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-steel-900 dark:text-white">
                    💬 Route B: Request Terms
                  </span>
                  <span className="text-[10px] font-semibold text-steel-500">
                    Bilateral Proposal
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-steel-600 dark:text-steel-400 leading-relaxed">
                  Negotiate custom tonnage, staged multi-truck dispatch, custom target dates, or mandatory NABL lab re-tests.
                </p>

                <div className="mt-3">
                  <DirectMaterialRequest
                    listing={listing}
                    buttonLabel="Propose Custom Terms →"
                    buttonClassName="w-full inline-flex min-h-10 items-center justify-center rounded-xl border border-steel-300 bg-white px-4 text-xs font-semibold text-steel-800 shadow-sm transition hover:bg-steel-50 dark:border-steel-700 dark:bg-[#17251d] dark:text-steel-200 dark:hover:bg-white/5"
                  />
                </div>
              </div>
            </div>

            {/* Exploration & AI Copilot shortcuts */}
            <div className="mt-4 flex flex-col gap-2 pt-2 text-xs">
              <Link
                to={`/app/receiver/providers?materialType=${encodeURIComponent(listing.materialType)}`}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#315b3c]/30 bg-[#f4f8f5] py-2 text-xs font-bold text-[#234e2c] hover:bg-[#e6f2e9] dark:border-steel-700 dark:bg-[#1c3022] dark:text-[#8fe0a4]"
              >
                Explore Similar Available Materials →
              </Link>
              <Link
                to={`/app/receiver/assistant?materialId=${encodeURIComponent(listing.materialId)}&q=${encodeURIComponent(`Procure ${listing.availableT}t of ${listing.materialType} (${listing.materialId})`)}`}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#B7F34A]/40 bg-[#17251d] py-2 text-xs font-bold text-[#B7F34A] hover:bg-[#1b382b] transition"
              >
                <span className="size-2 rounded-full bg-[#B7F34A] animate-pulse" />
                Procure with AI Copilot →
              </Link>
            </div>

            {/* Confidential Provider Contact Notice */}
            <div className="mt-4 border-t border-steel-100 pt-3 text-[11px] text-steel-500 dark:border-steel-800 dark:text-steel-400">
              {contact ? (
                <div>
                  <p className="font-semibold text-ink-900 dark:text-white">Authorized Provider Contact:</p>
                  <p>{contact.name} ({contact.organization})</p>
                  <p className="text-loop-700 dark:text-loop-300">{contact.email}</p>
                </div>
              ) : (
                <p>🔒 Provider contact details unlock automatically upon booking confirmation.</p>
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* Route A Direct Order Modal */}
      {isOrderNowOpen && (
        <ReceiverCheckoutModal
          isOpen={isOrderNowOpen}
          onClose={() => setIsOrderNowOpen(false)}
          listing={listing}
          defaultQuantityT={Math.min(listing.availableT, 10)}
        />
      )}
    </main>
  );
}

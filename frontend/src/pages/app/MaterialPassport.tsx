/**
 * Material Passport — the digital record for one surveyed material.
 *
 * Provides clear specifications, condition, quantity, provenance,
 * site photos, verified evidence, and verification limitations.
 * Displays indicative landed-cost logistics supported by existing data.
 */

import PageMeta from "@/components/common/PageMeta";
import { materialMedia } from "@/components/greenloop/AppExploration.helpers";
import { CapacityMeter, Counter, EvidenceGallery, MediaPanel, PageMotion, RevealItem, StatusChip, WorkflowRail7 } from "@/components/greenloop/kit";
import { type EvidenceItem } from "@/components/greenloop/kit.helpers";
import { LocationMap } from "@/components/greenloop/LocationMap";
import RecordActions from "@/components/greenloop/RecordActions";
import { materialMediaFor, receiverMediaFor } from "@/config/appMedia";
import { useAuth } from "@/context/AuthContext.helpers";
import { computeMatch, slotLedger } from "@shared/domain/capacity";
import { calculateLandedCost } from "@shared/domain/landedCost";
import LandedCostCard from "@/components/greenloop/LandedCostCard";
import { eventsForSubjects } from "@/domain/events";
import { useGreenLoopStore } from "@/store/GreenLoopStore.helpers";
import { formatDate, formatINR, formatINRPerT, isReusableAsset, materialTypeLabel } from "@/utils";
import { Link, useParams } from "react-router";
import PassportVerificationWorkspace from "@/components/greenloop/PassportVerificationWorkspace";
import StatusBadge from "@/components/greenloop/StatusBadge";

export default function MaterialPassport() {
  const { id } = useParams<{ id: string }>();
  const { dataset } = useGreenLoopStore();
  const { user } = useAuth();

  const material = dataset.materials.find((m) => m.id === id);
  const project = dataset.projects.find((p) => p.id === material?.projectId);

  if (!material || !project) {
    return (
      <div className="mx-auto max-w-[1200px] pb-24">
        <PageMeta title="Passport not found | GreenLoop" description="The requested material passport could not be found." />
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <h3 className="font-archivo text-2xl font-bold uppercase text-ink-900 dark:text-white">Passport not found</h3>
          <p className="mt-2 text-gray-500 dark:text-gray-400">The requested material passport could not be found.</p>
          <Link to="/app/materials" className="mt-6 inline-flex min-h-11 items-center bg-ink-900 px-6 font-archivo text-sm font-bold uppercase tracking-wide text-white hover:bg-loop-600 dark:bg-white dark:text-ink-900">
            Back to Inventory
          </Link>
        </div>
      </div>
    );
  }

  const allocation = dataset.allocations.find((a) => a.materialId === material.id && a.status !== "cancelled");
  const receiver = allocation ? dataset.receivers.find((r) => r.id === allocation.receiverId) : null;
  const booking = dataset.bookings.find((b) => (b.materialId === material.id || b.allocationId === allocation?.id) && b.status !== "cancelled");
  const relatedOffer = (dataset.offers ?? []).find((offer) => offer.passportId === material.id && offer.status !== "declined");
  const transactionPricePerT = booking?.agreedPricePerT ?? relatedOffer?.agreedPricePerT ?? relatedOffer?.pricePerT;
  const verification = dataset.verifications.find((v) => v.bookingId === booking?.id);
  const candidates = computeMatch(dataset, material.id, new Date().toISOString().slice(0, 10)).slice(0, 3);
  const ledger = allocation ? slotLedger(dataset, allocation.slotId) : undefined;
  const events = eventsForSubjects(dataset, [material.id, project.id]);
  const media = materialMedia(material);
  const isReusable = isReusableAsset(material);
  const isOwner = user?.activeWorkspace === "provider";
  const canReview = user?.workspaces?.includes("receiver") || user?.activeWorkspace === "receiver";

  const landedCostCalc = calculateLandedCost({
    materialType: material.type,
    quantityT: material.quantityT,
    pricePerT: transactionPricePerT ?? material.pricePerT,
    distanceKm: receiver?.distanceKm,
    distanceKnown: receiver?.distanceKnown,
    materialId: material.id,
    destination: receiver?.location,
  });

  // Evidence items: evidence refs that are site photos, plus fallback type imagery.
  const evidenceItems: EvidenceItem[] = [
    ...media.map((m) => ({ id: m.id, src: m.src, label: m.caption, kind: "site-photo" as const, recordedAt: formatDate(m.recordedAt) })),
    ...material.evidence
      .filter((e) => e.kind !== "site-photo")
      .map((e, index) => ({ id: `${material.id}-doc-${index}`, label: e.label, kind: e.kind, recordedAt: formatDate(e.recordedAt) })),
  ];

  // Next action drives the primary button.
  const statusChip =
    material.status === "verified" ? "verified" as const
    : material.status === "dispatched" ? "active" as const
    : material.status === "reserved" ? "confirmed" as const
    : material.status === "allocated" ? "confirmed" as const
    : "attention" as const;

  const primaryAction =
    verification ? (
      <Link to="/app/verification" className="inline-flex min-h-11 items-center rounded-xl bg-[#1a3827] px-6 text-sm font-bold text-white shadow-sm transition hover:bg-[#28573d] dark:bg-[#00e599] dark:text-[#0c1811] dark:hover:bg-[#34f5b0]">
        View proof of recovery →
      </Link>
    ) : booking ? (
      <Link to="/app/deliveries" className="inline-flex min-h-11 items-center rounded-xl bg-[#1a3827] px-6 text-sm font-bold text-white shadow-sm transition hover:bg-[#28573d] dark:bg-[#00e599] dark:text-[#0c1811] dark:hover:bg-[#34f5b0]">
        View booking &amp; delivery →
      </Link>
    ) : (
      <Link to={`/app/market-demand?view=receivers&materialId=${encodeURIComponent(material.id)}&type=${encodeURIComponent(material.type)}`} state={{ materialId: material.id }} className="inline-flex min-h-11 items-center rounded-xl bg-[#1a3827] px-6 text-sm font-bold text-white shadow-sm transition hover:bg-[#28573d] dark:bg-[#00e599] dark:text-[#0c1811] dark:hover:bg-[#34f5b0]">
        Find a receiver →
      </Link>
    );

  // Workflow stage from the material's own lifecycle.
  const workflowStage = verification && verification.status !== "pending" ? 7 : booking ? (booking.loadRef ? 6 : 5) : allocation ? 4 : candidates.length > 0 ? 3 : material.status === "surveyed" ? 2 : 1;

  // Grade interpretation
  const gradeDescription =
    material.grade === "A"
      ? "Grade A: Prime salvageable / structural component suitable for direct reuse."
      : material.grade === "B"
      ? "Grade B: Quality recoverable material suitable for secondary processing & standard recycling."
      : "Grade C: General downcyclable fill, crushing or base aggregate.";

  return (
    <PageMotion className="mx-auto max-w-[1200px] pb-24">
      <PageMeta
        title={`Passport ${material.id} | GreenLoop`}
        description={`Material passport for ${materialTypeLabel(material.type)} — ${material.quantityT.toFixed(1)} t from ${project.name}.`}
      />

      {/* Breadcrumb-style back link */}
      <RevealItem>
        <Link to="/app/materials" className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-[#5a6b5f] hover:text-[#1a3827] dark:text-gray-400 dark:hover:text-white">
          ← Back to Inventory
        </Link>
      </RevealItem>

      {/* Hero Record Actions */}
      {user?.activeWorkspace === "provider" && (
        <div className="mb-4">
          <RecordActions kind="passport" id={material.id} redirectAfterDelete="/app/materials" />
        </div>
      )}

      {/* Active Order or Negotiation Links */}
      {(booking || relatedOffer) && (
        <div className="mb-4 flex flex-wrap items-center gap-2.5">
          {booking && (
            <Link
              to={`/app/orders/${booking.id}`}
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3.5 py-2 text-xs font-bold text-emerald-900 shadow-xs transition hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
            >
              <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
              Active Order #{booking.id} ({booking.tonnesT} t) · Track Fulfilment →
            </Link>
          )}
          {relatedOffer && !booking && (
            <Link
              to={`/app/negotiations/${relatedOffer.id}`}
              className="inline-flex items-center gap-1.5 rounded-xl border border-blue-300 bg-blue-50 px-3.5 py-2 text-xs font-bold text-blue-900 shadow-xs transition hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200"
            >
              <span className="size-2 rounded-full bg-blue-500 animate-pulse" />
              Negotiation Thread #{relatedOffer.id.slice(0, 8)} · Review Commercial Terms →
            </Link>
          )}
        </div>
      )}

      {/* HERO — Material Overview */}
      <RevealItem>
        <header className="overflow-hidden rounded-3xl border border-[#e2dfd5] bg-white shadow-sm dark:border-steel-800 dark:bg-[#17251d] lg:gl-golden-columns">
          <MediaPanel
            media={materialMediaFor(material.type)}
            aspect="min-h-[300px] lg:min-h-[380px]"
            scrim="bg-gradient-to-t from-[#0c1811]/85 via-[#0c1811]/30 to-transparent"
            className="border-0 border-b border-[#e2dfd5] lg:border-b-0 lg:border-e dark:border-steel-800"
            caption={`${material.id} · surveyed ${formatDate(material.surveyedAt)}`}
          >
            <figcaption className="absolute bottom-4 left-5 right-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-white/20 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white backdrop-blur-xs">
                  Material Passport
                </span>
                {isReusable && (
                  <span className="rounded-full bg-[#00e599]/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#0c1811] shadow-sm">
                    ♻ Reusable Asset
                  </span>
                )}
                <span className="rounded-full bg-black/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white backdrop-blur-xs">
                  {material.verificationStatus || "unverified"}
                </span>
              </div>
              <h1 className="mt-2 font-archivo text-3xl font-bold uppercase tracking-tight text-white drop-shadow sm:text-4xl">
                {material.name || materialTypeLabel(material.type)}
              </h1>
              <div className="flex flex-wrap items-center gap-2 text-xs text-white/90">
                <span>ID: {material.id}</span>
                {material.dimensions && (
                  <>
                    <span>·</span>
                    <span className="font-mono">{material.dimensions}</span>
                  </>
                )}
              </div>
            </figcaption>
          </MediaPanel>

          <div className="flex flex-col gap-5 p-6 sm:p-8">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-baseline gap-2">
                  <Counter value={material.quantityT} className="font-archivo text-4xl font-black text-[#152e1f] dark:text-white" />
                  <span className="font-archivo text-lg font-bold text-[#55695a] dark:text-gray-400">tonnes</span>
                </div>
                {material.originalUnit && (
                  <p className="mt-1 text-xs font-medium text-[#65766a] dark:text-gray-300">
                    Surveyed as <strong className="text-[#152e1f] dark:text-white">{material.originalQuantity} {material.originalUnit}</strong> @ {material.conversionFactor} t/{material.originalUnit}
                  </p>
                )}
              </div>
              <div className="flex flex-col items-end gap-1">
                <StatusChip status={statusChip} label={material.status} />
                <StatusBadge status={material.verificationStatus ?? "unverified"} />
              </div>
            </div>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-y border-[#ede9df] py-4 text-xs dark:border-steel-800">
              <div>
                <dt className="font-bold uppercase tracking-wider text-[#79887c] dark:text-gray-400 text-[10px]">Source Project</dt>
                <dd className="mt-1 font-semibold text-[#1a3827] dark:text-white">
                  <Link to={`/app/projects/${project.id}`} className="underline hover:text-[#00e599] dark:text-[#a0cfae]">
                    {project.name}
                  </Link>
                </dd>
              </div>

              <div>
                <dt className="font-bold uppercase tracking-wider text-[#79887c] dark:text-gray-400 text-[10px]">Location</dt>
                <dd className="mt-1 font-semibold text-[#1a3827] dark:text-white">{project.location}</dd>
              </div>

              <div>
                <dt className="font-bold uppercase tracking-wider text-[#79887c] dark:text-gray-400 text-[10px]">Condition &amp; Quality</dt>
                <dd className="mt-1 font-semibold capitalize text-[#1a3827] dark:text-white">
                  {material.condition} · Grade {material.grade}
                </dd>
              </div>

              <div>
                <dt className="font-bold uppercase tracking-wider text-[#79887c] dark:text-gray-400 text-[10px]">Verification</dt>
                <dd className="mt-1 font-semibold text-[#1a3827] dark:text-white">
                  <span className="capitalize">{material.verificationStatus || "unverified"}</span>
                </dd>
              </div>

              <div>
                <dt className="font-bold uppercase tracking-wider text-[#79887c] dark:text-gray-400 text-[10px]">Survey Confidence</dt>
                <dd className="mt-1 font-mono font-semibold text-[#1a3827] dark:text-white">
                  {Math.round(material.confidence * 100)}%
                </dd>
              </div>

              {material.availableFrom && (
                <div>
                  <dt className="font-bold uppercase tracking-wider text-[#79887c] dark:text-gray-400 text-[10px]">Available From</dt>
                  <dd className="mt-1 font-semibold text-[#1a3827] dark:text-white">{formatDate(material.availableFrom)}</dd>
                </div>
              )}

              <div>
                <dt className="font-bold uppercase tracking-wider text-[#79887c] dark:text-gray-400 text-[10px]">Reference Price</dt>
                <dd className="mt-1 font-semibold text-[#1a3827] dark:text-white">
                  {material.pricePerT !== undefined ? formatINRPerT(material.pricePerT) : "Price on request"}
                </dd>
                {material.pricePerT !== undefined && (
                  <dd className="mt-0.5 text-[11px] text-[#69796e] dark:text-gray-400">
                    Est. value {formatINR(material.pricePerT * material.quantityT)}
                  </dd>
                )}
              </div>
            </dl>

            <div className="mt-auto flex flex-col gap-2 pt-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#79887c] dark:text-gray-400">Next Action</span>
              <div>{primaryAction}</div>
            </div>
          </div>
        </header>
      </RevealItem>

      {/* VERIFICATION LIMITATIONS NOTICE */}
      <RevealItem>
        <section aria-label="Verification limitations" className="mt-6 overflow-hidden rounded-2xl border border-[#d6e5d8] bg-[#f4f9f5] p-4 text-xs text-[#20452a] dark:border-[#285034] dark:bg-[#14291c] dark:text-[#a8e4ba]">
          <div className="flex items-start gap-3">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#1a3827] text-white dark:bg-[#00e599] dark:text-[#0c1811]">
              <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="size-4"><path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0zm-7-4a1 1 0 1 1-2 0 1 1 0 0 1 2 0zM9 9a1 1 0 0 0 0 2v3a1 1 0 0 0 1 1h1a1 1 0 1 0 0-2v-3a1 1 0 0 0-1-1H9z" clipRule="evenodd" /></svg>
            </span>
            <div className="space-y-1">
              <h2 className="font-archivo text-sm font-bold text-[#14301d] dark:text-white">
                Material Passport Scope &amp; Verification Limitations
              </h2>
              <p className="leading-relaxed opacity-95">
                This digital record captures pre-demolition/site survey measurements and uploaded provenance documentation. The volume estimate carries a defined uncertainty range of <strong>{material.quantityRangeT[0].toFixed(1)}–{material.quantityRangeT[1].toFixed(1)} tonnes</strong>.
              </p>
              <p className="leading-relaxed opacity-90">
                <strong>Physical Verification:</strong> Definitive weight and material acceptance are certified at the receiving facility weighbridge upon delivery intake. Digital passport declarations do not substitute for physical weighbridge slips.
              </p>
            </div>
          </div>
        </section>
      </RevealItem>

      {/* WORKFLOW RAIL */}
      <RevealItem>
        <section className="mt-6 rounded-2xl border border-[#e2dfd5] bg-white p-5 shadow-xs dark:border-steel-800 dark:bg-[#17251d]" aria-label="Workflow position">
          <WorkflowRail7 current={workflowStage} />
        </section>
      </RevealItem>

      {/* MAIN BODY GRID */}
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Main Column (2 cols) */}
        <div className="space-y-6 lg:col-span-2">
          {/* Verification & Compliance Workspace */}
          <RevealItem>
            <PassportVerificationWorkspace
              material={material}
              isOwner={Boolean(isOwner)}
              canReview={Boolean(canReview)}
            />
          </RevealItem>

          {/* Specifications & Condition Assessment */}
          <RevealItem>
            <section className="rounded-2xl border border-[#e2dfd5] bg-white p-5 shadow-xs dark:border-steel-800 dark:bg-[#17251d]">
              <h2 className="font-archivo text-base font-bold text-[#1a2e21] dark:text-white">
                Specifications &amp; Condition Assessment
              </h2>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-[#eeebe2] bg-[#fbfaf6] p-3 dark:border-steel-800 dark:bg-white/[0.02]">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#79887c] dark:text-gray-400">Classification</span>
                  <p className="mt-1 font-semibold text-[#182f20] dark:text-white">
                    {materialTypeLabel(material.type)}
                  </p>
                  <p className="mt-0.5 text-xs text-[#627367] dark:text-gray-400">
                    {isReusable ? "Designated Reusable Component" : "Standard Secondary Resource"}
                  </p>
                </div>

                <div className="rounded-xl border border-[#eeebe2] bg-[#fbfaf6] p-3 dark:border-steel-800 dark:bg-white/[0.02]">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#79887c] dark:text-gray-400">Quality Rating</span>
                  <p className="mt-1 font-semibold capitalize text-[#182f20] dark:text-white">
                    Grade {material.grade} · {material.condition} condition
                  </p>
                  <p className="mt-0.5 text-xs text-[#627367] dark:text-gray-400">
                    {gradeDescription}
                  </p>
                </div>
              </div>

              {material.surveyNotes && (
                <div className="mt-4 rounded-xl border border-[#d8e2d7] bg-[#f5f9f6] p-3 text-xs dark:border-steel-800 dark:bg-[#1a2d21]">
                  <span className="font-bold uppercase tracking-wider text-[#355b3f] dark:text-[#a6d5b0]">Surveyor Notes &amp; Observations</span>
                  <p className="mt-1 text-[#223d2a] dark:text-gray-300 leading-relaxed">{material.surveyNotes}</p>
                </div>
              )}
            </section>
          </RevealItem>

          {/* Quantities & Survey Uncertainty Band */}
          <RevealItem>
            <section className="rounded-2xl border border-[#e2dfd5] bg-white p-5 shadow-xs dark:border-steel-800 dark:bg-[#17251d]">
              <div className="flex items-center justify-between">
                <h2 className="font-archivo text-base font-bold text-[#1a2e21] dark:text-white">
                  Quantities &amp; Uncertainty Band
                </h2>
                <span className="text-xs font-semibold text-[#5a6b5e] dark:text-gray-400">
                  Range: {material.quantityRangeT[0].toFixed(1)}–{material.quantityRangeT[1].toFixed(1)} t
                </span>
              </div>

              <div className="mt-4">
                <div className="relative h-3 w-full overflow-hidden rounded-full bg-[#e8ebe5] dark:bg-white/10" aria-label={`Survey range ${material.quantityRangeT[0]} to ${material.quantityRangeT[1]} tonnes`}>
                  <div
                    className="absolute inset-y-0 rounded-full bg-[#00e599]/40"
                    style={{
                      left: `${(material.quantityRangeT[0] / (material.quantityRangeT[1] * 1.15)) * 100}%`,
                      width: `${((material.quantityRangeT[1] - material.quantityRangeT[0]) / (material.quantityRangeT[1] * 1.15)) * 100}%`,
                    }}
                  />
                  <div
                    className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#1a3827] shadow-sm dark:border-black dark:bg-[#00e599]"
                    style={{ left: `${(material.quantityT / (material.quantityRangeT[1] * 1.15)) * 100}%` }}
                  />
                </div>
                <div className="mt-2 flex justify-between text-xs text-gray-500 dark:text-gray-400">
                  <span className="font-mono">{material.quantityRangeT[0].toFixed(1)} t min</span>
                  <span className="font-mono font-bold text-[#1a2e21] dark:text-white">
                    Survey: {material.quantityT.toFixed(1)} t {material.originalUnit && `(${material.originalQuantity} ${material.originalUnit})`}
                  </span>
                  <span className="font-mono">{material.quantityRangeT[1].toFixed(1)} t max</span>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-[#f8f9f6] p-3 text-center text-xs dark:bg-white/[0.03]">
                <div>
                  <span className="text-[10px] uppercase text-[#79887c]">Conservative Min</span>
                  <p className="font-mono font-bold text-[#1a2e21] dark:text-white">{material.quantityRangeT[0].toFixed(1)} t</p>
                </div>
                <div>
                  <span className="text-[10px] uppercase text-[#79887c]">Survey Target</span>
                  <p className="font-mono font-bold text-[#1a2e21] dark:text-[#00e599]">{material.quantityT.toFixed(1)} t</p>
                </div>
                <div>
                  <span className="text-[10px] uppercase text-[#79887c]">Optimistic Max</span>
                  <p className="font-mono font-bold text-[#1a2e21] dark:text-white">{material.quantityRangeT[1].toFixed(1)} t</p>
                </div>
              </div>
            </section>
          </RevealItem>

          {/* Photos & Evidence Gallery */}
          <RevealItem>
            <section className="rounded-2xl border border-[#e2dfd5] bg-white p-5 shadow-xs dark:border-steel-800 dark:bg-[#17251d]">
              <div className="flex items-center justify-between">
                <h2 className="font-archivo text-base font-bold text-[#1a2e21] dark:text-white">
                  Site Photos &amp; Verified Evidence
                </h2>
                <span className="rounded-full bg-[#f0f4ee] px-2.5 py-0.5 text-xs font-semibold text-[#285734] dark:bg-[#1a3826] dark:text-[#a6d5b0]">
                  {material.evidence.length} records attached
                </span>
              </div>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Pre-demolition photographs, laboratory test sheets, and intake weighbridge documentation.
              </p>

              <EvidenceGallery items={evidenceItems} className="mt-4" />

              {/* Verified file links */}
              {material.evidence.some((item) => item.ref?.startsWith("/api/uploads/")) && (
                <div className="mt-4 rounded-xl border border-[#e5e9e2] bg-[#f9fbf9] p-3 dark:border-steel-800 dark:bg-white/[0.02]">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#497053] dark:text-[#a6d5b0]">
                    Verified File Attachments
                  </span>
                  <ul className="mt-2 space-y-1.5">
                    {material.evidence
                      .filter((item) => item.ref?.startsWith("/api/uploads/"))
                      .map((item, index) => (
                        <li key={index} className="flex items-center justify-between text-xs">
                          <span className="flex items-center gap-1.5 font-medium text-[#203a27] dark:text-gray-200">
                            <span aria-hidden="true">📄</span>
                            <span>{item.label}</span>
                            <span className="text-[10px] uppercase text-gray-400">({item.kind})</span>
                          </span>
                          <a
                            href={item.ref}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-semibold text-[#1a5b32] underline hover:text-[#00e599] dark:text-[#00e599]"
                          >
                            Download evidence ↗
                          </a>
                        </li>
                      ))}
                  </ul>
                </div>
              )}
            </section>
          </RevealItem>

          {/* Matching & Logistics Breakdown (Supported Data Only) */}
          <RevealItem>
            <section className="rounded-2xl border border-[#e2dfd5] bg-white p-5 shadow-xs dark:border-steel-800 dark:bg-[#17251d]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-archivo text-base font-bold text-[#1a2e21] dark:text-white">
                    Matching &amp; Landed Logistics
                  </h2>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    Receiving facilities evaluated for this material passport.
                  </p>
                </div>
                <StatusChip
                  status={receiver ? "confirmed" : candidates.length > 0 ? "available" : "draft"}
                  label={receiver ? "Destination Matched" : candidates.length > 0 ? `${candidates.length} Candidates` : "No Candidates"}
                />
              </div>

              {receiver && allocation ? (
                <div className="mt-4 space-y-3 rounded-xl border border-[#d5e5d8] bg-[#f4f9f5] p-4 dark:border-steel-800 dark:bg-[#172c1f]">
                  <div className="flex items-center gap-4">
                    <img
                      src={receiverMediaFor(receiver.id).src}
                      alt={receiverMediaFor(receiver.id).alt}
                      loading="lazy"
                      className="size-16 rounded-xl border border-steel-200 object-cover dark:border-steel-700"
                    />
                    <div className="min-w-0">
                      <p className="font-archivo text-base font-bold text-[#1a3827] dark:text-white">{receiver.name}</p>
                      <p className="text-xs text-[#526356] dark:text-gray-300">
                        {receiver.distanceKnown === false ? "Distance not specified" : `${receiver.distanceKm} km transit`} · {receiver.location}
                      </p>
                      <Link to="/app/allocations" className="mt-1 inline-block text-xs font-bold text-[#1a5b32] underline dark:text-[#00e599]">
                        View Match Breakdown →
                      </Link>
                    </div>
                  </div>

                  {/* Landed-Cost Engine & Virgin Benchmark Comparison */}
                  <LandedCostCard
                    calculation={landedCostCalc}
                    className="mt-3"
                    title={`Landed Cost & Virgin Benchmark (${receiver.name})`}
                  />
                </div>
              ) : (
                <div className="mt-4 space-y-4">
                  <LandedCostCard
                    calculation={landedCostCalc}
                    title="Estimated Landed Cost & Virgin Material Benchmark"
                  />
                  {candidates.length > 0 ? (
                    <ul className="space-y-2.5">
                      {candidates.map((candidate, index) => {
                        const candidateReceiver = dataset.receivers.find((r) => r.id === candidate.receiverId);
                        const candCost = calculateLandedCost({
                          materialType: material.type,
                          quantityT: candidate.availableT || material.quantityT,
                          pricePerT: material.pricePerT,
                          distanceKm: candidate.distanceKm,
                          distanceKnown: candidate.distanceKnown,
                          transportCostPerT: candidate.transportCostPerT,
                          handlingCostPerT: candidate.handlingCostPerT,
                        });
                        return (
                          <li
                            key={candidate.receiverId}
                            className="flex flex-col gap-2 rounded-xl border border-[#e4e7df] bg-[#fafbf9] p-3.5 dark:border-steel-800 dark:bg-white/[0.02]"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span className="font-semibold text-[#1d3324] dark:text-white text-sm">
                                {candidateReceiver?.name ?? candidate.receiverId}
                              </span>
                              {index === 0 && candidate.recommended && (
                                <span className="rounded-full bg-[#1a3827] px-2 py-0.5 text-[10px] font-bold text-white dark:bg-[#00e599] dark:text-[#0c1811]">
                                  ★ Recommended
                                </span>
                              )}
                            </div>

                            <div className="grid grid-cols-3 gap-2 text-xs text-[#5a6b5e] dark:text-gray-300">
                              <div>
                                <span className="text-[10px] uppercase text-[#818f83]">Distance</span>
                                <p className="font-medium text-[#1e3425] dark:text-white">
                                  {candidate.distanceKnown === false ? "—" : `${candidate.distanceKm} km`}
                                </p>
                              </div>
                              <div>
                                <span className="text-[10px] uppercase text-[#818f83]">Slot Free</span>
                                <p className="font-medium text-[#1e3425] dark:text-white">
                                  {candidate.availableT.toFixed(1)} t
                                </p>
                              </div>
                              <div>
                                <span className="text-[10px] uppercase text-[#818f83]">Suitability</span>
                                <p className="font-medium text-[#1e3425] dark:text-white">
                                  {Math.round(candidate.suitability * 100)}% fit
                                </p>
                              </div>
                            </div>

                            {/* Indicative Landed Logistics & Virgin Savings */}
                            <div className="flex flex-wrap items-center justify-between border-t border-[#e8ebe4] pt-2 text-[11px] text-[#617365] dark:border-steel-800 dark:text-gray-400">
                              <span>
                                Landed: {candCost.reusableLandedCostPerT !== null ? formatINRPerT(candCost.reusableLandedCostPerT) : `Logistics ${formatINRPerT(candCost.reusableLogisticsPerT)}`}
                                {candCost.savingsPercentage !== null && candCost.savingsPercentage > 0 && (
                                  <strong className="ml-1 text-[#1b5e32] dark:text-[#8fe0a4]">
                                    (Save ~{candCost.savingsPercentage}%)
                                  </strong>
                                )}
                              </span>
                              <span className="font-mono font-semibold text-[#1a5b32] dark:text-[#00e599]">
                                Score: {candidate.score.toFixed(2)}
                              </span>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      No candidate receivers computed yet — open Find a Receiver to evaluate matching facilities.
                    </p>
                  )}
                </div>
              )}
            </section>
          </RevealItem>
        </div>

        {/* Sidebar Column (1 col) */}
        <div className="space-y-6">
          {/* Provenance & Geolocation */}
          <RevealItem>
            <section className="rounded-2xl border border-[#e2dfd5] bg-white p-5 shadow-xs dark:border-steel-800 dark:bg-[#17251d]">
              <h2 className="font-archivo text-base font-bold text-[#1a2e21] dark:text-white">
                Provenance &amp; Custody
              </h2>

              <div className="mt-3 space-y-2.5 text-xs">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#79887c] dark:text-gray-400">Project Origin</span>
                  <p className="font-semibold text-[#1a3827] dark:text-white">{project.name}</p>
                </div>

                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#79887c] dark:text-gray-400">Site Address</span>
                  <p className="text-[#3b4e40] dark:text-gray-300">{project.location}</p>
                </div>

                {project.geo && (
                  <div className="mt-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#79887c] dark:text-gray-400">Coordinates</span>
                    <p className="font-mono text-[11px] text-[#55695a] dark:text-gray-400">
                      {project.geo.lat.toFixed(5)}, {project.geo.lng.toFixed(5)}
                    </p>
                    <div className="mt-2 overflow-hidden rounded-xl border border-[#dfe4dc]">
                      <LocationMap geo={project.geo} size="sm" className="!h-[140px]" />
                    </div>
                  </div>
                )}
              </div>
            </section>
          </RevealItem>

          {/* Slot Capacity (if booked/allocated) */}
          <RevealItem>
            <section className="rounded-2xl border border-[#e2dfd5] bg-white p-5 shadow-xs dark:border-steel-800 dark:bg-[#17251d]">
              <h2 className="font-archivo text-base font-bold text-[#1a2e21] dark:text-white">
                Receiving Capacity
              </h2>
              {ledger && allocation ? (
                <div className="mt-4">
                  <CapacityMeter total={ledger.slot.capacityT} reserved={ledger.reserved} held={ledger.heldT} />
                  <p className="font-mono mt-3 text-xs text-gray-500 dark:text-gray-400">
                    Slot {allocation.slotId} · {formatDate(ledger.slot.date)}
                  </p>
                  {allocation.requestedT > ledger.slot.capacityT - ledger.reserved && (
                    <p className="mt-2 border-s-2 border-amber-500 bg-amber-50 px-2 py-1 text-xs text-amber-800 dark:bg-amber-950/20 dark:text-amber-300">
                      Shortfall: {(allocation.requestedT - (ledger.slot.capacityT - ledger.reserved)).toFixed(1)} t over free capacity.
                    </p>
                  )}
                </div>
              ) : (
                <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                  No slot reserved yet — capacity is checked and allocated upon booking request.
                </p>
              )}
            </section>
          </RevealItem>

          {/* Booking & Recovery Summary */}
          <RevealItem>
            <section className="rounded-2xl border border-[#e2dfd5] bg-white p-5 shadow-xs dark:border-steel-800 dark:bg-[#17251d]">
              <h2 className="font-archivo text-base font-bold text-[#1a2e21] dark:text-white">
                Recovery Execution
              </h2>
              {booking ? (
                <div className="mt-3 space-y-2 text-xs">
                  <p className="flex justify-between gap-2 border-b border-[#f0eee9] pb-1.5 dark:border-steel-800">
                    <span className="text-gray-500 dark:text-gray-400">Booking Ref</span>
                    <span className="font-mono font-bold text-[#1a3827] dark:text-white">{booking.id}</span>
                  </p>
                  <p className="flex justify-between gap-2 border-b border-[#f0eee9] pb-1.5 dark:border-steel-800">
                    <span className="text-gray-500 dark:text-gray-400">Confirmed Tonnage</span>
                    <span className="font-mono font-bold text-[#1a3827] dark:text-white">{booking.tonnesT.toFixed(1)} t</span>
                  </p>
                  {transactionPricePerT !== undefined && (
                    <>
                      <p className="flex justify-between gap-2 border-b border-[#f0eee9] pb-1.5 dark:border-steel-800">
                        <span className="text-gray-500 dark:text-gray-400">Agreed Unit Price</span>
                        <span className="font-bold text-[#1a3827] dark:text-white">{formatINRPerT(transactionPricePerT)}</span>
                      </p>
                      <p className="flex justify-between gap-2 border-b border-[#f0eee9] pb-1.5 dark:border-steel-800">
                        <span className="text-gray-500 dark:text-gray-400">Transaction Value</span>
                        <span className="font-bold text-[#1a3827] dark:text-white">{formatINR(transactionPricePerT * booking.tonnesT)}</span>
                      </p>
                    </>
                  )}
                  {verification && (
                    <div className="mt-2 rounded-xl bg-[#eef7f0] p-2.5 dark:bg-[#173020]">
                      <p className="flex justify-between text-xs">
                        <span className="text-[#3b5e43] dark:text-gray-300">Weighbridge Received:</span>
                        <strong className="text-[#1a3827] dark:text-white">{verification.actualT.toFixed(1)} t</strong>
                      </p>
                      <p className="mt-1 flex justify-between text-xs">
                        <span className="text-[#3b5e43] dark:text-gray-300">Accepted Quality:</span>
                        <strong className="text-[#1a5b32] dark:text-[#00e599]">{verification.acceptedT.toFixed(1)} t</strong>
                      </p>
                      <StatusChip status="verified" label="Verified recovery" className="mt-2" />
                    </div>
                  )}
                  <Link to="/app/bookings" className="mt-2 inline-block font-bold text-[#1a5b32] underline hover:text-[#00e599] dark:text-[#a0cfae]">
                    Open Bookings &amp; Deliveries →
                  </Link>
                </div>
              ) : (
                <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                  No booking yet — request capacity after matching with a destination facility.
                </p>
              )}
            </section>
          </RevealItem>

          {/* Audit Trail & History */}
          <RevealItem>
            <section className="rounded-2xl border border-[#e2dfd5] bg-white p-5 shadow-xs dark:border-steel-800 dark:bg-[#17251d]">
              <h2 className="font-archivo text-base font-bold text-[#1a2e21] dark:text-white">
                Custody History
              </h2>
              {events.length > 0 ? (
                <ol className="relative ms-2 mt-4 space-y-4 border-s-2 border-[#dbe3db] dark:border-steel-700">
                  {events.slice(0, 6).map((event) => (
                    <li key={event.id} className="relative ps-4">
                      <span aria-hidden="true" className="absolute -start-[5px] top-1.5 size-2 rounded-full bg-[#1a3827] dark:bg-[#00e599]" />
                      <p className="font-mono text-[10px] text-gray-400">{formatDate(event.at)}</p>
                      <p className="mt-0.5 text-xs font-medium text-[#1a2e21] dark:text-gray-200">{event.summary}</p>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">No events recorded.</p>
              )}
            </section>
          </RevealItem>
        </div>
      </div>
    </PageMotion>
  );
}

import type { AllocationCandidate, ProviderMaterialListing, MaterialTypeKey } from "@shared/domain/types";
import { calculateLandedCost } from "@shared/domain/landedCost";
import { formatINR, formatINRPerT, materialTypeLabel } from "@/utils";
import { useGreenLoopStore } from "@/store/GreenLoopStore.helpers";
import DirectMaterialRequest from "@/components/greenloop/DirectMaterialRequest";
import { Link } from "react-router";

interface MatchDetailsPanelProps {
  match: AllocationCandidate;
  onProceedRequest?: () => void;
  showProceedAction?: boolean;
}

export default function MatchDetailsPanel({
  match,
  onProceedRequest,
  showProceedAction = true,
}: MatchDetailsPanelProps) {
  const { dataset } = useGreenLoopStore();
  const material = match.materialId
    ? dataset.materials.find((m) => m.id === match.materialId) ||
      dataset.providerListings?.find((l) => l.materialId === match.materialId)
    : undefined;
  const receiver = match.receiverId ? dataset.receivers.find((r) => r.id === match.receiverId) : undefined;

  let materialType: string | undefined;
  if (material) {
    if ("type" in material) materialType = material.type;
    else if ("materialType" in material) materialType = material.materialType;
  }
  if (!materialType && match.factors?.compatibility?.value) {
    const val = String(match.factors.compatibility.value).toLowerCase();
    for (const t of ["concrete", "steel", "brick", "timber", "glass", "plasterboard"]) {
      if (val.includes(t)) {
        materialType = t;
        break;
      }
    }
  }

  const requestedQty = match.requestedQuantityT || 10;
  let materialStock: number | undefined;
  if (material) {
    if ("availableT" in material) materialStock = material.availableT;
    else if ("quantityT" in material) materialStock = material.quantityT;
  }
  const availableQty = match.availableQuantityT || materialStock || 10;
  const calculationQty = Math.min(requestedQty, availableQty) || requestedQty;

  const listing = dataset.providerListings?.find((l) => l.materialId === match.materialId);
  const mRecord = material as unknown as Record<string, unknown> | undefined;
  const effectiveListing: ProviderMaterialListing | undefined = listing || (material && match.materialId ? {
    providerId: typeof mRecord?.providerId === "string" ? mRecord.providerId : "P-default",
    providerName: typeof mRecord?.organization === "string" ? mRecord.organization : "Provider",
    organization: typeof mRecord?.organization === "string" ? mRecord.organization : "Provider",
    materialId: match.materialId,
    materialType: (materialType as MaterialTypeKey) || "steel",
    projectId: "PRJ-reclaimed",
    projectName: "Reclaimed Asset",
    projectLocation: typeof mRecord?.location === "string" ? mRecord.location : (receiver?.location || "Regional Site"),
    quantityT: availableQty,
    availableT: availableQty,
    pricePerT: material.pricePerT,
    grade: ("grade" in material && material.grade ? material.grade : "B") as ProviderMaterialListing["grade"],
    condition: ("condition" in material && material.condition ? material.condition : "good") as ProviderMaterialListing["condition"],
    location: typeof mRecord?.location === "string" ? mRecord.location : (receiver?.location || "Regional Site"),
  } : undefined);

  const calculation = calculateLandedCost({
    materialType: materialType || "steel",
    quantityT: calculationQty,
    pricePerT: material?.pricePerT,
    distanceKm: match.distanceKm,
    distanceKnown: match.distanceKnown,
    transportCostPerT: match.transportCostPerT,
    handlingCostPerT: match.handlingCostPerT,
    materialId: match.materialId,
    destination: receiver?.location,
  });

  const formatScore = (score: number) => {
    if (!match.isEligible) return "0%";
    return `${Math.round(score * 100)}%`;
  };

  const getImpactColor = (impact: "positive" | "neutral" | "negative" | "unknown") => {
    switch (impact) {
      case "positive":
        return "text-[#1b5e32] dark:text-[#8fe0a4] bg-[#eaf4ed] dark:bg-[#1a3825]/60 border-[#c4e1cb] dark:border-[#2f633f]";
      case "neutral":
        return "text-[#24527a] dark:text-[#7bb0df] bg-[#eef5fb] dark:bg-[#162e43]/60 border-[#c7dff3] dark:border-[#274c6e]";
      case "negative":
        return "text-[#874d12] dark:text-[#e4a86b] bg-[#fdf5eb] dark:bg-[#3d2714]/60 border-[#f5d9b8] dark:border-[#6b4725]";
      default:
        return "text-[#526056] dark:text-[#a0aca3] bg-[#f4f5f2] dark:bg-white/[0.04] border-[#e0e3dc] dark:border-steel-700";
    }
  };

  const complianceChecks = match.complianceChecks || [];
  const missingEvidence = match.missingEvidence || [];
  const limitations = match.compatibilityLimitations || [];
  const delivery = match.deliveryFeasibility;

  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-[#dfe4db] bg-white shadow-sm dark:border-steel-800 dark:bg-[#15231a]">
      {/* ---------------------------------------------------- */}
      {/* 1. Top Header Bar with Eligibility Status & Score    */}
      {/* ---------------------------------------------------- */}
      <div
        className={`flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3.5 transition-colors ${
          match.isEligible
            ? "border-[#e5e9e2] bg-[#f6f8f5] dark:border-steel-800 dark:bg-[#1a2c20]"
            : "border-[#f5c6c6] bg-[#fdf4f4] dark:border-[#6b2c2c] dark:bg-[#2b1717]"
        }`}
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`text-xs font-bold uppercase tracking-wider ${
                match.isEligible ? "text-[#355f3e] dark:text-[#a6d5b0]" : "text-[#b32b2b] dark:text-[#f38b8b]"
              }`}
            >
              Smart Procurement Match
            </span>

            {/* Eligibility Pill */}
            {match.isEligible ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#1b5e32] px-2.5 py-0.5 text-[10px] font-bold text-white shadow-xs">
                ✓ Eligible Match
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#c92a2a] px-2.5 py-0.5 text-[10px] font-bold text-white shadow-xs">
                ✕ Ineligible · Requirement Failed
              </span>
            )}

            {match.recommended && match.isEligible && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#e8b931] px-2 py-0.5 text-[10px] font-bold text-[#322300] shadow-xs">
                ★ Best Fit Recommendation
              </span>
            )}
            {match.isFullMatch && (
              <span className="rounded-full bg-[#dcf2e1] px-2 py-0.5 text-[10px] font-bold text-[#1f6636] dark:bg-[#204629] dark:text-[#9fe2b2]">
                Full Coverage (100%)
              </span>
            )}
            {match.isPartialMatch && (
              <span className="rounded-full bg-[#fef3d6] px-2 py-0.5 text-[10px] font-bold text-[#875312] dark:bg-[#4a3416] dark:text-[#e9b86f]">
                Partial Coverage ({match.coveragePercent}%)
              </span>
            )}
            {material && "verificationStatus" in material && material.verificationStatus && (
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold border ${
                material.verificationStatus === "verified"
                  ? "bg-[#101913] text-[#B7F34A] border-[#B7F34A]/40"
                  : material.verificationStatus === "rejected"
                  ? "bg-red-100 text-red-800 border-red-300 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800"
                  : material.verificationStatus === "unverified"
                  ? "bg-gray-100 text-gray-700 border-gray-300 dark:bg-steel-800 dark:text-gray-300 dark:border-steel-700"
                  : "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800"
              }`}>
                {material.verificationStatus === "verified"
                  ? "Certified Verified ✓"
                  : material.verificationStatus === "rejected"
                  ? "Passport Rejected ✕"
                  : material.verificationStatus === "unverified"
                  ? "Self-Reported Survey 📋"
                  : "Pending Review ⏳"}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-[#59665c] dark:text-gray-400">
            {match.summary || "Deterministic multi-factor evaluation based on compliance, capability, timeline, and landed cost."}
          </p>
        </div>

        <div className="text-end">
          <span
            className={`font-archivo text-2xl font-black ${
              match.isEligible ? "text-[#1d3524] dark:text-white" : "text-[#a32828] dark:text-[#f89e9e]"
            }`}
          >
            {formatScore(match.score)}
          </span>
          <span className="block text-[10px] font-semibold uppercase tracking-wider text-[#79887d] dark:text-gray-400">
            {match.isEligible ? "Match Score" : "Disqualified"}
          </span>
        </div>
      </div>

      {/* ---------------------------------------------------- */}
      {/* Ineligibility Alert Banner (if failed requirement)   */}
      {/* ---------------------------------------------------- */}
      {!match.isEligible && (
        <div className="border-b border-[#f3c2c2] bg-[#fbf0f0] p-4 text-xs text-[#8c2222] dark:border-[#5c2323] dark:bg-[#281616] dark:text-[#f49c9c]">
          <div className="flex items-start gap-2">
            <span className="font-bold text-sm">⚠️</span>
            <div>
              <p className="font-bold uppercase tracking-wider text-[11px]">
                Mandatory Eligibility / Compliance Failure
              </p>
              <p className="mt-0.5 leading-relaxed">
                This asset failed mandatory project compliance constraints. In GreenLoop’s explainable matching engine, a high proximity or low price never overrides a failed mandatory requirement.
              </p>
              {match.nonMatchReasons && match.nonMatchReasons.length > 0 && (
                <ul className="mt-2 list-disc space-y-1 pl-4 font-semibold">
                  {match.nonMatchReasons.map((reason, i) => (
                    <li key={i}>{reason}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* 2. Quantity Coverage Bar                             */}
      {/* ---------------------------------------------------- */}
      <div className="border-b border-[#e9ede7] bg-[#fafbf9] px-4 py-3 dark:border-steel-800 dark:bg-[#18271e]">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-bold uppercase tracking-wider text-[10px] text-[#556458] dark:text-gray-400">
            Quantity Coverage Analysis
          </span>
          <span className="font-semibold text-[#24422b] dark:text-[#9de0af]">
            {availableQty.toFixed(1)} t available / {requestedQty.toFixed(1)} t requested
            {match.remainingQuantityT !== undefined && match.remainingQuantityT > 0 && (
              <span className="font-normal opacity-80 text-[#82531a] dark:text-[#e4a86b]">
                {" "}· ({match.remainingQuantityT.toFixed(1)} t still needed)
              </span>
            )}
          </span>
        </div>
        <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-[#e3e8e1] dark:bg-steel-800">
          <div
            className={`h-full transition-all ${
              match.isFullMatch ? "bg-[#258242]" : "bg-[#d98a2b]"
            }`}
            style={{ width: `${Math.min(100, match.coveragePercent || (availableQty >= requestedQty ? 100 : (availableQty / requestedQty) * 100))}%` }}
          />
        </div>
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-2">
        {/* -------------------------------------------------- */}
        {/* Left Column: Compliance Checklist & Evaluation     */}
        {/* -------------------------------------------------- */}
        <div className="space-y-4">
          {/* Mandatory Compliance Checklist */}
          {complianceChecks.length > 0 && (
            <div className="rounded-xl border border-[#d6e3d9] bg-[#f7faf8] p-3.5 dark:border-steel-800 dark:bg-[#18281e]">
              <div className="mb-2 flex items-center justify-between">
                <h5 className="text-[11px] font-bold uppercase tracking-wider text-[#2e5937] dark:text-[#8fe0a4]">
                  Eligibility &amp; Mandatory Compliance Checks
                </h5>
                <span className="text-[10px] font-semibold text-[#5a6c5f] dark:text-gray-400">
                  {complianceChecks.filter((c) => c.status === "passed").length}/{complianceChecks.length} Verified
                </span>
              </div>

              <div className="space-y-2">
                {complianceChecks.map((check) => (
                  <div
                    key={check.id}
                    className={`flex items-start justify-between gap-2.5 rounded-lg border p-2.5 text-xs transition-colors ${
                      check.status === "passed"
                        ? "border-[#cce5d3] bg-white dark:border-[#2b4c34] dark:bg-[#132218]"
                        : check.status === "failed"
                        ? "border-[#f7c5c5] bg-[#fff5f5] text-[#931f1f] dark:border-[#632727] dark:bg-[#2b1616] dark:text-[#f79b9b]"
                        : "border-[#f7e0bc] bg-[#fffaf2] text-[#844c12] dark:border-[#5a391a] dark:bg-[#281b10] dark:text-[#e9b86f]"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-[#1f3725] dark:text-gray-200">{check.name}</span>
                        {check.mandatory && (
                          <span className="rounded bg-[#dedede] px-1 py-0.2 text-[9px] font-bold uppercase tracking-wider text-[#474747] dark:bg-black/40 dark:text-gray-300">
                            Mandatory
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-[11px] opacity-90 leading-tight">{check.details}</p>
                    </div>

                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        check.status === "passed"
                          ? "bg-[#e2f4e7] text-[#1c6434] dark:bg-[#1d4629] dark:text-[#9de4b2]"
                          : check.status === "failed"
                          ? "bg-[#fce4e4] text-[#a11a1a] dark:bg-[#481c1c] dark:text-[#fa9393]"
                          : "bg-[#fef1d6] text-[#8f5210] dark:bg-[#432d12] dark:text-[#ebb76f]"
                      }`}
                    >
                      {check.status === "passed" ? "✓ Pass" : check.status === "failed" ? "✕ Fail" : "! Notice"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Core Evaluation Pillars */}
          <div className="space-y-2">
            <h5 className="text-[11px] font-bold uppercase tracking-wider text-[#6c7b70] dark:text-gray-400">
              Scoring Factors &amp; Criteria
            </h5>
            <div className="grid gap-2">
              {Object.entries(match.factors || {}).map(([key, factor]) => (
                <div key={key} className={`rounded-xl border p-2.5 transition-all ${getImpactColor(factor.impact)}`}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs font-bold capitalize tracking-tight">{key}</span>
                    <span className="rounded bg-white/70 px-1.5 py-0.5 font-mono text-[11px] font-semibold dark:bg-black/30">
                      {typeof factor.value === "number" && key !== "budget" ? factor.value.toFixed(2) : factor.value}
                    </span>
                  </div>
                  <p className="text-xs leading-snug opacity-95">{factor.reason}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* -------------------------------------------------- */}
        {/* Right Column: Side-by-Side Landed Cost & Logistics */}
        {/* -------------------------------------------------- */}
        <div className="flex flex-col gap-3.5">
          {/* Side-by-Side Landed Cost Comparison Card */}
          <div className="rounded-xl border border-[#d3e5d7] bg-[#f2f8f4] p-3.5 dark:border-[#2f553b] dark:bg-[#1a3323]/40">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h5 className="text-[11px] font-bold uppercase tracking-wider text-[#2a5d37] dark:text-[#8edaa1]">
                Side-by-Side Landed Cost Economics
              </h5>
              {calculation.savingsPercentage !== null && calculation.savingsPercentage > 0 && (
                <span className="rounded-full bg-[#1b5e32] px-2 py-0.5 text-[10px] font-bold text-white shadow-xs dark:bg-[#00e599] dark:text-[#0c1811]">
                  ★ ~{calculation.savingsPercentage}% lower landed cost
                </span>
              )}
            </div>

            {/* Estimates Notice Badge */}
            <div className="mt-2 rounded-lg bg-[#e5eee7] px-2.5 py-1.5 text-[10px] text-[#244b2e] dark:bg-[#152e1d] dark:text-[#9fe2b2]">
              <span className="font-bold uppercase tracking-wider">ESTIMATE:</span> Indicative rates based on regional haulage and CPWD/market indices. Final landed cost verified at weighbridge.
            </div>

            {/* Benchmark vs Reclaimed Landed Rate */}
            <div className="mt-2.5 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-white/90 p-2.5 dark:bg-[#14261b]">
                <span className="block text-[10px] uppercase font-bold text-[#627566] dark:text-gray-400">
                  Virgin Benchmark
                </span>
                <span className="font-archivo text-base font-bold text-[#1e3423] dark:text-white">
                  {calculation.benchmark ? formatINRPerT(calculation.benchmark.landedCostPerT) : "N/A"}
                </span>
                <span className="block text-[9px] text-[#718575] truncate" title={calculation.benchmark?.source}>
                  {calculation.benchmark?.source ?? "Custom specification"}
                </span>
              </div>

              <div className="rounded-lg bg-white/90 p-2.5 dark:bg-[#14261b]">
                <span className="block text-[10px] uppercase font-bold text-[#235832] dark:text-[#8fe0a4]">
                  Reclaimed Landed Cost
                </span>
                <span className="font-archivo text-base font-bold text-[#1b5e32] dark:text-[#00e599]">
                  {calculation.reusableLandedCostPerT !== null
                    ? formatINRPerT(calculation.reusableLandedCostPerT)
                    : `~${formatINRPerT(calculation.reusableLogisticsPerT)} (logistics)`}
                </span>
                <span className="block text-[9px] text-[#718575]">
                  {calculation.isComplete ? "Base asset + transit + yard intake" : "Base price pending quote"}
                </span>
              </div>
            </div>

            {/* Indicative Savings Callout */}
            {calculation.savingsPerT !== null && calculation.savingsPerT > 0 && (
              <div className="mt-2 flex items-center justify-between rounded-lg bg-[#e2f1e6] px-2.5 py-1.5 text-xs text-[#1c532d] dark:bg-[#1f3f2a] dark:text-[#a8e4ba]">
                <span className="font-semibold">Indicative Net Savings:</span>
                <span className="font-bold">
                  {formatINRPerT(calculation.savingsPerT)}
                  {calculation.totalSavings && (
                    <span className="font-normal opacity-90"> · Total {formatINR(calculation.totalSavings)}</span>
                  )}
                </span>
              </div>
            )}

            {/* Itemized Components Breakdown */}
            <div className="mt-2.5 space-y-1 border-t border-[#dce9df] pt-2 text-[11px] text-[#526555] dark:border-steel-800 dark:text-gray-400">
              <div className="flex items-center justify-between">
                <span>• Transport Haulage ({calculation.isDistanceEstimated ? "estimated base" : `${calculation.distanceKm} km route`}):</span>
                <span className="font-mono">{formatINRPerT(calculation.reusableTransportPerT)} <span className="text-[9px] opacity-75">(Estimated)</span></span>
              </div>
              <div className="flex items-center justify-between">
                <span>• Yard Intake &amp; Handling Rate:</span>
                <span className="font-mono">{formatINRPerT(calculation.reusableHandlingPerT)} <span className="text-[9px] opacity-75">(Known charge)</span></span>
              </div>
              {calculation.reusableBaseRatePerT !== null && (
                <div className="flex items-center justify-between">
                  <span>• Reclaimed Asset Base Rate:</span>
                  <span className="font-mono">{formatINRPerT(calculation.reusableBaseRatePerT)}</span>
                </div>
              )}
            </div>

            <p className="mt-2 text-[9px] leading-tight text-[#667a69] dark:text-gray-400">
              {calculation.disclaimer}
            </p>
          </div>

          {/* Delivery Feasibility Card */}
          {delivery && (
            <div className="rounded-xl border border-[#d6dfd7] bg-[#f8faf8] p-3 text-xs dark:border-steel-800 dark:bg-[#15231a]">
              <div className="flex items-center justify-between">
                <span className="font-bold uppercase tracking-wider text-[10px] text-[#2c5333] dark:text-[#8fe0a4]">
                  Delivery Feasibility &amp; Transit Corridor
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${
                    delivery.feasible
                      ? "bg-[#e2f3e6] text-[#1b5e32] dark:bg-[#193b23] dark:text-[#9fe2b2]"
                      : "bg-[#fce5e5] text-[#9b2222] dark:bg-[#461919] dark:text-[#fa9c9c]"
                  }`}
                >
                  {delivery.feasible ? "Feasible Route" : "Infeasible Distance"}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                <div className="rounded bg-white p-2 dark:bg-[#1a2c20]">
                  <span className="text-[#6d7e72] dark:text-gray-400 block text-[10px]">Estimated Route:</span>
                  <span className="font-bold text-[#1f3724] dark:text-white">
                    {delivery.distanceKm} km {delivery.isEstimated ? "(approx)" : ""}
                  </span>
                </div>
                <div className="rounded bg-white p-2 dark:bg-[#1a2c20]">
                  <span className="text-[#6d7e72] dark:text-gray-400 block text-[10px]">Estimated Transit:</span>
                  <span className="font-bold text-[#1f3724] dark:text-white">{delivery.estimatedTransitDays}</span>
                </div>
              </div>
              <p className="mt-1.5 text-[10px] text-[#556959] dark:text-gray-400 leading-tight">
                {delivery.note}
              </p>
            </div>
          )}

          {/* Missing Evidence & Limitations */}
          {(missingEvidence.length > 0 || limitations.length > 0) && (
            <div className="rounded-xl border border-[#eae2d5] bg-[#fcfbf7] p-3 text-xs dark:border-steel-800 dark:bg-[#1f201c]">
              {missingEvidence.length > 0 && (
                <div>
                  <h6 className="font-bold uppercase tracking-wider text-[10px] text-[#82531a] dark:text-[#e4a86b]">
                    Missing Evidence &amp; Verification Gaps
                  </h6>
                  <ul className="mt-1 space-y-0.5 text-[11px] text-[#694e2a] dark:text-gray-300">
                    {missingEvidence.map((item, i) => (
                      <li key={i} className="flex items-start gap-1">
                        <span className="text-[#c77a1e] font-bold">•</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {limitations.length > 0 && (
                <div className={missingEvidence.length > 0 ? "mt-2.5 border-t border-[#ede5d8] pt-2 dark:border-steel-800" : ""}>
                  <h6 className="font-bold uppercase tracking-wider text-[10px] text-[#4d5d51] dark:text-gray-400">
                    Intake Limitations &amp; Verification Scope
                  </h6>
                  <ul className="mt-1 space-y-0.5 text-[11px] text-[#4f5f52] dark:text-gray-300">
                    {limitations.map((lim, i) => (
                      <li key={i} className="flex items-start gap-1">
                        <span className="text-[#6c8270] font-bold">ℹ</span>
                        <span>{lim}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Action Transition Button */}
          {showProceedAction && (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {match.offerId ? (
                <Link
                  to={`/app/negotiations/${match.offerId}`}
                  className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-[#12291a] px-4 text-xs font-semibold text-white shadow-sm transition hover:bg-[#1c3d27] dark:bg-[#315b3c] dark:hover:bg-[#3d6e49]"
                >
                  Open Negotiation &amp; Review Final Terms →
                </Link>
              ) : onProceedRequest ? (
                <button
                  type="button"
                  onClick={onProceedRequest}
                  className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-[#1b5e32] px-4 text-xs font-semibold text-white shadow-sm transition hover:bg-[#23753f] dark:bg-[#2f7547] dark:hover:bg-[#3c8e59]"
                >
                  Request Asset &amp; Start Negotiation →
                </button>
              ) : effectiveListing ? (
                <DirectMaterialRequest
                  listing={effectiveListing}
                  initialQuantity={calculationQty}
                  initialNotes={match.isEligible
                    ? `Requisition via Smart Procurement match (${formatScore(match.score)} score). Quantity: ${calculationQty}t of ${materialTypeLabel(materialType || "steel")}.`
                    : `Requisition with Intake QA Contingency: Material accepted subject to physical weighbridge verification and required test documentation upon arrival.`}
                  buttonLabel={match.isEligible ? "Request Allocation / Terms →" : "Request with QA Contingency →"}
                  buttonClassName={`inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-xs font-semibold text-white shadow-sm transition ${
                    match.isEligible
                      ? "bg-[#1b5e32] hover:bg-[#23753f] dark:bg-[#2f7547] dark:hover:bg-[#3c8e59]"
                      : "bg-amber-700 hover:bg-amber-800"
                  }`}
                />
              ) : match.materialId ? (
                <Link
                  to={`/app/receiver/providers/${match.materialId}`}
                  className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-[#1b5e32] px-4 text-xs font-semibold text-white shadow-sm transition hover:bg-[#23753f] dark:bg-[#2f7547] dark:hover:bg-[#3c8e59]"
                >
                  View Asset &amp; Request Allocation →
                </Link>
              ) : null}

              {match.materialId && (
                <Link
                  to={`/app/receiver/providers/${match.materialId}`}
                  className="inline-flex min-h-10 items-center justify-center rounded-xl border border-steel-200 bg-white px-3 text-xs font-semibold text-steel-700 hover:bg-steel-50 dark:border-steel-700 dark:bg-[#17251d] dark:text-steel-200 dark:hover:bg-white/5"
                  title="View full site provenance, survey photos and location map"
                >
                  Full Passport →
                </Link>
              )}

              {match.materialId && (
                <Link
                  to={`/app/receiver/assistant?materialId=${encodeURIComponent(match.materialId)}&q=${encodeURIComponent(`Procure material (${match.materialId})`)}`}
                  className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-[#B7F34A]/40 bg-[#17251d] px-3.5 text-xs font-bold text-[#B7F34A] shadow-sm transition hover:bg-[#1b382b]"
                  title="Procure with AI Copilot"
                >
                  <span className="size-2 rounded-full bg-[#B7F34A] animate-pulse" />
                  Copilot
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

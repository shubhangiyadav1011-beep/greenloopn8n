/**
 * GreenLoop capacity engine — pure functions over the demo dataset.
 *
 * The core product invariant lives here: a receiver's day-slot capacity is a
 * shared ledger. A request either CONFIRMS (consuming capacity) or goes ON
 * HOLD with an explicit reason; cancelling a confirmed reservation releases
 * capacity and rechecks held requests (earliest-held first, FIFO).
 *
 * No React, no I/O, no clock reads: callers pass `at` (ISO timestamp) and
 * `actor`, and every transition returns appended DomainEvents so the UI and
 * the public-site ledger stay in sync from one source of truth.
 */

import type {
  Actor,
  Allocation,
  AllocationCandidate,
  Booking,
  ConfirmOutcome,
  DomainEvent,
  Evidence,
  GreenLoopDataset,
  MaterialPassport,
  MaterialTypeKey,
  ReceiverDaySlot,
  VerificationRecord,
  ReceiverFacility,
  DemandRecord,
  MaterialOffer,
  GeoPoint,
  MaterialCondition,
  MaterialGrade,
  ProviderMaterialListing
} from "./types.ts";
import { evaluatePassportCompliance, getCategoryEvidenceRequirements } from "./compliance.ts";
import { calculateTransportCostPerT } from "./landedCost.ts";

export { evaluatePassportCompliance, getCategoryEvidenceRequirements };

// ---------------------------------------------------------------------------
// Capacity arithmetic
// ---------------------------------------------------------------------------

/** Tonnes already reserved by CONFIRMED bookings on a slot. */
export function reservedT(bookings: Booking[]): number {
  return round1(sum(bookings.filter((b) => b.status === "confirmed").map((b) => b.tonnesT)));
}

/** Free tonnage in a slot right now. Accepts any booking list — it is
 *  filtered to this slot's confirmed bookings internally. */
export function availableT(slot: ReceiverDaySlot, bookings: Booking[]): number {
  const slotConfirmed = bookings.filter(
    (b) => b.slotId === slot.id && b.status === "confirmed",
  );
  return round1(Math.max(0, slot.capacityT - (slot.reservedT ?? 0) - sum(slotConfirmed.map((b) => b.tonnesT))));
}

export function bookingsForSlot(dataset: GreenLoopDataset, slotId: string): Booking[] {
  return dataset.bookings.filter((b) => b.slotId === slotId);
}

export function findSlot(dataset: GreenLoopDataset, slotId: string): ReceiverDaySlot | undefined {
  return dataset.slots.find((s) => s.id === slotId);
}

export function slotMatchesDemandPeriod(slot: Pick<ReceiverDaySlot, "date">, period: string): boolean {
  let deadline: string | undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(period)) {
    deadline = period;
  } else {
    const quarter = period.match(/^Q([1-4])\s+(\d{4})$/i);
    const namedMonth = period.match(/^([A-Za-z]+)\s+(\d{4})$/);
    const monthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const month = namedMonth ? monthNames.indexOf(namedMonth[1].slice(0, 3).toLowerCase()) + 1 : 0;
    const endMonth = quarter ? Number(quarter[1]) * 3 : month;
    const year = quarter ? Number(quarter[2]) : namedMonth ? Number(namedMonth[2]) : 0;
    if (endMonth > 0 && year > 0) {
      const lastDay = new Date(Date.UTC(year, endMonth, 0)).getUTCDate();
      deadline = `${year}-${String(endMonth).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    }
  }
  return !deadline || slot.date <= deadline;
}

/** Ledger view for one slot: capacity split into confirmed / available / held. */
export function slotLedger(
  dataset: GreenLoopDataset,
  slotId: string,
): { slot: ReceiverDaySlot; reserved: number; available: number; heldT: number } | undefined {
  const slot = findSlot(dataset, slotId);
  if (!slot) return undefined;
  const bookings = bookingsForSlot(dataset, slotId);
  const reserved = reservedT(bookings) + (slot.reservedT ?? 0);
  return {
    slot,
    reserved,
    available: round1(slot.capacityT - reserved),
    heldT: round1(sum(bookings.filter((b) => b.status === "hold").map((b) => b.tonnesT))),
  };
}

export interface MaterialLedger {
  totalT: number;
  committedT: number;
  reservedT: number;
  availableT: number;
  acceptedT?: number;
  rejectedT?: number;
}

export function computeMaterialLedger(
  material: Pick<MaterialPassport, "id" | "quantityT">,
  bookings: Booking[],
  auctionReservedT = 0,
  verifications: VerificationRecord[] = [],
): MaterialLedger {
  const totalT = material.quantityT;
  const activeBookings = bookings.filter((b) => b.materialId === material.id && b.status !== "cancelled");

  let acceptedT = 0;
  let rejectedT = 0;

  for (const b of activeBookings) {
    const v = verifications.find((record) => record.bookingId === b.id);
    if (v) {
      acceptedT += v.acceptedT;
      rejectedT += v.rejectedT;
    }
  }

  const unverifiedActiveBookings = activeBookings.filter(
    (b) => !verifications.some((v) => v.bookingId === b.id)
  );

  const committedT = round1(
    sum(unverifiedActiveBookings.filter((b) => b.status === "confirmed" && b.receiverAcceptedAt).map((b) => b.tonnesT))
  );
  const reservedT = round1(
    sum(unverifiedActiveBookings.filter((b) => b.status === "hold" || (b.status === "confirmed" && !b.receiverAcceptedAt)).map((b) => b.tonnesT)) +
    auctionReservedT
  );
  // Total allocated: active bookings sum preserves rejected quantities in allocation until physically reconciled
  const totalAllocatedT = sum(activeBookings.map((b) => b.tonnesT)) + auctionReservedT;
  const availableT = round1(Math.max(0, totalT - totalAllocatedT));

  return {
    totalT,
    committedT,
    reservedT,
    availableT,
    acceptedT: round1(acceptedT),
    rejectedT: round1(rejectedT),
  };
}

// ---------------------------------------------------------------------------
// Event helpers
// ---------------------------------------------------------------------------

function nextEventId(events: DomainEvent[], offset: number): string {
  const highestId = events.reduce((highest, event) => {
    const numericId = Number(event.id.replace(/^EV-/, ""));
    return Number.isFinite(numericId) ? Math.max(highest, numericId) : highest;
  }, events.length);
  return `EV-${String(highestId + 1 + offset).padStart(3, "0")}`;
}

function makeEvent(
  events: DomainEvent[],
  offset: number,
  kind: string,
  actor: Actor,
  at: string,
  summary: string,
  detail?: string,
  subjectIds: string[] = [],
): DomainEvent {
  return {
    id: nextEventId(events, offset),
    at,
    kind,
    actor,
    summary,
    ...(detail ? { detail } : {}),
    subjectIds,
  };
}

function withEvents(dataset: GreenLoopDataset, events: DomainEvent[]): GreenLoopDataset {
  return { ...dataset, events: [...dataset.events, ...events] };
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

/** Receiver demand signal per material class (0–1); editable demo table. */
const DEMAND_SIGNALS: Record<string, number> = {
  "R-001:concrete": 0.8,
  "R-001:brick": 0.6,
  "R-002:brick": 0.7,
  "R-002:timber": 0.5,
  "R-002:plasterboard": 0.4,
  "R-003:steel": 0.9,
  "R-004:concrete": 0.5,
  "R-004:glass": 0.6,
  "R-004:plasterboard": 0.3,
  "R-005:timber": 0.8,
};

const HANDLING_COST_PER_T: Record<MaterialTypeKey, number> = {
  concrete: 3.5,
  brick: 4.0,
  steel: 6.0,
  timber: 3.0,
  plasterboard: 2.5,
  glass: 5.0,
};

function demandFor(dataset: GreenLoopDataset, receiverId: string, type: MaterialTypeKey): number {
  const open = dataset.demands.filter(d => d.receiverId === receiverId && d.materialType === type && (d.status === "OPEN" || d.status === "PARTIALLY_COVERED"));
  if (!open.length) return DEMAND_SIGNALS[`${receiverId}:${type}`] ?? 0;
  const remaining = open.reduce((sum, d) => sum + Math.max(0, d.requiredT - (d.coveredT ?? dataset.bookings.filter(b => b.demandId === d.id && b.status === "confirmed").reduce((total, b) => total + b.tonnesT, 0))), 0);
  const capacity = dataset.slots.filter(s => s.receiverId === receiverId && s.materialType === type).reduce((sum, s) => sum + s.capacityT, 0);
  return clamp01(remaining / Math.max(remaining, capacity, 1));
}

function suitabilityFor(material: MaterialPassport): number {
  let s = 0.75;
  if (material.grade === "A") s += 0.1;
  else if (material.grade === "B") s += 0.05;
  if (material.condition === "good") s += 0.1;
  else if (material.condition === "fair") s += 0.05;
  else s -= 0.1;
  return clamp01(s);
}

function earliestSlotFor(dataset: GreenLoopDataset, receiverId: string, type: MaterialTypeKey, asOf?: string) {
  const slots = dataset.slots
    .filter((s) => s.receiverId === receiverId && s.materialType === type && (!asOf || s.date >= asOf))
    .sort((a, b) => a.date.localeCompare(b.date));
  return slots[0];
}

function transportCostPerT(distanceKm: number, type?: string): number {
  return calculateTransportCostPerT(distanceKm, type);
}

export function geoDistanceKm(a: GeoPoint, b: GeoPoint): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sinDlat = Math.sin(dLat / 2);
  const sinDlng = Math.sin(dLng / 2);
  const cosLat1 = Math.cos((a.lat * Math.PI) / 180);
  const cosLat2 = Math.cos((b.lat * Math.PI) / 180);
  const h = sinDlat * sinDlat + cosLat1 * cosLat2 * sinDlng * sinDlng;
  return Math.round(2 * R * Math.asin(Math.min(1, Math.sqrt(h))));
}

export interface MatchFilterState {
  materialType?: string;
  locationQuery?: string;
  minimumQuantityT?: number;
  requiredQuantityT?: number;
  maximumBudget?: number;
  neededBy?: string;
  minimumGrade?: MaterialGrade;
  requiredCondition?: MaterialCondition;
  maxDistanceKm?: number;
  requireEvidence?: boolean;
  requireLabReport?: boolean;
  requireVerifiedPassport?: boolean;
  specifications?: string;
}

export function evaluateMatch(
  dataset: GreenLoopDataset,
  context: {
    material: MaterialPassport | ProviderMaterialListing;
    receiver: ReceiverFacility;
    demand?: DemandRecord;
    offer?: MaterialOffer;
    asOf?: string;
    filters?: MatchFilterState;
  }
): AllocationCandidate {
  const { material, receiver, demand, offer, asOf, filters } = context;

  // Unpack material whether it is a MaterialPassport or ProviderMaterialListing
  const matType: MaterialTypeKey = ("type" in material ? material.type : (material as ProviderMaterialListing).materialType);
  const matId: string = ("id" in material ? material.id : (material as ProviderMaterialListing).materialId);
  const matTotalQty: number = ("quantityT" in material ? material.quantityT : (material as ProviderMaterialListing).quantityT);
  const matAvailQty: number = ("availableT" in material ? (material as ProviderMaterialListing).availableT : material.quantityT);
  const matCondition: MaterialCondition = material.condition;
  const matGrade: MaterialGrade = material.grade;
  const matPrice: number | undefined = material.pricePerT;
  const matAvailableFrom: string | undefined = material.availableFrom;
  const matEvidence: Evidence[] = ("evidence" in material && Array.isArray(material.evidence)) ? material.evidence : [];
  const matGeo: GeoPoint | undefined = material.geo;
  const matStatus = ("status" in material ? material.status : "active");

  const hasBothGeos = Boolean(receiver.geo && matGeo);
  const computedDistance = hasBothGeos
    ? geoDistanceKm(receiver.geo!, matGeo!)
    : (receiver.geo ? 0 : receiver.distanceKm);
  const isDistanceKnown = hasBothGeos || (!receiver.geo && receiver.distanceKnown !== false && receiver.distanceKm > 0);

  const out: AllocationCandidate = {
    receiverId: receiver.id,
    materialId: matId,
    demandId: demand?.id,
    offerId: offer?.id,
    suitability: 0,
    demand: 0,
    distanceKm: computedDistance,
    distanceKnown: isDistanceKnown,
    availableT: 0,
    transportCostPerT: transportCostPerT(computedDistance),
    handlingCostPerT: HANDLING_COST_PER_T[matType] ?? 3.5,
    score: 0,
    recommended: false,

    isEligible: true,
    complianceChecks: [],
    missingEvidence: [],
    compatibilityLimitations: [],
    factors: {},
    advantages: [],
    drawbacks: [],
    nonMatchReasons: [],
    missingDataNotes: [],
  };

  // Quantity calculations
  const targetReqQuantity = filters?.requiredQuantityT || demand?.requiredT || (filters?.minimumQuantityT ?? matTotalQty);
  const targetAvailQuantity = offer ? offer.offeredQuantityT : matAvailQty;

  out.requestedQuantityT = targetReqQuantity;
  out.availableQuantityT = targetAvailQuantity;

  const coveragePercent = targetReqQuantity > 0 ? clamp01(targetAvailQuantity / targetReqQuantity) : 0;
  out.coveragePercent = round2(coveragePercent * 100);
  out.remainingQuantityT = Math.max(0, round1(targetReqQuantity - targetAvailQuantity));
  out.isFullMatch = targetAvailQuantity >= targetReqQuantity;
  out.isPartialMatch = targetAvailQuantity > 0 && targetAvailQuantity < targetReqQuantity;

  // Capacity slot check
  const slot = earliestSlotFor(dataset, receiver.id, matType, asOf);
  const availCapacity = slot ? availableT(slot, bookingsForSlot(dataset, slot.id)) : (receiver.dailyIntakeT > 0 ? receiver.dailyIntakeT : 100);
  out.availableT = availCapacity;

  // Delivery feasibility calculation
  let transitDaysEst = "1 business day";
  let deliveryFeasible = true;
  let deliveryNote = "";
  if (computedDistance <= 50) {
    transitDaysEst = "Same day (approx. 2–4 hours)";
    deliveryNote = "Direct local transit corridor with minimal logistics carbon.";
  } else if (computedDistance <= 150) {
    transitDaysEst = "1 business day";
    deliveryNote = "Regional transit corridor via standard freight carrier.";
  } else if (computedDistance <= 300) {
    transitDaysEst = "1–2 business days";
    deliveryNote = "Inter-district transit route; planned staged dispatch recommended.";
  } else {
    transitDaysEst = "2–4 business days (long-haul)";
    deliveryNote = "Long-haul transit (>300 km); requires transport permit and multi-driver scheduling.";
  }

  if (filters?.maxDistanceKm && computedDistance > filters.maxDistanceKm) {
    deliveryFeasible = false;
    deliveryNote = `Transit distance (${computedDistance} km) exceeds maximum limit (${filters.maxDistanceKm} km).`;
  }

  out.deliveryFeasibility = {
    feasible: deliveryFeasible,
    distanceKm: computedDistance,
    isEstimated: !isDistanceKnown,
    estimatedTransitDays: transitDaysEst,
    estimatedHaulagePerT: transportCostPerT(computedDistance),
    note: deliveryNote,
  };

  // Mandatory Compliance & Eligibility Checks
  const checks: NonNullable<AllocationCandidate["complianceChecks"]> = [];

  // Check 1: Material Class Acceptance (Mandatory)
  const normMat = String(matType).toLowerCase().replace(/[^a-z0-9]/g, "");
  const normFilter = filters?.materialType ? filters.materialType.toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  const isTypeAccepted = receiver.acceptedTypes.length === 0
    || receiver.acceptedTypes.includes(matType)
    || receiver.acceptedTypes.some(t => {
      const nt = t.toLowerCase().replace(/[^a-z0-9]/g, "");
      return normMat.includes(nt) || nt.includes(normMat)
        || (normMat.includes("concrete") && nt.includes("concrete"))
        || (normMat.includes("steel") && nt.includes("steel"))
        || (normMat.includes("brick") && nt.includes("brick"))
        || (normMat.includes("timber") && (nt.includes("timber") || nt.includes("wood")));
    });
  const filterTypeMatch = !filters?.materialType
    || matType === filters.materialType
    || (normFilter && (normMat.includes(normFilter) || normFilter.includes(normMat)))
    || (normFilter?.includes("concrete") && normMat.includes("concrete"))
    || (normFilter?.includes("steel") && normMat.includes("steel"))
    || (normFilter?.includes("brick") && normMat.includes("brick"))
    || (normFilter?.includes("timber") && (normMat.includes("timber") || normMat.includes("wood")))
    || (normFilter?.includes("wood") && normMat.includes("timber"));
  if (!isTypeAccepted) {
    checks.push({
      id: "material_type",
      name: "Material Class Acceptance",
      status: "failed",
      mandatory: true,
      details: `Receiver facility does not accept '${matType}' materials.`,
    });
  } else if (!filterTypeMatch) {
    checks.push({
      id: "material_type",
      name: "Material Class Acceptance",
      status: "failed",
      mandatory: true,
      details: `Material type '${matType}' does not match requirement '${filters?.materialType}'.`,
    });
  } else {
    checks.push({
      id: "material_type",
      name: "Material Class Acceptance",
      status: "passed",
      mandatory: true,
      details: `Facility accepts '${matType}' intake.`,
    });
  }

  // Check 2: Asset Active Status (Mandatory)
  const isArchived = Boolean("archivedAt" in material && material.archivedAt);
  const isListingActive = !("listingStatus" in material) || material.listingStatus === "published";
  const isAssetActive = (matStatus as string) !== "cancelled" && !isArchived && isListingActive;
  if (!isAssetActive) {
    checks.push({
      id: "asset_status",
      name: "Asset Active Status",
      status: "failed",
      mandatory: true,
      details: !isListingActive && "listingStatus" in material
        ? `Asset listing is ${material.listingStatus}.`
        : "Material passport is cancelled, committed, or archived.",
    });
  } else {
    checks.push({
      id: "asset_status",
      name: "Asset Active Status",
      status: "passed",
      mandatory: true,
      details: "Asset passport is active and ready for allocation.",
    });
  }

  // Check 3: Demand Status (Mandatory)
  if (demand && ["CANCELLED", "COVERED"].includes(demand.status)) {
    checks.push({
      id: "demand_status",
      name: "Demand Status",
      status: "failed",
      mandatory: true,
      details: `Target demand is ${demand.status.toLowerCase()}.`,
    });
  }

  // Check 4: Capacity Slot Availability (Mandatory)
  if (availCapacity <= 0) {
    checks.push({
      id: "receiving_capacity",
      name: "Intake Slot Capacity",
      status: "failed",
      mandatory: true,
      details: "Receiver facility slot has 0t free intake capacity.",
    });
  } else {
    checks.push({
      id: "receiving_capacity",
      name: "Intake Slot Capacity",
      status: "passed",
      mandatory: true,
      details: `Receiver slot has ${availCapacity.toFixed(1)}t available capacity.`,
    });
  }

  // Check 5: Timeline Feasibility (Mandatory when dates specified)
  const availableFrom = matAvailableFrom || asOf;
  const neededBy = filters?.neededBy || demand?.period;
  if (availableFrom && neededBy) {
    if (availableFrom > neededBy) {
      checks.push({
        id: "timeline",
        name: "Timeline & Dispatch Feasibility",
        status: "failed",
        mandatory: true,
        details: `Material becomes available on ${availableFrom}, after required deadline ${neededBy}.`,
      });
    } else {
      checks.push({
        id: "timeline",
        name: "Timeline & Dispatch Feasibility",
        status: "passed",
        mandatory: true,
        details: `Material is available (${availableFrom}) on or before required date (${neededBy}).`,
      });
    }
  } else {
    checks.push({
      id: "timeline",
      name: "Timeline & Dispatch Feasibility",
      status: "passed",
      mandatory: false,
      details: availableFrom ? `Available from ${availableFrom}. Needed date open.` : "Availability schedule open.",
    });
  }

  // Check 6: Specification Grade Compliance (Mandatory when minimum grade required)
  const GRADE_RANKS: Record<string, number> = { A: 3, B: 2, C: 1 };
  const minGrade = filters?.minimumGrade || (demand?.notes?.toLowerCase().includes("grade a") ? "A" : demand?.notes?.toLowerCase().includes("grade b") ? "B" : undefined);
  if (minGrade) {
    const assetRank = GRADE_RANKS[matGrade] ?? 1;
    const reqRank = GRADE_RANKS[minGrade] ?? 1;
    if (assetRank < reqRank) {
      checks.push({
        id: "specification_grade",
        name: "Specification Grade Compliance",
        status: "failed",
        mandatory: true,
        details: `Asset is Grade ${matGrade}; failed project requirement of minimum Grade ${minGrade}.`,
      });
    } else {
      checks.push({
        id: "specification_grade",
        name: "Specification Grade Compliance",
        status: "passed",
        mandatory: true,
        details: `Asset Grade ${matGrade} satisfies required Grade ${minGrade}.`,
      });
    }
  } else {
    checks.push({
      id: "specification_grade",
      name: "Specification Grade Compliance",
      status: "passed",
      mandatory: false,
      details: `Asset verified as Grade ${matGrade}.`,
    });
  }

  // Check 7: Condition Standard (Mandatory when condition required)
  const CONDITION_RANKS: Record<string, number> = { good: 3, fair: 2, poor: 1 };
  const reqCondition = filters?.requiredCondition;
  if (reqCondition) {
    const assetCondRank = CONDITION_RANKS[matCondition] ?? 1;
    const reqCondRank = CONDITION_RANKS[reqCondition] ?? 1;
    if (assetCondRank < reqCondRank) {
      checks.push({
        id: "condition_compliance",
        name: "Condition Standard",
        status: "failed",
        mandatory: true,
        details: `Asset is in '${matCondition}' condition; failed requirement of '${reqCondition}'.`,
      });
    } else {
      checks.push({
        id: "condition_compliance",
        name: "Condition Standard",
        status: "passed",
        mandatory: true,
        details: `Asset condition '${matCondition}' satisfies '${reqCondition}'.`,
      });
    }
  } else {
    checks.push({
      id: "condition_compliance",
      name: "Condition Standard",
      status: "passed",
      mandatory: false,
      details: `Asset is in '${matCondition}' condition.`,
    });
  }

  // Check 8: Delivery Feasibility & Transit Radius
  if (filters?.maxDistanceKm && computedDistance > filters.maxDistanceKm) {
    checks.push({
      id: "delivery_feasibility",
      name: "Delivery Feasibility",
      status: "failed",
      mandatory: true,
      details: `Transit distance (${computedDistance} km) exceeds maximum limit (${filters.maxDistanceKm} km).`,
    });
  } else if (computedDistance > 300) {
    checks.push({
      id: "delivery_feasibility",
      name: "Delivery Feasibility",
      status: "warning",
      mandatory: false,
      details: `Transit distance (${computedDistance} km) is long-haul; requires freight permits.`,
    });
  } else {
    checks.push({
      id: "delivery_feasibility",
      name: "Delivery Feasibility",
      status: "passed",
      mandatory: Boolean(filters?.maxDistanceKm),
      details: `Transit distance is ${computedDistance} km (${transitDaysEst}).`,
    });
  }

  // Check 9: Documentation & Verification Evidence
  const evidenceKinds = new Set(matEvidence.map((e) => e.kind));
  if (filters?.requireLabReport) {
    const hasLab = evidenceKinds.has("lab-report");
    checks.push({
      id: "evidence_lab",
      name: "Laboratory Test Report",
      status: hasLab ? "passed" : "failed",
      mandatory: true,
      details: hasLab ? "Certified laboratory test report attached." : "Certified laboratory test report missing.",
    });
  }
  if (filters?.requireEvidence) {
    const hasEv = matEvidence.length > 0;
    checks.push({
      id: "evidence_docs",
      name: "Verification Documentation",
      status: hasEv ? "passed" : "failed",
      mandatory: true,
      details: hasEv ? `${matEvidence.length} verification document(s) attached.` : "No verification documents attached.",
    });
  }

  // Check 10: Passport Verification Status & Category Evidence Compliance
  const compliance = evaluatePassportCompliance(material as MaterialPassport);
  const passportVerification = ("verificationStatus" in material && material.verificationStatus) ||
    ("status" in material && material.status === "verified" ? "verified" : "unverified");
  const isPassportRejected = passportVerification === "rejected";

  if (isPassportRejected) {
    checks.push({
      id: "passport_verification",
      name: "Passport Verification Status",
      status: "failed",
      mandatory: true,
      details: `Material passport verification was rejected: ${("rejectionReason" in material && material.rejectionReason) || "Verification criteria failed."}`,
    });
  } else if (filters?.requireVerifiedPassport) {
    const isVerified = passportVerification === "verified" || ("status" in material && material.status === "verified");
    checks.push({
      id: "passport_verification",
      name: "Passport Verification Status",
      status: isVerified ? "passed" : "failed",
      mandatory: true,
      details: isVerified ? "Passport verified and certified compliant." : "Passport is pending verification review.",
    });
  }

  if (filters?.requireEvidence || filters?.requireLabReport) {
    checks.push({
      id: "category_compliance",
      name: "Category Evidence Compliance",
      status: compliance.isCompliant ? "passed" : "failed",
      mandatory: true,
      details: compliance.isCompliant
        ? `Compliant with ${matType} evidence standards.`
        : `Non-compliant: ${compliance.missingMandatory.join("; ") || "Mandatory evidence missing or rejected."}`,
    });
  }

  out.complianceChecks = checks;

  // Mandatory eligibility evaluation: NEVER let high score override failed requirement!
  const failedMandatoryChecks = checks.filter((c) => c.mandatory && c.status === "failed");
  out.isEligible = failedMandatoryChecks.length === 0;

  if (!out.isEligible) {
    for (const check of failedMandatoryChecks) {
      out.nonMatchReasons!.push(`Failed mandatory requirement: ${check.details}`);
    }
  }

  // Missing Evidence Analysis
  const missingEv: string[] = [];
  if (!evidenceKinds.has("survey-sheet")) {
    missingEv.push("Pre-demolition site survey sheet missing.");
  }
  if (!evidenceKinds.has("site-photo")) {
    missingEv.push("Visual photographic inspection evidence missing.");
  }
  if (["steel", "concrete"].includes(matType) && !evidenceKinds.has("lab-report")) {
    missingEv.push("Certified structural laboratory test report / chemical assay not attached.");
  }
  if (!evidenceKinds.has("weighbridge-ticket")) {
    missingEv.push("Certified weighbridge intake ticket pending delivery verification.");
  }
  for (const missing of compliance.missingMandatory) {
    if (!missingEv.includes(missing)) {
      missingEv.push(missing);
    }
  }
  out.missingEvidence = missingEv;

  // Compatibility Limitations
  const limits: string[] = [
    "Pre-demolition survey tonnage estimates are subject to physical weighbridge verification upon yard intake.",
  ];
  for (const lim of compliance.limitations) {
    if (!limits.includes(lim)) {
      limits.push(lim);
    }
  }
  if (targetReqQuantity > 50) {
    limits.push(`Bulk load (${targetReqQuantity} t) requires multi-truck staged dispatch over scheduled delivery windows.`);
  }
  if (availCapacity < targetReqQuantity) {
    limits.push(`Receiver facility daily intake capacity (${availCapacity} t) requires multi-day intake scheduling.`);
  }
  if (!isDistanceKnown) {
    limits.push("Transit distance and haulage rates are estimated; exact delivery address required to confirm route.");
  }
  out.compatibilityLimitations = limits;

  // Calculate Base Factors
  const suitability = suitabilityFor({
    ...material,
    grade: matGrade,
    condition: matCondition,
    type: matType,
  } as MaterialPassport);
  out.suitability = round2(suitability);

  if (out.factors) {
    out.factors.suitability = {
      value: suitability,
      score: suitability,
      impact: suitability >= 0.75 ? "positive" : "neutral",
      reason: `Based on material grade (${matGrade}) and condition (${matCondition}).`,
    };
  }

  const demandScore = demand
    ? clamp01(targetReqQuantity / Math.max(availCapacity, targetReqQuantity, 1))
    : demandFor(dataset, receiver.id, matType);
  out.demand = round2(demandScore);
  if (out.factors) {
    out.factors.demand = {
      value: demandScore,
      score: demandScore,
      impact: demandScore >= 0.5 ? "positive" : "neutral",
      reason: "Reflects the receiver's demand signal and intake capacity for this material.",
    };
  }

  const availabilityRatio = clamp01(targetReqQuantity === 0 ? 1 : targetAvailQuantity / targetReqQuantity);
  if (out.factors) {
    out.factors.availability = {
      value: availCapacity,
      score: availabilityRatio,
      impact: availabilityRatio >= 1 ? "positive" : availabilityRatio > 0 ? "neutral" : "negative",
      reason: `Receiver slot has ${availCapacity.toFixed(1)}t available capacity.`,
    };
  }

  const proximity = isDistanceKnown === false ? 0.0 : clamp01(1 - computedDistance / 80);
  if (out.factors) {
    out.factors.proximity = {
      value: isDistanceKnown === false ? "Unknown" : `${computedDistance} km`,
      score: proximity,
      impact: isDistanceKnown === false ? "unknown" : proximity >= 0.5 ? "positive" : "negative",
      reason: isDistanceKnown === false ? "Location is unavailable, so distance could not be evaluated; no proximity score awarded." : "Distance relative to the 80km standard.",
    };
    out.factors.distance = out.factors.proximity;

    out.factors.compatibility = {
      value: isTypeAccepted ? `${matType} accepted (Grade ${matGrade})` : `${matType} unaccepted`,
      score: isTypeAccepted ? suitability : 0,
      impact: isTypeAccepted ? "positive" : "negative",
      reason: isTypeAccepted ? `Facility processes ${matType}; suitability rated at ${Math.round(suitability * 100)}% based on Grade ${matGrade} (${matCondition}).` : `Receiver facility does not accept ${matType} materials.`,
    };

    out.factors.quantity = {
      value: `${targetAvailQuantity.toFixed(1)}t avail / ${targetReqQuantity.toFixed(1)}t req`,
      score: clamp01(targetReqQuantity > 0 ? targetAvailQuantity / targetReqQuantity : 1),
      impact: out.isFullMatch ? "positive" : out.isPartialMatch ? "neutral" : "negative",
      reason: out.isFullMatch ? `Full requested quantity (${targetReqQuantity.toFixed(1)} t) can be supplied.` : out.isPartialMatch ? `Partial supply: ${targetAvailQuantity.toFixed(1)} t of ${targetReqQuantity.toFixed(1)} t (${out.coveragePercent}%).` : `Available quantity (${targetAvailQuantity.toFixed(1)} t) does not satisfy requirement.`,
    };
  }

  if (isDistanceKnown === false) {
    out.missingDataNotes!.push("Location is unavailable, so distance could not be evaluated.");
    out.drawbacks?.push("Transit distance unconfirmed — location coordinates missing.");
  }

  // Price vs Budget
  let priceFitScore = 1.0;
  const price = offer?.pricePerT ?? matPrice;
  const budget = filters?.maximumBudget ?? demand?.budgetPerT;

  if (price !== undefined && budget !== undefined) {
    if (price <= budget) {
      priceFitScore = 1.0;
      out.advantages?.push("Price is within budget.");
      if (out.factors) {
        out.factors.budget = {
          value: `₹${price}/t vs ₹${budget}/t`, score: priceFitScore, impact: "positive", reason: "Price is within budget limit.",
        };
      }
    } else {
      priceFitScore = clamp01(budget / price);
      out.drawbacks?.push(`Offered price (₹${price}/t) exceeds the stated budget (₹${budget}/t).`);
      if (out.factors) {
        out.factors.budget = {
          value: `₹${price}/t vs ₹${budget}/t`, score: priceFitScore, impact: "negative", reason: "Price exceeds budget limit.",
        };
      }
    }
  } else {
    out.missingDataNotes!.push("Price or budget information is missing.");
    if (out.factors) {
      out.factors.budget = {
        value: "Unknown", score: 0.5, impact: "unknown", reason: "Price or budget information is missing.",
      };
    }
  }

  if (matEvidence.length === 0) {
    out.missingDataNotes!.push("No evidence documents attached.");
  }

  // Calculate final score
  let totalWeight = 0;
  let accumulatedScore = 0;

  accumulatedScore += 0.35 * suitability; totalWeight += 0.35;
  accumulatedScore += 0.25 * availabilityRatio; totalWeight += 0.25;
  accumulatedScore += 0.20 * proximity; totalWeight += 0.20;
  accumulatedScore += 0.20 * demandScore; totalWeight += 0.20;

  if (price !== undefined && budget !== undefined) {
    accumulatedScore += 0.20 * priceFitScore; totalWeight += 0.20;
  }
  if (matEvidence.length > 0) {
    accumulatedScore += 0.05 * 1.0; totalWeight += 0.05;
  }

  // CRITICAL RULE: If not eligible, score is strictly 0 and recommended is false
  out.score = out.isEligible ? round3(accumulatedScore / totalWeight) : 0;
  out.recommended = Boolean(out.isEligible && availabilityRatio >= 1 && priceFitScore >= 0.8 && deliveryFeasible);

  // Build Summaries
  if (!out.isEligible) {
    out.summary = `Not eligible: failed ${failedMandatoryChecks.length} mandatory requirement(s).`;
  } else if (out.score >= 0.75) {
    out.summary = "Strong match based on specification, availability, and delivery feasibility.";
  } else if (out.score >= 0.5) {
    out.summary = "Moderate match. Some constraints may require negotiation.";
  } else {
    out.summary = "Weak match.";
  }

  if (out.isFullMatch) {
    out.advantages?.push("Full quantity requested is available.");
  } else if (out.isPartialMatch) {
    out.drawbacks?.push(`Only ${out.coveragePercent}% of the requested quantity is available.`);
    out.nonMatchReasons?.push(`Weak match: provider can fulfil only ${out.coveragePercent}% of the requested quantity.`);
  }

  if (availCapacity < targetReqQuantity) {
    out.drawbacks?.push(`Insufficient receiving capacity for the full requested load (${availCapacity}t available).`);
  }

  return out;
}

export function contextualMatch(
  dataset: GreenLoopDataset,
  context: {
    materialId?: string;
    receiverId?: string;
    demandId?: string;
    offerId?: string;
  },
  filters?: MatchFilterState,
  asOf?: string
): AllocationCandidate[] {
  let candidates: AllocationCandidate[] = [];

  const targetMaterial = context.materialId
    ? (dataset.materials.find((m) => m.id === context.materialId) ||
       dataset.providerListings?.find((l) => l.materialId === context.materialId))
    : undefined;
  const targetReceiver = context.receiverId
    ? (dataset.receivers.find((r) => r.id === context.receiverId) || dataset.receivers[0])
    : undefined;
  const targetDemand = context.demandId ? dataset.demands.find((d) => d.id === context.demandId) : undefined;
  const targetOffer = context.offerId ? dataset.offers?.find((o) => o.id === context.offerId) : undefined;

  // Pool of available materials: both dataset.materials and dataset.providerListings
  const candidateMaterials: (MaterialPassport | ProviderMaterialListing)[] = [...dataset.materials];
  if (dataset.providerListings) {
    for (const listing of dataset.providerListings) {
      if (!candidateMaterials.some((m) => ("id" in m ? m.id : m.materialId) === listing.materialId)) {
        candidateMaterials.push(listing);
      }
    }
  }

  if (targetMaterial && !targetDemand && !targetReceiver) {
    // Provider Material -> All Receivers (and their Demands)
    candidates = dataset.receivers.map((rec) => {
      const matType = "type" in targetMaterial ? targetMaterial.type : targetMaterial.materialType;
      const demand = dataset.demands.find(
        (d) => d.receiverId === rec.id && d.materialType === matType && ["OPEN", "PARTIALLY_COVERED"].includes(d.status)
      );
      return evaluateMatch(dataset, { material: targetMaterial, receiver: rec, demand, asOf, filters });
    });
  } else if (targetDemand && !targetMaterial && !targetOffer) {
    // Receiver Request -> All Provider Materials
    const receiver = dataset.receivers.find((r) => r.id === targetDemand.receiverId) || {
      id: targetDemand.receiverId || "R-default",
      name: "Receiver Facility",
      location: targetDemand.location,
      dailyIntakeT: 100,
      currentStockT: 0,
      acceptedTypes: [targetDemand.materialType],
      distanceKm: 25,
      distanceKnown: true,
    };
    candidates = candidateMaterials.map((mat) => {
      return evaluateMatch(dataset, { material: mat, receiver, demand: targetDemand, asOf, filters });
    });
  } else if (targetOffer && targetDemand) {
    // Receiver Requirement -> Provider Offer
    const receiver = dataset.receivers.find((r) => r.id === targetDemand.receiverId);
    const material = candidateMaterials.find((m) => ("id" in m ? m.id : m.materialId) === targetOffer.passportId);
    if (receiver && material) {
      candidates = [evaluateMatch(dataset, { material, receiver, demand: targetDemand, offer: targetOffer, asOf, filters })];
    }
  } else if (targetMaterial && targetReceiver) {
    // Specific Material -> Specific Receiver
    const matType = "type" in targetMaterial ? targetMaterial.type : targetMaterial.materialType;
    const demand = targetDemand || dataset.demands.find((d) => d.receiverId === targetReceiver.id && d.materialType === matType && ["OPEN", "PARTIALLY_COVERED"].includes(d.status));
    candidates = [evaluateMatch(dataset, { material: targetMaterial, receiver: targetReceiver, demand, asOf, filters })];
  } else if (targetReceiver && !targetMaterial) {
    // Receiver -> All Materials (Smart Procurement)
    candidates = candidateMaterials.map((mat) => {
      return evaluateMatch(dataset, { material: mat, receiver: targetReceiver, demand: targetDemand, asOf, filters });
    });
  } else {
    // Fallback
    if (targetMaterial) {
      candidates = dataset.receivers.map((rec) => evaluateMatch(dataset, { material: targetMaterial, receiver: rec, asOf, filters }));
    }
  }

  // Tie-breaking order:
  // 1. isEligible (true first - NEVER let high score override failed requirement!)
  // 2. score (highest first)
  // 3. coveragePercent (highest first)
  // 4. distanceKm (closest first)
  // 5. stable ID
  return candidates.sort((a, b) => {
    if (a.isEligible !== b.isEligible) return a.isEligible ? -1 : 1;
    if (Math.abs(b.score - a.score) > 0.001) return b.score - a.score;
    const aCov = a.coveragePercent ?? 0;
    const bCov = b.coveragePercent ?? 0;
    if (Math.abs(bCov - aCov) > 0.1) return bCov - aCov;
    if (a.distanceKm !== b.distanceKm) return a.distanceKm - b.distanceKm;

    return (a.receiverId || "").localeCompare(b.receiverId || "") || (a.materialId || "").localeCompare(b.materialId || "");
  });
}

export function smartProcurementMatch(
  dataset: GreenLoopDataset,
  receiver: ReceiverFacility,
  requirement: {
    materialType: MaterialTypeKey;
    requiredQuantityT: number;
    budgetPerT?: number;
    minimumGrade?: MaterialGrade;
    requiredCondition?: MaterialCondition;
    neededBy?: string;
    maxDistanceKm?: number;
    requireEvidence?: boolean;
    requireLabReport?: boolean;
  }
): AllocationCandidate[] {
  const filters: MatchFilterState = {
    materialType: requirement.materialType,
    requiredQuantityT: requirement.requiredQuantityT,
    maximumBudget: requirement.budgetPerT,
    minimumGrade: requirement.minimumGrade,
    requiredCondition: requirement.requiredCondition,
    neededBy: requirement.neededBy,
    maxDistanceKm: requirement.maxDistanceKm,
    requireEvidence: requirement.requireEvidence,
    requireLabReport: requirement.requireLabReport,
  };

  return contextualMatch(dataset, { receiverId: receiver.id }, filters);
}

/**
 * Score every receiver that can process the material. Deterministic composite:
 * suitability 40% · demand 25% · availability 20% · proximity 15%.
 * `recommended` marks the best-scored candidate with room for the load
 * (or, if none fits, the best score overall for transparency).
 */
export function computeMatch(
  dataset: GreenLoopDataset,
  materialId: string,
  asOf?: string,
): AllocationCandidate[] {
  const candidates = contextualMatch(dataset, { materialId }, undefined, asOf);
  // Replicate previous `recommended` logic exactly for backward compatibility if needed:
  // The old logic found all fitting candidates (avail >= qty) and picked the best score.
  // Actually, evaluateMatch already calculates `recommended`, but to perfectly mirror:
  const material = dataset.materials.find(m => m.id === materialId);
  if (material) {
     const fitting = candidates.filter((c) => c.availableT >= material.quantityT);
     const best = (fitting.length > 0 ? fitting : candidates)[0];
     if (best) best.recommended = true;
  }
  return candidates;
}

// ---------------------------------------------------------------------------
// Requests: confirm or hold
// ---------------------------------------------------------------------------

export interface RequestCapacityOutput {
  allocation: Allocation;
  booking: Booking;
  outcome: ConfirmOutcome;
}

/**
 * Attempt to reserve `tonnesT` on a receiver slot. Confirms when free tonnage
 * covers the request; otherwise records a HOLD with an explicit reason and
 * zeroed available-after so the UI can show exactly why it did not fit.
 */
export function requestCapacity(
  dataset: GreenLoopDataset,
  input: {
    materialId: string;
    receiverId: string;
    slotId: string;
    tonnesT: number;
    actor: Actor;
    at: string;
  },
): EngineOutput<RequestCapacityOutput> {
  const slot = findSlot(dataset, input.slotId);
  const material = dataset.materials.find((m) => m.id === input.materialId);
  if (!slot || !material) throw new Error(`Unknown slot/material: ${input.slotId}/${input.materialId}`);

  const events: DomainEvent[] = [];
  const before = availableT(slot, bookingsForSlot(dataset, slot.id));
  const fits = input.tonnesT <= before + 1e-9;
  const after = fits ? round1(before - input.tonnesT) : 0;
  const outcome: ConfirmOutcome = fits ? "confirmed" : "hold";
  const holdReason = fits
    ? undefined
    : `Insufficient available capacity — ${input.tonnesT.toFixed(1)} t requested, ${before.toFixed(1)} t available`;

  const allocation: Allocation = {
    id: `AL-${dataset.allocations.length + 1}`,
    materialId: material.id,
    receiverId: input.receiverId,
    slotId: slot.id,
    requestedT: input.tonnesT,
    status: outcome,
    ...(holdReason ? { holdReason } : {}),
    capacityBeforeT: before,
    capacityAfterT: after,
    decidedAt: input.at,
    updatedAt: input.at,
    candidates: computeMatch(dataset, material.id, input.at.slice(0, 10)),
  };

  const booking: Booking = {
    id: `BK-${dataset.bookings.length + 1}`,
    allocationId: allocation.id,
    slotId: slot.id,
    receiverId: input.receiverId,
    materialId: material.id,
    tonnesT: input.tonnesT,
    status: outcome,
    ...(holdReason ? { holdReason } : {}),
    capacityBeforeT: before,
    capacityAfterT: after,
    createdAt: input.at,
    updatedAt: input.at,
  };

  events.push(
    makeEvent(
      dataset.events,
      0,
      "allocation.requested",
      input.actor,
      input.at,
      `${input.tonnesT.toFixed(1)} t of ${material.type} requested at ${receiverName(dataset, input.receiverId)}`,
      undefined,
      [material.id, input.receiverId, allocation.id],
    ),
  );
  events.push(
    makeEvent(
      dataset.events,
      1,
      outcome === "confirmed" ? "allocation.confirmed" : "allocation.hold",
      input.actor,
      input.at,
      outcome === "confirmed"
        ? `Confirmed — capacity ${before.toFixed(1)} t → ${after.toFixed(1)} t available`
        : `HOLD — ${holdReason}`,
      undefined,
      [material.id, input.receiverId, allocation.id],
    ),
  );

  const materialStatus = fits ? "reserved" : "passport-ready";
  const next: GreenLoopDataset = {
    ...withEvents(dataset, events),
    allocations: [...dataset.allocations, allocation],
    bookings: [...dataset.bookings, booking],
    materials: dataset.materials.map((m) =>
      m.id === material.id ? { ...m, status: materialStatus } : m,
    ),
  };
  return { dataset: next, events, output: { allocation, booking, outcome } };
}

// ---------------------------------------------------------------------------
// Release + recheck
// ---------------------------------------------------------------------------

export interface ReleaseOutput {
  cancelledBooking: Booking;
  reconfirmed: Array<{ allocationId: string; bookingId: string; materialId: string; tonnesT: number }>;
}

/**
 * Cancel a confirmed booking (its tonnes return to the ledger), mark the
 * material passport-ready again, then recheck held requests on the same slot.
 */
export function releaseCapacity(
  dataset: GreenLoopDataset,
  input: { bookingId: string; actor: Actor; at: string; reason?: string },
): EngineOutput<ReleaseOutput> {
  const booking = dataset.bookings.find((b) => b.id === input.bookingId);
  if (!booking) throw new Error(`Unknown booking: ${input.bookingId}`);
  if ((booking.status !== "confirmed" && booking.status !== "hold") || booking.loadRef || dataset.events.some((event) => event.kind === "load.dispatched" && event.subjectIds.includes(booking.id))) {
    return { dataset, events: [], output: { cancelledBooking: booking, reconfirmed: [] } };
  }

  const events: DomainEvent[] = [];
  const cancelledBooking: Booking = {
    ...booking,
    status: "cancelled",
    updatedAt: input.at,
    cancelledAt: input.at,
    ...(input.reason ? { cancelledReason: input.reason } : {}),
  };

  events.push(
    makeEvent(
      dataset.events,
      0,
      booking.status === "confirmed" ? "capacity.released" : "booking.cancelled",
      input.actor,
      input.at,
      booking.status === "confirmed" ? `${booking.tonnesT.toFixed(1)} t released at ${receiverName(dataset, booking.receiverId)}` : `${booking.tonnesT.toFixed(1)} t held request cancelled at ${receiverName(dataset, booking.receiverId)}`,
      input.reason,
      [booking.materialId, booking.receiverId, booking.id],
    ),
  );

  let next: GreenLoopDataset = {
    ...withEvents(dataset, events),
    bookings: dataset.bookings.map((b) => (b.id === booking.id ? cancelledBooking : b)),
    allocations: dataset.allocations.map((a) =>
      a.id === booking.allocationId
        ? { ...a, status: "cancelled" as const, updatedAt: input.at }
        : a,
    ),
    materials: dataset.materials.map((m) => {
      if (m.id !== booking.materialId || m.status === "verified" || m.status === "dispatched") return m;
      const otherBookings = dataset.bookings.filter((b) => b.materialId === m.id && b.id !== booking.id && b.status !== "cancelled");
      if (otherBookings.length > 0) {
        return { ...m, status: otherBookings.some((b) => b.status === "confirmed") ? ("allocated" as const) : ("reserved" as const) };
      }
      return { ...m, status: "passport-ready" as const };
    }),
  };

  const recheck = booking.status === "confirmed"
    ? recheckHolds(next, { slotId: booking.slotId, actor: input.actor, at: input.at })
    : { dataset: next, events: [], output: { reconfirmed: [] } };
  next = recheck.dataset;
  events.push(...recheck.events);

  return {
    dataset: next,
    events,
    output: { cancelledBooking, reconfirmed: recheck.output.reconfirmed },
  };
}

export interface RecheckOutput {
  rechecked: number;
  reconfirmed: Array<{ allocationId: string; bookingId: string; materialId: string; tonnesT: number }>;
}

/**
 * Recheck held requests on a slot, earliest-held first. Each confirmation
 * consumes capacity before the next hold is evaluated, so the ledger can
 * never be over-booked.
 */
export function recheckHolds(
  dataset: GreenLoopDataset,
  input: { slotId: string; actor: Actor; at: string },
): EngineOutput<RecheckOutput> {
  const slot = findSlot(dataset, input.slotId);
  if (!slot) throw new Error(`Unknown slot: ${input.slotId}`);

  const holds = dataset.bookings
    .filter((b) => b.slotId === slot.id && b.status === "hold")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const events: DomainEvent[] = [];
  const reconfirmed: RecheckOutput["reconfirmed"] = [];
  let bookings = [...dataset.bookings];
  let materials = [...dataset.materials];
  let allocations = [...dataset.allocations];

  for (const hold of holds) {
    const avail = availableT(slot, bookings);
    const material = dataset.materials.find((item) => item.id === hold.materialId);
    const committedMaterialT = bookings
      .filter((booking) => booking.materialId === hold.materialId && booking.status === "confirmed")
      .reduce((total, booking) => total + booking.tonnesT, 0);
    const materialRemainingT = Math.max(0, (material?.quantityT ?? 0) - committedMaterialT);
    const demand = hold.demandId ? dataset.demands.find((item) => item.id === hold.demandId) : undefined;
    const committedDemandT = hold.demandId
      ? bookings.filter((booking) => booking.demandId === hold.demandId && booking.status === "confirmed")
        .reduce((total, booking) => total + booking.tonnesT, 0)
      : 0;
    const demandRemainingT = demand ? Math.max(0, demand.requiredT - committedDemandT) : Infinity;
    if (hold.tonnesT > avail + 1e-9 || hold.tonnesT > materialRemainingT + 1e-9 || hold.demandId && !demand || hold.tonnesT > demandRemainingT + 1e-9) continue;

    const after = round1(avail - hold.tonnesT);
    bookings = bookings.map((b) =>
      b.id === hold.id
        ? { ...b, status: "confirmed" as const, capacityBeforeT: avail, capacityAfterT: after, updatedAt: input.at, holdReason: undefined }
        : b,
    );
    allocations = allocations.map((a) =>
      a.id === hold.allocationId
        ? { ...a, status: "confirmed" as const, capacityBeforeT: avail, capacityAfterT: after, updatedAt: input.at, holdReason: undefined }
        : a,
    );
    materials = materials.map((m) => (m.id === hold.materialId ? { ...m, status: "reserved" as const } : m));

    events.push(
      makeEvent(
        dataset.events,
        events.length,
        "allocation.recheck.confirmed",
        input.actor,
        input.at,
        `Recheck confirmed — ${hold.tonnesT.toFixed(1)} t now fits (${avail.toFixed(1)} t available)`,
        undefined,
        [hold.materialId, hold.receiverId, hold.id],
      ),
    );
    reconfirmed.push({
      allocationId: hold.allocationId,
      bookingId: hold.id,
      materialId: hold.materialId,
      tonnesT: hold.tonnesT,
    });
  }

  if (reconfirmed.length === 0) {
    return { dataset, events: [], output: { rechecked: holds.length, reconfirmed: [] } };
  }

  return {
    dataset: {
      ...withEvents(dataset, events),
      bookings,
      materials,
      allocations,
    },
    events,
    output: { rechecked: holds.length, reconfirmed },
  };
}

// ---------------------------------------------------------------------------
// Dispatch + verification
// ---------------------------------------------------------------------------

export interface DispatchOutput {
  loadRef?: string;
}

/** Mark a confirmed booking dispatched and stamp the load reference. */
export function dispatchLoad(
  dataset: GreenLoopDataset,
  input: { bookingId: string; actor: Actor; at: string; documents?: Evidence[] },
): EngineOutput<DispatchOutput> {
  const booking = dataset.bookings.find((b) => b.id === input.bookingId);
  if (!booking) throw new Error(`Unknown booking: ${input.bookingId}`);
  const alreadyDispatched = booking.status !== "confirmed" || !booking.receiverAcceptedAt || Boolean(booking.loadRef) ||
    dataset.events.some((event) => event.kind === "load.dispatched" && event.subjectIds.includes(booking.id));
  if (alreadyDispatched) return { dataset, events: [], output: {} };

  const usedLoadRefs = new Set([
    ...dataset.bookings.map((item) => item.loadRef).filter((ref): ref is string => Boolean(ref)),
    ...dataset.events.flatMap((event) => event.summary.match(/LOAD-\d+/g) ?? []),
  ]);
  let loadNumber = 1001;
  while (usedLoadRefs.has(`LOAD-${loadNumber}`)) loadNumber += 1;
  const loadRef = `LOAD-${loadNumber}`;

  const detail = input.documents && input.documents.length > 0
    ? `Documentation: ${input.documents.map((d) => d.label).join(", ")}`
    : undefined;

  const event = makeEvent(
    dataset.events,
    0,
    "load.dispatched",
    input.actor,
    input.at,
    `${loadRef} dispatched — ${booking.tonnesT.toFixed(1)} t to ${receiverName(dataset, booking.receiverId)}`,
    detail,
    [booking.materialId, booking.receiverId, booking.id],
  );

  return {
    dataset: {
      ...withEvents(dataset, [event]),
      bookings: dataset.bookings.map((item) =>
        item.id === booking.id ? { ...item, loadRef, updatedAt: input.at } : item,
      ),
      materials: dataset.materials.map((m) =>
        m.id === booking.materialId ? { ...m, status: "dispatched" as const } : m,
      ),
    },
    events: [event],
    output: { loadRef },
  };
}

export interface DeliveryInput {
  bookingId: string;
  actualT: number;
  acceptedT: number;
  rejectReason?: string;
  evidence: Evidence[];
  actor: Actor;
  at: string;
}

export interface DeliveryOutput {
  verificationId: string;
  loadRef: string;
  status: "verified" | "rejected";
}

/** Record the weighbridge reconciliation for a dispatched load. */
export function recordDelivery(
  dataset: GreenLoopDataset,
  input: DeliveryInput,
): EngineOutput<DeliveryOutput> {
  const booking = dataset.bookings.find((b) => b.id === input.bookingId);
  if (!booking) throw new Error(`Unknown booking: ${input.bookingId}`);
  if (booking.status !== "confirmed" || !booking.loadRef ||
    dataset.verifications.some((record) => record.bookingId === booking.id)) {
    return { dataset, events: [], output: { verificationId: "", loadRef: booking.loadRef ?? "", status: "verified" } };
  }

  const rejectedT = round1(Math.max(0, input.actualT - input.acceptedT));
  const status = rejectedT > 0 && input.acceptedT === 0 ? "rejected" : "verified";
  const loadRef = booking.loadRef;

  const verification: VerificationRecord = {
    id: `VR-${dataset.verifications.length + 1}`,
    bookingId: booking.id,
    loadRef,
    materialId: booking.materialId,
    receiverId: booking.receiverId,
    plannedT: booking.tonnesT,
    actualT: round1(input.actualT),
    acceptedT: round1(input.acceptedT),
    rejectedT,
    ...(input.rejectReason ? { rejectReason: input.rejectReason } : {}),
    status,
    verifiedAt: input.at,
    evidence: input.evidence,
  };

  const event = makeEvent(
    dataset.events,
    0,
    status === "verified" ? "verification.completed" : "verification.rejected",
    input.actor,
    input.at,
    `${loadRef} verified — planned ${booking.tonnesT.toFixed(1)} t, accepted ${verification.acceptedT.toFixed(1)} t`,
    rejectedT > 0 ? `${rejectedT.toFixed(1)} t rejected${input.rejectReason ? `: ${input.rejectReason}` : ""}` : undefined,
    [booking.materialId, booking.receiverId, booking.id],
  );

  return {
    dataset: {
      ...withEvents(dataset, [event]),
      verifications: [...dataset.verifications, verification],
      materials: dataset.materials.map((m) => {
        if (m.id !== booking.materialId) return m;
        const otherActiveBookings = dataset.bookings.filter(
          (b) => b.materialId === m.id && b.id !== booking.id && b.status !== "cancelled"
        );
        const remainingT = Math.max(
          0,
          m.quantityT - booking.tonnesT - otherActiveBookings.reduce((sum, b) => sum + b.tonnesT, 0)
        );
        const isFullyDelivered = remainingT <= 0.05 && otherActiveBookings.length === 0;
        return isFullyDelivered ? { ...m, status: "verified" as const } : m;
      }),
    },
    events: [event],
    output: { verificationId: verification.id, loadRef, status },
  };
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

export interface EngineOutput<T> {
  dataset: GreenLoopDataset;
  events: DomainEvent[];
  output: T;
}

function sum(values: number[]): number {
  return values.reduce((acc, v) => acc + v, 0);
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function receiverName(dataset: GreenLoopDataset, receiverId: string): string {
  return dataset.receivers.find((r) => r.id === receiverId)?.name ?? receiverId;
}

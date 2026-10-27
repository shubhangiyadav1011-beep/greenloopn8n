/**
 * GreenLoop Contextual Procurement Assistant
 *
 * Deterministic NLP entity extraction, intent recognition, contextual recommendations,
 * landed-cost comparisons, and order confirmation models.
 * Reuses existing GreenLoop matching (capacity.ts), landed cost (landedCost.ts),
 * and compliance verification (compliance.ts).
 */

import type {
  GreenLoopDataset,
  MaterialPassport,
  ProviderMaterialListing,
  MaterialTypeKey,
  MaterialGrade,
  Booking,
  AllocationCandidate,
} from "./types.ts";
import {
  evaluateMatch,
} from "./capacity.ts";
import {
  calculateLandedCost,
  type LandedCostCalculation,
  type VirginMaterialBenchmark,
} from "./landedCost.ts";
import {
  evaluatePassportCompliance,
  type PassportComplianceResult,
} from "./compliance.ts";

export interface ExtractedRequirements {
  materialType?: string;
  quantityT?: number;
  grade?: MaterialGrade;
  condition?: "good" | "fair" | "poor";
  location?: string;
  budgetPerT?: number;
  deliveryDate?: string;
  requireVerifiedPassport?: boolean;
  intendedApplication?: "structural" | "secondary" | "general";
  specificMaterialId?: string;
  orderId?: string;
}

export type AssistantIntent =
  | "search_materials"
  | "create_passport"
  | "compare_costs"
  | "check_compliance"
  | "request_material"
  | "check_orders"
  | "negotiate_terms"
  | "general_help";

export interface AssistantCardData {
  material: ProviderMaterialListing | MaterialPassport;
  candidate: AllocationCandidate;
  landedCost: LandedCostCalculation;
  compliance: PassportComplianceResult;
  savingsVsVirgin: {
    absolutePerT: number;
    percent: number;
    virginLandedPerT: number;
    virginName: string;
  } | null;
}

export interface AssistantOrderConfirmation {
  materialId: string;
  materialName: string;
  materialType: string;
  providerId: string;
  providerName: string;
  quantityT: number;
  availableT: number;
  unitPricePerT: number;
  estimatedFreightPerT: number;
  estimatedHandlingPerT: number;
  totalLandedCostPerT: number;
  totalEstimatedAmount: number;
  destination: string;
  requestedDate: string;
  verificationStatus: string;
  isEligible: boolean;
  complianceLimitations: string[];
}

export interface AssistantMessage {
  id: string;
  sender: "user" | "assistant";
  timestamp: string;
  text: string;
  intent?: AssistantIntent;
  cards?: AssistantCardData[];
  comparison?: {
    material: AssistantCardData;
    virginBenchmark: VirginMaterialBenchmark;
    netSavingsTotal: number;
  };
  orderConfirmation?: AssistantOrderConfirmation;
  orderBooking?: Booking;
  quickReplies?: string[];
}

/**
 * Known material type aliases for natural language normalization.
 */
const MATERIAL_KEYWORDS: Array<{ key: string; patterns: RegExp[] }> = [
  {
    key: "crushed-concrete",
    patterns: [
      /\bcrushed\s*concrete\b/i,
      /\bconcrete\s*aggregate\b/i,
      /\bconcrete\s*rubble\b/i,
      /\breclaimed\s*concrete\b/i,
      /\bconcrete\b/i,
    ],
  },
  {
    key: "structural-steel",
    patterns: [
      /\bstructural\s*steel\b/i,
      /\bsteel\s*beams?\b/i,
      /\bsteel\s*columns?\b/i,
      /\bismb\b/i,
      /\bi[\s-]beams?\b/i,
      /\bh[\s-]beams?\b/i,
      /\brebar\b/i,
      /\breinforcement\s*steel\b/i,
      /\bsteel\b/i,
    ],
  },
  {
    key: "reclaimed-brick",
    patterns: [
      /\breclaimed\s*bricks?\b/i,
      /\bred\s*bricks?\b/i,
      /\bwirecut\s*bricks?\b/i,
      /\bmasonry\b/i,
      /\bbricks?\b/i,
    ],
  },
  {
    key: "timber",
    patterns: [
      /\btimber\b/i,
      /\bwood\b/i,
      /\bwooden\s*beams?\b/i,
      /\bjoists?\b/i,
      /\bplanks?\b/i,
      /\blumber\b/i,
    ],
  },
  {
    key: "glass",
    patterns: [/\bglass\b/i, /\bglazing\b/i, /\bwindow\s*panels?\b/i],
  },
  {
    key: "plasterboard",
    patterns: [/\bplasterboard\b/i, /\bgypsum\b/i, /\bdrywall\b/i],
  },
];

/**
 * Common locations / landmarks recognition.
 */
const LOCATION_PATTERNS = [
  /\b(whitefield)\b/i,
  /\b(peenya)\b/i,
  /\b(electronic\s*city)\b/i,
  /\b(bengaluru|bangalore)\b/i,
  /\b(koramangala)\b/i,
  /\b(indiranagar)\b/i,
  /\b(hebbal)\b/i,
  /\b(rajajinagar)\b/i,
  /\b(mumbai)\b/i,
  /\b(pune)\b/i,
  /\b(hyderabad)\b/i,
  /\b(chennai)\b/i,
  /\b(delhi|ncr)\b/i,
];

/**
 * Deterministically parse user input and extract requirements & intent.
 */
export function parseProcurementPrompt(
  prompt: string,
  existingState: ExtractedRequirements = {}
): {
  intent: AssistantIntent;
  extracted: ExtractedRequirements;
} {
  const text = prompt.trim();

  // 1. Determine intent first to avoid polluting non-search tasks with old search filters
  const isCreatePassport =
    /\b(?:make|create|generate|register|issue|start|record|upload)\s*(?:a\s*)?(?:new\s*)?(?:material\s*)?passports?\b/i.test(text) ||
    /\b(?:add|create|list|offer|register|upload)\s*(?:new\s*)?materials?\b/i.test(text) ||
    /\b(?:want\s*to\s*create|how\s*to\s*(?:make|create))\s*(?:a\s*)?(?:new\s*)?passport\b/i.test(text) ||
    /\b(?:new\s*passport|passport\s*creation)\b/i.test(text);

  const isCheckOrders =
    /\b(?:active\s*orders?|my\s*orders?|track\s*(?:my\s*)?orders?|delivery\s*tracking|delivery\s*schedule|order\s*schedule|order\s*status|delivery\s*status|where\s*is\s*my\s*(?:order|load|shipment)|track\s*(?:my\s*)?shipment|shipment\s*status|check\s*(?:my\s*)?(?:active\s*)?orders?|delivery\s*timeline)\b/i.test(text) ||
    /\b(?:check|view|show|track)\s*(?:my\s*)?(?:active\s*)?(?:delivery\s*tracking\s*(?:for\s*)?)?orders?\b/i.test(text) ||
    /\border\s*(?:BK|ORD)-\d+\b/i.test(text);

  const isCompareCosts =
    /\b(?:compare|comparison|virgin\s*benchmark|cost\s*savings?|savings?\s*vs\s*virgin|cheaper|how\s*much\s*(?:do\s*i\s*)?save)\b/i.test(text);

  const isCompliance =
    /\b(?:understand\s*material\s*passports?|what\s*is\s*(?:a\s*)?material\s*passport|compliance\s*standards?|testing\s*standards?|is\s*383|is\s*3495|is\s*2062|lab\s*reports?)\b/i.test(text);

  const isNegotiate =
    /\b(?:negotiate|bargain|counter\s*offer|final\s*terms)\b/i.test(text);

  const isGeneralHelp =
    /\b(?:help|what\s*can\s*you\s*do|how\s*to\s*use|hi|hello|hey|menu|features|guide|navigate|how\s*does\s*(?:this|it|greenloop)\s*work|website\s*guide)\b/i.test(text);

  let intent: AssistantIntent = "search_materials";
  if (isCreatePassport) {
    intent = "create_passport";
  } else if (isCheckOrders) {
    intent = "check_orders";
  } else if (isCompareCosts) {
    intent = "compare_costs";
  } else if (isCompliance) {
    intent = "check_compliance";
  } else if (isNegotiate) {
    intent = "negotiate_terms";
  } else if (isGeneralHelp) {
    intent = "general_help";
  }

  // 2. Manage filter persistence: New independent tasks (passport, orders, help) must NOT inherit old material search constraints
  const isReset = /\b(?:clear|reset|remove)\s*(?:all\s*)?filters?\b/i.test(text);
  let extracted: ExtractedRequirements = {};

  if (!isReset && intent !== "create_passport" && intent !== "check_orders" && intent !== "general_help") {
    // Only persist ongoing search refinement if remaining in material search/comparison context
    extracted = { ...existingState };
  }

  // 1. Specific ID mentions (e.g. MP-1001, ORD-1001, DM-101)
  const matIdMatch = /\b(MP-\d+)\b/i.exec(text);
  if (matIdMatch) {
    extracted.specificMaterialId = matIdMatch[1].toUpperCase();
  }

  const orderIdMatch = /\b(ORD-\d+|BK-\d+)\b/i.exec(text);
  if (orderIdMatch) {
    extracted.orderId = orderIdMatch[1].toUpperCase();
  }

  // 2. Material Category (extract if explicitly in current prompt)
  for (const item of MATERIAL_KEYWORDS) {
    if (item.patterns.some((pattern) => pattern.test(text))) {
      extracted.materialType = item.key;
      break;
    }
  }

  // 3. Quantity (e.g. "50 tonnes", "50t", "25 tons", "100 mt")
  if (intent !== "check_orders" && intent !== "create_passport") {
    const qtyMatch =
      /\b(\d+(?:\.\d+)?)\s*(?:tonnes?|tons?|tonne|ton|t|mt)\b/i.exec(text);
    if (qtyMatch) {
      extracted.quantityT = parseFloat(qtyMatch[1]);
    } else {
      const looseQtyMatch = /\b(?:need|procure|want|buy|order)\s+(\d+(?:\.\d+)?)\b/i.exec(text);
      if (looseQtyMatch) {
        extracted.quantityT = parseFloat(looseQtyMatch[1]);
      }
    }
  }

  // 4. Grade (Grade A, Grade B, Grade C, Structural)
  if (/\bgrade\s*a\b/i.test(text) || /\bstructural\s*(?:grade|application|spec)?\b/i.test(text)) {
    extracted.grade = "A";
    extracted.intendedApplication = "structural";
  } else if (/\bgrade\s*b\b/i.test(text) || /\bsecondary\b/i.test(text)) {
    extracted.grade = "B";
    extracted.intendedApplication = "secondary";
  } else if (/\bgrade\s*c\b/i.test(text)) {
    extracted.grade = "C";
    extracted.intendedApplication = "general";
  }

  // 5. Condition (good, fair, poor)
  if (/\bgood\s*condition\b/i.test(text) || /\bprime\b/i.test(text)) {
    extracted.condition = "good";
  } else if (/\bfair\s*condition\b/i.test(text)) {
    extracted.condition = "fair";
  }

  // 6. Location (only update if specifically mentioned in current text)
  for (const locPattern of LOCATION_PATTERNS) {
    const locMatch = locPattern.exec(text);
    if (locMatch) {
      extracted.location = locMatch[1].trim();
      break;
    }
  }

  // 7. Budget / Max landed cost
  const budgetMatch =
    /(?:budget|max|price|under|below|upto|up to|at)\s*(?:₹|inr|rs\.?)?\s*(\d+(?:,\d+)?(?:\.\d+)?)\s*(?:\/t|per\s*t(?:onne)?)?/i.exec(
      text
    );
  if (budgetMatch) {
    extracted.budgetPerT = parseFloat(budgetMatch[1].replace(/,/g, ""));
  }

  // 8. Delivery Date / Window
  const dateMatch = /\b(\d{4}-\d{2}-\d{2})\b/.exec(text);
  if (dateMatch) {
    extracted.deliveryDate = dateMatch[1];
  } else if (/\bnext\s*week\b/i.test(text)) {
    extracted.deliveryDate = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  } else if (/\btomorrow\b/i.test(text)) {
    extracted.deliveryDate = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  }

  // 9. Compliance / Verification requirements
  if (
    /\b(?:verified|certified|certificate|lab\s*report|test\s*report|is\s*516|is\s*2062|is\s*3495|compliance)\b/i.test(
      text
    )
  ) {
    extracted.requireVerifiedPassport = true;
  }

  // If order was requested
  if (intent === "search_materials" && /\b(?:request|buy|procure|proceed)\b/i.test(text) && (extracted.specificMaterialId || extracted.materialType || extracted.quantityT)) {
    intent = "request_material";
  }

  return { intent, extracted };
}

/**
 * Generate contextual material recommendations based on real dataset & active requirements.
 */
export function queryContextualProcurement(
  dataset: GreenLoopDataset,
  requirements: ExtractedRequirements,
  userLocation: string = "Whitefield, Bengaluru"
): AssistantCardData[] {
  // Pool of candidate materials
  const candidateMaterials: (MaterialPassport | ProviderMaterialListing)[] = [];
  if (dataset.providerListings && dataset.providerListings.length > 0) {
    candidateMaterials.push(...dataset.providerListings);
  } else if (dataset.materials) {
    candidateMaterials.push(...dataset.materials);
  }

  const targetLocation = requirements.location || userLocation;
  const targetReceiver = dataset.receivers[0] || {
    id: "REC-CURRENT",
    name: "Procurement Site",
    location: targetLocation,
    dailyIntakeT: 100,
    currentStockT: 0,
    acceptedTypes: requirements.materialType ? [requirements.materialType] : ["concrete", "steel", "brick"],
    distanceKm: 20,
    distanceKnown: true,
  };

  const results: AssistantCardData[] = [];

  for (const mat of candidateMaterials) {
    const matId = "id" in mat ? mat.id : mat.materialId;
    const matType = "type" in mat ? mat.type : mat.materialType;
    const matAvailableT = "quantityT" in mat && !("availableT" in mat) ? mat.quantityT : mat.availableT;

    // Filter by specific ID if requested
    if (requirements.specificMaterialId && matId !== requirements.specificMaterialId) {
      continue;
    }

    // Filter by material type if specified
    if (requirements.materialType) {
      const normQueryType = requirements.materialType.toLowerCase().replace(/[^a-z0-9]/g, "");
      const normMatType = String(matType).toLowerCase().replace(/[^a-z0-9]/g, "");
      const matchesType = normMatType.includes(normQueryType) || normQueryType.includes(normMatType)
        || (normQueryType.includes("concrete") && normMatType.includes("concrete"))
        || (normQueryType.includes("steel") && normMatType.includes("steel"))
        || (normQueryType.includes("brick") && normMatType.includes("brick"));
      if (!matchesType && !requirements.specificMaterialId) {
        continue;
      }
    }

    // Evaluate match using capacity engine
    const candidate = evaluateMatch(dataset, {
      material: mat,
      receiver: targetReceiver,
      filters: {
        requireVerifiedPassport: requirements.requireVerifiedPassport,
        materialType: requirements.materialType,
        maximumBudget: requirements.budgetPerT,
      },
    });

    // Evaluate compliance with normalized passport
    const passportForCompliance: MaterialPassport = "surveyedAt" in mat
      ? (mat as MaterialPassport)
      : {
          id: matId,
          type: matType as MaterialTypeKey,
          quantityT: matAvailableT,
          quantityRangeT: [matAvailableT, matAvailableT],
          confidence: 1,
          condition: (mat.condition as any) || "good",
          grade: (mat.grade as any) || "A",
          surveyedAt: new Date().toISOString(),
          status: "passport-ready",
          projectId: "PROJ-LISTING",
          evidence: mat.evidence || [],
          verificationStatus: (mat as any).verificationStatus || "unverified",
        };

    const compliance = evaluatePassportCompliance(
      passportForCompliance,
      requirements.intendedApplication || "general"
    );

    // Calculate Landed Cost
    const unitPrice = ("pricePerT" in mat ? mat.pricePerT : undefined) ?? 800;
    const quantity = requirements.quantityT || Math.min(50, matAvailableT);
    const landedCost = calculateLandedCost({
      materialType: matType,
      quantityT: quantity,
      pricePerT: unitPrice,
      distanceKm: candidate.distanceKm || 25,
      destination: targetLocation,
      materialId: matId,
    });

    // Compute savings vs Virgin Benchmark
    let savingsVsVirgin = null;
    const benchmark = landedCost.benchmark;
    if (benchmark && landedCost.savingsPerT !== null && landedCost.savingsPercentage !== null) {
      savingsVsVirgin = {
        absolutePerT: landedCost.savingsPerT,
        percent: landedCost.savingsPercentage,
        virginLandedPerT: landedCost.virginLandedCostPerT || benchmark.landedCostPerT,
        virginName: benchmark.name,
      };
    }

    results.push({
      material: mat,
      candidate,
      landedCost,
      compliance,
      savingsVsVirgin,
    });
  }

  // Sort: Eligible first, then high match score, then verified, then distance
  return results.sort((a, b) => {
    if (a.candidate.isEligible !== b.candidate.isEligible) {
      return a.candidate.isEligible ? -1 : 1;
    }
    const aVerified = a.compliance.verificationStatus === "verified";
    const bVerified = b.compliance.verificationStatus === "verified";
    if (aVerified !== bVerified) return aVerified ? -1 : 1;
    return b.candidate.score - a.candidate.score;
  });
}

/**
 * Prepare an explicit order confirmation summary before any consequential transaction.
 */
export function prepareOrderConfirmation(
  card: AssistantCardData,
  quantityRequested: number,
  destination: string,
  targetDeliveryDate: string
): AssistantOrderConfirmation {
  const mat = card.material;
  const matId = "id" in mat ? mat.id : mat.materialId;
  const matName = ("name" in mat && mat.name) || ("materialType" in mat ? mat.materialType : "Reclaimed Material");
  const matType: string = "type" in mat ? String(mat.type) : String(mat.materialType || "concrete");
  const availableT = "availableT" in mat ? mat.availableT : mat.quantityT;
  const unitPricePerT = ("pricePerT" in mat ? mat.pricePerT : undefined) ?? 0;
  const providerName: string = "providerName" in mat && typeof mat.providerName === "string" ? mat.providerName : ("projectName" in mat && typeof mat.projectName === "string" ? mat.projectName : "Registered Provider");
  const providerId: string = "providerId" in mat && typeof mat.providerId === "string" ? mat.providerId : "provider";

  const transportItem = card.landedCost.items.find((i) => i.key === "transport");
  const handlingItem = card.landedCost.items.find((i) => i.key === "handling");

  const freightPerT = transportItem?.ratePerT ?? 250;
  const handlingPerT = handlingItem?.ratePerT ?? 120;
  const totalLandedPerT = unitPricePerT + freightPerT + handlingPerT;
  const totalEstimatedAmount = totalLandedPerT * quantityRequested;

  return {
    materialId: matId,
    materialName: matName,
    materialType: matType,
    providerId,
    providerName,
    quantityT: quantityRequested,
    availableT,
    unitPricePerT,
    estimatedFreightPerT: freightPerT,
    estimatedHandlingPerT: handlingPerT,
    totalLandedCostPerT: totalLandedPerT,
    totalEstimatedAmount,
    destination,
    requestedDate: targetDeliveryDate,
    verificationStatus: card.compliance.verificationStatus,
    isEligible: Boolean(card.candidate.isEligible && quantityRequested <= availableT),
    complianceLimitations: card.compliance.limitations,
  };
}

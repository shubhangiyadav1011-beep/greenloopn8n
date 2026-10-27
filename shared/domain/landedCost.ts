import type { MaterialTypeKey } from "./types.ts";

export interface VirginMaterialBenchmark {
  materialType: MaterialTypeKey;
  name: string;
  specification: string;
  pricePerT: number;
  logisticsPerT: number;
  landedCostPerT: number;
  source: string;
  effectiveDate: string;
  notes?: string;
}

export interface LandedCostItem {
  key: "material" | "transport" | "handling" | "testing" | "other";
  label: string;
  ratePerT: number | null;
  totalCost: number | null;
  isEstimated: boolean;
  missing: boolean;
  note?: string;
}

export interface LandedCostInput {
  materialType: string;
  quantityT: number;
  pricePerT?: number | null;
  distanceKm?: number;
  distanceKnown?: boolean;
  transportCostPerT?: number;
  handlingCostPerT?: number;
  testingCostPerT?: number;
  otherCostPerT?: number;
  otherCostLabel?: string;
  materialId?: string;
  destination?: string;
}

export type LandedCostStatus = "complete" | "pricing_pending" | "benchmark_unavailable" | "cost_premium";

export interface LandedCostCalculation {
  materialId?: string;
  materialType: string;
  quantityT: number;
  destination?: string;

  // Reusable Landed Cost Breakdown
  items: LandedCostItem[];
  reusableBaseRatePerT: number | null;
  reusableTransportPerT: number;
  reusableHandlingPerT: number;
  reusableTestingPerT: number;
  reusableOtherPerT: number;
  reusableLogisticsPerT: number;
  reusableLandedCostPerT: number | null;
  reusableTotalCost: number | null;
  isComplete: boolean;
  missingItems: string[];
  isDistanceEstimated: boolean;
  distanceKm?: number;

  // Virgin Benchmark Comparison
  benchmark: VirginMaterialBenchmark | null;
  virginBaseRatePerT: number | null;
  virginLogisticsPerT: number | null;
  virginLandedCostPerT: number | null;
  virginTotalCost: number | null;

  // Savings Analysis
  status: LandedCostStatus;
  savingsPerT: number | null;
  totalSavings: number | null;
  savingsPercentage: number | null;
  isEconomical: boolean;
  statusMessage: string;
  disclaimer: string;
}

export const VIRGIN_MATERIAL_BENCHMARKS: Record<string, VirginMaterialBenchmark> = {
  steel: {
    materialType: "steel",
    name: "Virgin Structural Steel (IS 2062 / S355 / Fe500)",
    specification: "Primary structural steel section (S355 / Fe500)",
    pricePerT: 62000,
    logisticsPerT: 3000,
    landedCostPerT: 65000,
    source: "National Steel Market Benchmark & CPWD Schedule of Rates (DSR), Q3 2026",
    effectiveDate: "Q3 2026",
    notes: "Primary steel mill gate rate + standard regional distribution freight and handling",
  },
  concrete: {
    materialType: "concrete",
    name: "Virgin Structural Concrete / Aggregate (M25/M30)",
    specification: "Virgin crushed aggregate & batch mix (M25/M30)",
    pricePerT: 4200,
    logisticsPerT: 450,
    landedCostPerT: 4650,
    source: "Ready-Mix Concrete Manufacturers Association (RMCMA) & CPWD DSR, Q3 2026",
    effectiveDate: "Q3 2026",
    notes: "Quarry crushed coarse/fine aggregates and fresh batch logistics",
  },
  brick: {
    materialType: "brick",
    name: "First-Class Clay / Wire-Cut Virgin Bricks",
    specification: "First-class modular burnt clay / wire-cut bricks",
    pricePerT: 5500,
    logisticsPerT: 500,
    landedCostPerT: 6000,
    source: "Brick Kiln Manufacturers Association Index & CPWD DSR, Q3 2026",
    effectiveDate: "Q3 2026",
    notes: "Kiln-fired virgin masonry units with palletized road transit",
  },
  timber: {
    materialType: "timber",
    name: "Commercial Sawn Structural Hardwood (Sal / Teak substitute)",
    specification: "Grade-I sawn structural hardwood sections",
    pricePerT: 38000,
    logisticsPerT: 1500,
    landedCostPerT: 39500,
    source: "Forest Development Corporation Timber Auction Index & CPWD DSR, Q3 2026",
    effectiveDate: "Q3 2026",
    notes: "Seasoned virgin commercial timber with depot haulage",
  },
  glass: {
    materialType: "glass",
    name: "Architectural Virgin Float Glass / Tempered Facade Panels",
    specification: "Clear float & architectural facade glass (6mm-12mm)",
    pricePerT: 52000,
    logisticsPerT: 2500,
    landedCostPerT: 54500,
    source: "All India Glass Manufacturers' Federation (AIGMF) Market Benchmark, Q3 2026",
    effectiveDate: "Q3 2026",
    notes: "Float plant manufacture with specialized crate transport",
  },
  plasterboard: {
    materialType: "plasterboard",
    name: "Virgin Gypsum Wallboard / Plasterboard Panels",
    specification: "Standard 12.5mm gypsum wallboard panels",
    pricePerT: 22000,
    logisticsPerT: 1200,
    landedCostPerT: 23200,
    source: "National Gypsum Building Materials Index & CPWD DSR, Q3 2026",
    effectiveDate: "Q3 2026",
    notes: "Factory manufactured gypsum board with regional freight",
  },
};

export const COMMERCIAL_FREIGHT_RATES: Record<string, { baseMobilizationPerT: number; ratePerTonneKm: number }> = {
  steel: { baseMobilizationPerT: 180, ratePerTonneKm: 14.0 },
  concrete: { baseMobilizationPerT: 120, ratePerTonneKm: 10.0 },
  brick: { baseMobilizationPerT: 140, ratePerTonneKm: 11.0 },
  timber: { baseMobilizationPerT: 150, ratePerTonneKm: 12.0 },
  glass: { baseMobilizationPerT: 220, ratePerTonneKm: 16.0 },
  plasterboard: { baseMobilizationPerT: 130, ratePerTonneKm: 11.0 },
};

export const DEFAULT_HANDLING_RATES: Record<string, number> = {
  concrete: 120,
  brick: 150,
  steel: 220,
  timber: 180,
  plasterboard: 140,
  glass: 280,
};

export function calculateTransportCostPerT(distanceKm: number, materialType?: string): number {
  const norm = (materialType || "").toLowerCase().trim();
  let rates = COMMERCIAL_FREIGHT_RATES[norm];
  if (!rates) {
    if (norm.includes("steel")) rates = COMMERCIAL_FREIGHT_RATES.steel;
    else if (norm.includes("concrete")) rates = COMMERCIAL_FREIGHT_RATES.concrete;
    else if (norm.includes("brick")) rates = COMMERCIAL_FREIGHT_RATES.brick;
    else if (norm.includes("timber") || norm.includes("wood")) rates = COMMERCIAL_FREIGHT_RATES.timber;
    else if (norm.includes("glass")) rates = COMMERCIAL_FREIGHT_RATES.glass;
    else if (norm.includes("plaster") || norm.includes("gypsum")) rates = COMMERCIAL_FREIGHT_RATES.plasterboard;
    else rates = { baseMobilizationPerT: 160, ratePerTonneKm: 12.5 };
  }
  const d = Math.max(0, Number.isFinite(distanceKm) ? distanceKm : 0);
  return Math.round((rates.baseMobilizationPerT + rates.ratePerTonneKm * d) * 100) / 100;
}

export function getVirginBenchmark(materialType: string): VirginMaterialBenchmark | null {
  if (!materialType) return null;
  const key = materialType.toLowerCase().trim();
  if (VIRGIN_MATERIAL_BENCHMARKS[key]) {
    return VIRGIN_MATERIAL_BENCHMARKS[key];
  }
  if (key.includes("steel")) return VIRGIN_MATERIAL_BENCHMARKS.steel;
  if (key.includes("concrete")) return VIRGIN_MATERIAL_BENCHMARKS.concrete;
  if (key.includes("brick")) return VIRGIN_MATERIAL_BENCHMARKS.brick;
  if (key.includes("timber") || key.includes("wood")) return VIRGIN_MATERIAL_BENCHMARKS.timber;
  if (key.includes("glass")) return VIRGIN_MATERIAL_BENCHMARKS.glass;
  if (key.includes("plaster") || key.includes("gypsum")) return VIRGIN_MATERIAL_BENCHMARKS.plasterboard;
  return null;
}

export const LANDED_COST_DISCLAIMER =
  "Estimated savings are indicative based on prevailing benchmark indices and quoted transit parameters. Final commercial terms and delivery charges are subject to bilateral agreement.";

export function calculateLandedCost(input: LandedCostInput): LandedCostCalculation {
  const normType = (input.materialType || "").toLowerCase().trim();
  const quantityT = Math.max(0, Number.isFinite(input.quantityT) ? input.quantityT : 0);

  const hasPrice = typeof input.pricePerT === "number" && Number.isFinite(input.pricePerT) && input.pricePerT >= 0;
  const pricePerT = hasPrice ? input.pricePerT! : null;

  // Transport calculation
  let transportRate = 0;
  let isDistanceEstimated = false;

  if (typeof input.transportCostPerT === "number" && Number.isFinite(input.transportCostPerT) && input.transportCostPerT >= 0) {
    transportRate = input.transportCostPerT;
    isDistanceEstimated = input.distanceKnown === false;
  } else if (typeof input.distanceKm === "number" && Number.isFinite(input.distanceKm) && input.distanceKm >= 0) {
    transportRate = calculateTransportCostPerT(input.distanceKm, normType);
    isDistanceEstimated = input.distanceKnown === false;
  } else {
    transportRate = calculateTransportCostPerT(0, normType);
    isDistanceEstimated = true;
  }

  // Handling calculation
  const handlingRate = typeof input.handlingCostPerT === "number" && Number.isFinite(input.handlingCostPerT) && input.handlingCostPerT >= 0
    ? input.handlingCostPerT
    : (DEFAULT_HANDLING_RATES[normType] ?? 160);

  const testingRate = typeof input.testingCostPerT === "number" && Number.isFinite(input.testingCostPerT) && input.testingCostPerT >= 0
    ? input.testingCostPerT
    : 0;

  const otherRate = typeof input.otherCostPerT === "number" && Number.isFinite(input.otherCostPerT) && input.otherCostPerT >= 0
    ? input.otherCostPerT
    : 0;

  const reusableLogisticsPerT = Math.round((transportRate + handlingRate + testingRate + otherRate) * 100) / 100;
  const reusableLandedCostPerT = hasPrice ? Math.round((pricePerT! + reusableLogisticsPerT) * 100) / 100 : null;
  const reusableTotalCost = hasPrice ? Math.round((reusableLandedCostPerT! * quantityT) * 100) / 100 : null;

  const missingItems: string[] = [];
  if (!hasPrice) missingItems.push("materialPrice");

  // Build itemized breakdown
  const items: LandedCostItem[] = [
    {
      key: "material",
      label: "Reclaimed Asset Price",
      ratePerT: pricePerT,
      totalCost: hasPrice ? Math.round((pricePerT! * quantityT) * 100) / 100 : null,
      missing: !hasPrice,
      isEstimated: false,
      note: hasPrice ? "Agreed or listed reusable unit price" : "Pending provider quote",
    },
    {
      key: "transport",
      label: "Transport Haulage",
      ratePerT: transportRate,
      totalCost: Math.round((transportRate * quantityT) * 100) / 100,
      missing: false,
      isEstimated: isDistanceEstimated,
      note: isDistanceEstimated
        ? "Estimated base hauling (transit distance unconfirmed)"
        : typeof input.distanceKm === "number"
          ? `${input.distanceKm} km transit route`
          : "Calculated transit haulage",
    },
    {
      key: "handling",
      label: "Yard Intake & Handling",
      ratePerT: handlingRate,
      totalCost: Math.round((handlingRate * quantityT) * 100) / 100,
      missing: false,
      isEstimated: false,
      note: "Receiver facility intake and offloading rate",
    },
  ];

  if (testingRate > 0) {
    items.push({
      key: "testing",
      label: "Testing & Verification",
      ratePerT: testingRate,
      totalCost: Math.round((testingRate * quantityT) * 100) / 100,
      missing: false,
      isEstimated: false,
      note: "Material passport verification and testing documentation",
    });
  }

  if (otherRate > 0) {
    items.push({
      key: "other",
      label: input.otherCostLabel || "Applicable Charges",
      ratePerT: otherRate,
      totalCost: Math.round((otherRate * quantityT) * 100) / 100,
      missing: false,
      isEstimated: false,
      note: "Documented logistics / handling surcharge",
    });
  }

  // Virgin Benchmark Comparison
  const benchmark = getVirginBenchmark(input.materialType);
  const virginBaseRatePerT = benchmark ? benchmark.pricePerT : null;
  const virginLogisticsPerT = benchmark ? benchmark.logisticsPerT : null;
  const virginLandedCostPerT = benchmark ? benchmark.landedCostPerT : null;
  const virginTotalCost = benchmark ? Math.round((benchmark.landedCostPerT * quantityT) * 100) / 100 : null;

  // Savings Analysis
  let status: LandedCostStatus = "complete";
  let savingsPerT: number | null = null;
  let totalSavings: number | null = null;
  let savingsPercentage: number | null = null;
  let isEconomical = false;
  let statusMessage = "";

  if (!hasPrice) {
    status = "pricing_pending";
    statusMessage = "Cannot compute estimated savings until material unit price is quoted by provider.";
  } else if (!benchmark) {
    status = "benchmark_unavailable";
    statusMessage = `Virgin benchmark data unavailable for custom material specification "${input.materialType}". Showing itemized landed costs only.`;
  } else {
    savingsPerT = Math.round((virginLandedCostPerT! - reusableLandedCostPerT!) * 100) / 100;
    totalSavings = Math.round((virginTotalCost! - reusableTotalCost!) * 100) / 100;
    savingsPercentage = virginLandedCostPerT! > 0 ? Math.round((savingsPerT / virginLandedCostPerT!) * 100) : 0;
    isEconomical = savingsPerT > 0;

    if (savingsPerT > 0) {
      status = "complete";
      statusMessage = `Reclaimed asset delivers ₹${savingsPerT.toLocaleString("en-IN")}/t (~${savingsPercentage}%) estimated savings over conventional virgin benchmark.`;
    } else if (savingsPerT === 0) {
      status = "complete";
      statusMessage = "Reclaimed asset landed cost is on par with conventional virgin benchmark.";
    } else {
      status = "cost_premium";
      statusMessage = `Reclaimed asset has an estimated cost premium of ₹${Math.abs(savingsPerT).toLocaleString("en-IN")}/t compared to conventional virgin benchmark.`;
    }
  }

  return {
    materialId: input.materialId,
    materialType: input.materialType,
    quantityT,
    destination: input.destination,

    items,
    reusableBaseRatePerT: pricePerT,
    reusableTransportPerT: transportRate,
    reusableHandlingPerT: handlingRate,
    reusableTestingPerT: testingRate,
    reusableOtherPerT: otherRate,
    reusableLogisticsPerT,
    reusableLandedCostPerT,
    reusableTotalCost,
    isComplete: hasPrice,
    missingItems,
    isDistanceEstimated,
    distanceKm: input.distanceKm,

    benchmark,
    virginBaseRatePerT,
    virginLogisticsPerT,
    virginLandedCostPerT,
    virginTotalCost,

    status,
    savingsPerT,
    totalSavings,
    savingsPercentage,
    isEconomical,
    statusMessage,
    disclaimer: LANDED_COST_DISCLAIMER,
  };
}

export { VIRGIN_MATERIAL_BENCHMARKS as virginBenchmarks };


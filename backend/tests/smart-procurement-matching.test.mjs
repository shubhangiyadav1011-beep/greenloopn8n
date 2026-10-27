import test from "node:test";
import assert from "node:assert/strict";
import { evaluateMatch, contextualMatch, smartProcurementMatch, geoDistanceKm } from "../../shared/domain/capacity.ts";
import { calculateLandedCost } from "../../shared/domain/landedCost.ts";

function createMockDataset() {
  const receiverFacility = {
    id: "rec-test-1",
    name: "Apex Circular Works",
    location: "Kharadi Industrial Area, Pune",
    dailyIntakeT: 80,
    currentStockT: 20,
    acceptedTypes: ["steel", "concrete"],
    distanceKm: 42,
    distanceKnown: true,
    geo: { lat: 18.55, lng: 73.94 },
  };

  const materials = [
    {
      id: "mat-eligible-steel",
      projectId: "proj-1",
      type: "steel",
      quantityT: 100,
      quantityRangeT: [90, 110],
      condition: "good",
      grade: "A",
      surveyedAt: "2026-09-01T10:00:00Z",
      status: "active",
      confidence: 0.95,
      pricePerT: 38000,
      availableFrom: "2026-10-01",
      geo: { lat: 18.52, lng: 73.85 },
      evidence: [
        { kind: "survey-sheet", label: "Demolition Structural Survey", recordedAt: "2026-09-01T10:00:00Z" },
        { kind: "site-photo", label: "Site Beams Photo", recordedAt: "2026-09-01T10:00:00Z" },
        { kind: "lab-report", label: "IS 2062 Tensile Lab Assay", recordedAt: "2026-09-02T10:00:00Z" },
      ],
    },
    {
      id: "mat-grade-c-steel",
      projectId: "proj-2",
      type: "steel",
      quantityT: 80,
      quantityRangeT: [70, 90],
      condition: "fair",
      grade: "C",
      surveyedAt: "2026-09-05T10:00:00Z",
      status: "active",
      confidence: 0.8,
      pricePerT: 25000, // cheap price, but low grade!
      availableFrom: "2026-10-01",
      geo: { lat: 18.53, lng: 73.86 },
      evidence: [
        { kind: "site-photo", label: "Scrap Photo", recordedAt: "2026-09-05T10:00:00Z" },
      ],
    },
    {
      id: "mat-unaccepted-timber",
      projectId: "proj-3",
      type: "timber",
      quantityT: 50,
      quantityRangeT: [40, 60],
      condition: "good",
      grade: "A",
      surveyedAt: "2026-09-10T10:00:00Z",
      status: "active",
      confidence: 0.9,
      pricePerT: 12000,
      availableFrom: "2026-10-01",
      geo: { lat: 18.50, lng: 73.80 },
      evidence: [],
    },
    {
      id: "mat-late-steel",
      projectId: "proj-4",
      type: "steel",
      quantityT: 60,
      quantityRangeT: [50, 70],
      condition: "good",
      grade: "A",
      surveyedAt: "2026-09-12T10:00:00Z",
      status: "active",
      confidence: 0.9,
      pricePerT: 36000,
      availableFrom: "2026-11-20", // Available late!
      geo: { lat: 18.51, lng: 73.84 },
      evidence: [],
    },
    {
      id: "mat-cancelled-steel",
      projectId: "proj-5",
      type: "steel",
      quantityT: 120,
      quantityRangeT: [110, 130],
      condition: "good",
      grade: "A",
      surveyedAt: "2026-08-01T10:00:00Z",
      status: "cancelled",
      confidence: 0.9,
      pricePerT: 30000,
      availableFrom: "2026-10-01",
      geo: { lat: 18.52, lng: 73.85 },
      evidence: [],
    },
  ];

  const slots = [
    {
      id: "slot-1",
      receiverId: "rec-test-1",
      materialType: "steel",
      date: "2026-10-15",
      capacityT: 100,
    },
  ];

  const demands = [
    {
      id: "dem-test-1",
      receiverId: "rec-test-1",
      materialType: "steel",
      requiredT: 50,
      period: "2026-10-20",
      location: "Kharadi, Pune",
      budgetPerT: 45000,
      status: "OPEN",
      notes: "High-grade structural steel required (Grade A or B).",
      createdAt: "2026-09-15T10:00:00Z",
      updatedAt: "2026-09-15T10:00:00Z",
    },
  ];

  return {
    materials,
    receivers: [receiverFacility],
    demands,
    slots,
    bookings: [],
    offers: [],
    projects: [
      { id: "proj-1", name: "Metro Station North", location: "Pune", surveyedAt: "2026-09-01T10:00:00Z", lastActivityAt: "2026-09-01T10:00:00Z", status: "surveyed" },
    ],
  };
}

test("Smart Procurement & Explainable Matching: Mandatory compliance checks prevent high scores from overriding failed requirements", () => {
  const dataset = createMockDataset();
  const receiver = dataset.receivers[0];

  // 1. Unaccepted Material Type fails mandatory eligibility
  const timberMatch = evaluateMatch(dataset, {
    material: dataset.materials.find((m) => m.id === "mat-unaccepted-timber"),
    receiver,
  });
  assert.equal(timberMatch.isEligible, false, "Timber must be ineligible at steel/concrete receiver");
  assert.equal(timberMatch.score, 0, "Ineligible candidate score must be strictly 0");
  assert.equal(timberMatch.recommended, false, "Ineligible candidate must never be recommended");
  assert.ok(timberMatch.nonMatchReasons?.length, "Must provide non-match reason");
  assert.ok(
    timberMatch.complianceChecks?.some((c) => c.id === "material_type" && c.status === "failed" && c.mandatory),
    "Compliance check for material_type must be failed and marked mandatory"
  );

  // 2. Cancelled asset fails mandatory eligibility
  const cancelledMatch = evaluateMatch(dataset, {
    material: dataset.materials.find((m) => m.id === "mat-cancelled-steel"),
    receiver,
  });
  assert.equal(cancelledMatch.isEligible, false, "Cancelled material must be ineligible");
  assert.equal(cancelledMatch.score, 0, "Score must be 0 for cancelled material");

  // 3. Timeline conflict fails mandatory eligibility when needed deadline is specified
  const lateMatch = evaluateMatch(dataset, {
    material: dataset.materials.find((m) => m.id === "mat-late-steel"),
    receiver,
    filters: { neededBy: "2026-10-15" },
  });
  assert.equal(lateMatch.isEligible, false, "Material available after needed deadline must fail timeline eligibility");
  assert.equal(lateMatch.score, 0, "Score must be 0 when timeline conflict exists");
  assert.ok(
    lateMatch.complianceChecks?.some((c) => c.id === "timeline" && c.status === "failed" && c.mandatory),
    "Timeline check must fail"
  );

  // 4. Grade specification requirement: Grade C steel fails when Grade A is required
  const gradeCMatch = evaluateMatch(dataset, {
    material: dataset.materials.find((m) => m.id === "mat-grade-c-steel"),
    receiver,
    filters: { minimumGrade: "A" },
  });
  assert.equal(gradeCMatch.isEligible, false, "Grade C material must be ineligible when Grade A is required");
  assert.equal(gradeCMatch.score, 0, "Score must be 0 when grade requirement fails");
  assert.ok(
    gradeCMatch.complianceChecks?.some((c) => c.id === "specification_grade" && c.status === "failed"),
    "Specification grade compliance check must fail"
  );

  // 5. Eligible Grade A steel passes with positive score
  const eligibleMatch = evaluateMatch(dataset, {
    material: dataset.materials.find((m) => m.id === "mat-eligible-steel"),
    receiver,
    filters: { minimumGrade: "A", neededBy: "2026-10-15", maximumBudget: 45000 },
  });
  assert.equal(eligibleMatch.isEligible, true, "Eligible steel must pass all mandatory checks");
  assert.ok(eligibleMatch.score > 0.7, `Eligible score should be high, got ${eligibleMatch.score}`);
  assert.equal(
    eligibleMatch.complianceChecks?.every((c) => !c.mandatory || c.status === "passed"),
    true,
    "All mandatory compliance checks must be passed"
  );
});

test("Smart Procurement & Explainable Matching: Contextual matching ranks all eligible candidates strictly before ineligible ones", () => {
  const dataset = createMockDataset();
  const receiver = dataset.receivers[0];

  const results = contextualMatch(
    dataset,
    { receiverId: receiver.id },
    {
      materialType: "steel",
      minimumGrade: "A",
      neededBy: "2026-10-15",
    }
  );

  assert.ok(results.length >= 2, "Must return multiple candidates");

  // First candidate MUST be eligible
  assert.equal(results[0].isEligible, true, "First candidate must be eligible");
  assert.equal(results[0].materialId, "mat-eligible-steel");
  assert.ok(results[0].score > 0, "First candidate must have positive score");

  // Any ineligible candidates must come AFTER eligible candidates
  let seenIneligible = false;
  for (const candidate of results) {
    if (!candidate.isEligible) {
      seenIneligible = true;
      assert.equal(candidate.score, 0, "Ineligible candidate must have 0 score");
    } else {
      assert.equal(seenIneligible, false, "No eligible candidate should appear after an ineligible candidate");
    }
  }
});

test("Smart Procurement & Explainable Matching: Quantity coverage, missing evidence and delivery feasibility", () => {
  const dataset = createMockDataset();
  const receiver = dataset.receivers[0];
  const matEligible = dataset.materials.find((m) => m.id === "mat-eligible-steel");

  // 1. Quantity coverage: 50t required vs 100t available = Full match
  const matchFull = evaluateMatch(dataset, {
    material: matEligible,
    receiver,
    filters: { requiredQuantityT: 50 },
  });
  assert.equal(matchFull.isFullMatch, true);
  assert.equal(matchFull.coveragePercent, 100);
  assert.equal(matchFull.remainingQuantityT, 0);

  // 2. Quantity coverage: 150t required vs 100t available = Partial match (66.67%)
  const matchPartial = evaluateMatch(dataset, {
    material: matEligible,
    receiver,
    filters: { requiredQuantityT: 150 },
  });
  assert.equal(matchPartial.isPartialMatch, true);
  assert.ok(matchPartial.coveragePercent < 100 && matchPartial.coveragePercent >= 66);
  assert.equal(matchPartial.remainingQuantityT, 50);

  // 3. Evidence detection: matEligible has lab-report, survey-sheet, site-photo, but no weighbridge ticket yet
  assert.ok(
    matchFull.missingEvidence?.some((item) => item.toLowerCase().includes("weighbridge")),
    "Should detect missing weighbridge intake ticket"
  );
  assert.equal(
    matchFull.missingEvidence?.some((item) => item.toLowerCase().includes("lab test report")),
    false,
    "Should NOT flag missing lab report when present"
  );

  // 4. Delivery feasibility
  assert.ok(matchFull.deliveryFeasibility, "Must include delivery feasibility data");
  assert.equal(matchFull.deliveryFeasibility.feasible, true);
  assert.ok(matchFull.deliveryFeasibility.distanceKm > 0);
  assert.ok(matchFull.deliveryFeasibility.estimatedTransitDays.length > 0);
  assert.ok(matchFull.deliveryFeasibility.estimatedHaulagePerT > 0);
});

test("Smart Procurement & Explainable Matching: Side-by-side landed cost calculation with clearly labelled estimates", () => {
  const calculation = calculateLandedCost({
    materialType: "steel",
    quantityT: 50,
    pricePerT: 38000,
    distanceKm: 35,
    distanceKnown: true,
  });

  // Reclaimed Landed Cost
  assert.ok(calculation.reusableLandedCostPerT !== null && calculation.reusableLandedCostPerT > 38000);
  assert.ok(calculation.reusableTransportPerT > 0);
  assert.ok(calculation.reusableHandlingPerT > 0);

  // Virgin Benchmark
  assert.ok(calculation.benchmark !== null, "Must have virgin benchmark for structural steel");
  assert.equal(calculation.benchmark.materialType, "steel");
  assert.ok(calculation.benchmark.landedCostPerT > calculation.reusableLandedCostPerT);

  // Indicative Savings
  assert.ok(calculation.savingsPerT !== null && calculation.savingsPerT > 0);
  assert.ok(calculation.savingsPercentage !== null && calculation.savingsPercentage > 0);
  assert.ok(calculation.totalSavings !== null && calculation.totalSavings > 0);

  // Itemized breakdown and estimates
  assert.ok(calculation.items.length >= 3);
  const transportItem = calculation.items.find((item) => item.key === "transport");
  assert.ok(transportItem);
  assert.ok(calculation.disclaimer.includes("indicative") || calculation.disclaimer.includes("benchmark"));
});

test("Smart Procurement: smartProcurementMatch helper accepts refined project requirements", () => {
  const dataset = createMockDataset();
  const receiver = dataset.receivers[0];

  const refinedResults = smartProcurementMatch(dataset, receiver, {
    materialType: "steel",
    requiredQuantityT: 50,
    budgetPerT: 42000,
    minimumGrade: "A",
    requiredCondition: "good",
    neededBy: "2026-10-25",
    maxDistanceKm: 100,
    requireLabReport: true,
  });

  assert.ok(refinedResults.length > 0, "Must return evaluated results");
  const topResult = refinedResults[0];
  assert.equal(topResult.isEligible, true);
  assert.equal(topResult.materialId, "mat-eligible-steel");
  assert.ok(topResult.score > 0.7);
  assert.ok(topResult.complianceChecks?.length >= 5);
});

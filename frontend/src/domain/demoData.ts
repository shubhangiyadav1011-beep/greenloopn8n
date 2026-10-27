/**
 * GreenLoop demo dataset — the hackathon scenario, seeded as a completed run.
 *
 * The locked 15-tonne story, in order (see `events` below):
 *   1. Two demolition projects survey recoverable material.
 *   2. Both request the same receiver/slot (Riverstone Aggregates, 15 t/day).
 *   3. Project A (10 t) confirms → 5.0 t available.
 *   4. Project B (8 t) → HOLD "Insufficient available capacity".
 *   5. Project A cancels → 10 t released → recheck → Project B CONFIRMED.
 *   6. B's load dispatches; the receiver verifies 7.4 t of 8.0 t planned.
 *
 * Every figure shown anywhere in the product or on the public site must come
 * from this file or from the capacity engine — no invented statistics.
 *
 * Timeline anchor: week of 2026-09-21 (today = 2026-09-27).
 */

import type {
  Actor,
  DomainEvent,
  GreenLoopDataset,
} from "@shared/domain/types.ts";

const contractorA: Actor = { kind: "contractor", name: "Harrow Road Demolition — site team" };
const contractorB: Actor = { kind: "contractor", name: "Kings Cross Strip-out — site team" };
const system: Actor = { kind: "system", name: "GreenLoop planning" };
const receiverOps: Actor = { kind: "receiver", name: "Riverstone Aggregates — yard office" };

/** Identifiers referenced by the demo flow (UI wires actions to these). */
export const STORY = {
  receiverId: "R-001",
  concreteSlotSept24: "SL-R1-CONC-0924",
  concreteSlotSept28: "SL-R1-CONC-0928",
  projectAId: "PR-01",
  projectBId: "PR-02",
  materialAId: "MP-101",
  materialBId: "MP-102",
  allocationAId: "AL-1",
  allocationBId: "AL-2",
  bookingAId: "BK-1",
  bookingBId: "BK-2",
  loadRef: "LOAD-1001",
} as const;

const events: DomainEvent[] = [
  {
    id: "EV-001",
    at: "2026-09-14T09:10:00Z",
    kind: "survey.material.recorded",
    actor: system,
    summary: "24.0 t crushed concrete surveyed — Harrow Road Demolition",
    detail: "Surveyor walkover, bays 2–4. Range 21.0–27.0 t.",
    subjectIds: ["PR-01", "MP-101"],
  },
  {
    id: "EV-002",
    at: "2026-09-15T11:30:00Z",
    kind: "survey.material.recorded",
    actor: system,
    summary: "16.0 t crushed concrete surveyed — Kings Cross Strip-out",
    detail: "Slab breakout, range 13.0–18.0 t.",
    subjectIds: ["PR-02", "MP-102"],
  },
  {
    id: "EV-003",
    at: "2026-09-16T14:00:00Z",
    kind: "passport.created",
    actor: system,
    summary: "Material passport MP-101 created (Grade B, good condition)",
    subjectIds: ["MP-101"],
  },
  {
    id: "EV-004",
    at: "2026-09-16T14:20:00Z",
    kind: "passport.created",
    actor: system,
    summary: "Material passport MP-102 created (Grade B, fair condition)",
    subjectIds: ["MP-102"],
  },
  {
    id: "EV-005",
    at: "2026-09-19T10:00:00Z",
    kind: "matching.completed",
    actor: system,
    summary: "Matching run — Riverstone Aggregates recommended for MP-101",
    subjectIds: ["MP-101", "R-001"],
  },
  {
    id: "EV-006",
    at: "2026-09-22T09:05:00Z",
    kind: "allocation.requested",
    actor: contractorA,
    summary: "10.0 t of concrete requested at Riverstone Aggregates",
    subjectIds: ["MP-101", "R-001", "AL-1"],
  },
  {
    id: "EV-007",
    at: "2026-09-22T09:05:05Z",
    kind: "allocation.confirmed",
    actor: system,
    summary: "Confirmed — capacity 15.0 t → 5.0 t available",
    subjectIds: ["MP-101", "R-001", "AL-1"],
  },
  {
    id: "EV-008",
    at: "2026-09-22T09:40:00Z",
    kind: "allocation.requested",
    actor: contractorB,
    summary: "8.0 t of concrete requested at Riverstone Aggregates",
    subjectIds: ["MP-102", "R-001", "AL-2"],
  },
  {
    id: "EV-009",
    at: "2026-09-22T09:40:05Z",
    kind: "allocation.hold",
    actor: system,
    summary: "HOLD — insufficient available capacity",
    detail: "8.0 t requested, 5.0 t available. Recheck pending.",
    subjectIds: ["MP-102", "R-001", "AL-2"],
  },
  {
    id: "EV-010",
    at: "2026-09-22T10:15:00Z",
    kind: "capacity.released",
    actor: contractorA,
    summary: "10.0 t released at Riverstone Aggregates",
    detail: "Programme change — retention slab reused on site.",
    subjectIds: ["MP-101", "R-001", "BK-1"],
  },
  {
    id: "EV-011",
    at: "2026-09-22T10:15:03Z",
    kind: "allocation.recheck.confirmed",
    actor: system,
    summary: "Recheck confirmed — 8.0 t now fits (15.0 t available)",
    subjectIds: ["MP-102", "R-001", "AL-2"],
  },
  {
    id: "EV-012",
    at: "2026-09-26T07:30:00Z",
    kind: "load.dispatched",
    actor: contractorB,
    summary: "LOAD-1001 dispatched — 8.0 t to Riverstone Aggregates",
    subjectIds: ["MP-102", "R-001", "BK-2"],
  },
  {
    id: "EV-013",
    at: "2026-09-26T14:05:00Z",
    kind: "verification.completed",
    actor: receiverOps,
    summary: "LOAD-1001 verified — planned 8.0 t, accepted 7.4 t",
    detail: "0.2 t rejected: contamination — mortar fines.",
    subjectIds: ["MP-102", "R-001", "BK-2", "VR-1"],
  },
];

const base: GreenLoopDataset = {
  projects: [
    {
      id: "PR-01",
      name: "Harrow Road Demolition",
      location: "London NW10",
      status: "demolition",
      surveyedAt: "2026-09-14T09:10:00Z",
      lastActivityAt: "2026-09-22T10:15:00Z",
    },
    {
      id: "PR-02",
      name: "Kings Cross Strip-out",
      location: "London N1",
      status: "active",
      surveyedAt: "2026-09-15T11:30:00Z",
      lastActivityAt: "2026-09-26T14:05:00Z",
    },
    {
      id: "PR-03",
      name: "Bermondsey Warehouse Refurb",
      location: "London SE16",
      status: "active",
      surveyedAt: "2026-09-10T08:00:00Z",
      lastActivityAt: "2026-09-18T16:40:00Z",
    },
    {
      id: "PR-04",
      name: "Croydon Civic Demolition",
      location: "Croydon CR0",
      status: "active",
      surveyedAt: "2026-09-17T10:45:00Z",
      lastActivityAt: "2026-09-21T09:20:00Z",
    },
  ],
  materials: [
    {
      id: "MP-101",
      projectId: "PR-01",
      type: "concrete",
      quantityT: 24,
      quantityRangeT: [21, 27],
      condition: "good",
      grade: "B",
      surveyedAt: "2026-09-14T09:10:00Z",
      status: "passport-ready",
      confidence: 0.85,
      evidence: [
        { kind: "survey-sheet", label: "Walkover sheet — bays 2–4", ref: "survey-hr-014", recordedAt: "2026-09-14T09:10:00Z" },
        { kind: "site-photo", label: "Crushed concrete stockpile", ref: "/images/site/auth-concrete.jpg", recordedAt: "2026-09-14T09:35:00Z" },
      ],
    },
    {
      id: "MP-102",
      projectId: "PR-02",
      type: "concrete",
      quantityT: 16,
      quantityRangeT: [13, 18],
      condition: "fair",
      grade: "B",
      surveyedAt: "2026-09-15T11:30:00Z",
      status: "verified",
      confidence: 0.78,
      evidence: [
        { kind: "survey-sheet", label: "Slab breakout survey", ref: "survey-kx-007", recordedAt: "2026-09-15T11:30:00Z" },
        { kind: "site-photo", label: "Breakout stockpile", ref: "/images/site/hero-demolition.jpg", recordedAt: "2026-09-15T12:10:00Z" },
        { kind: "lab-report", label: "Aggregate grading report", ref: "lab-2231", recordedAt: "2026-09-16T09:00:00Z" },
      ],
    },
    {
      id: "MP-103",
      projectId: "PR-01",
      type: "brick",
      quantityT: 14.5,
      quantityRangeT: [12, 17],
      condition: "good",
      grade: "A",
      surveyedAt: "2026-09-14T10:05:00Z",
      status: "passport-ready",
      confidence: 0.9,
      evidence: [
        { kind: "survey-sheet", label: "Soft-strip survey — facade pallets", ref: "survey-hr-015", recordedAt: "2026-09-14T10:05:00Z" },
        { kind: "site-photo", label: "Palletised reclaimed brick", ref: "/images/site/brick-pallets.jpg", recordedAt: "2026-09-14T10:40:00Z" },
      ],
    },
    {
      id: "MP-104",
      projectId: "PR-04",
      type: "timber",
      quantityT: 9.8,
      quantityRangeT: [8, 11.5],
      condition: "fair",
      grade: "B",
      surveyedAt: "2026-09-17T10:45:00Z",
      status: "passport-ready",
      confidence: 0.72,
      evidence: [
        { kind: "survey-sheet", label: "Beam and joist survey", ref: "survey-cy-003", recordedAt: "2026-09-17T10:45:00Z" },
        { kind: "site-photo", label: "Timber sorting area", ref: "/images/site/timber-stack.jpg", recordedAt: "2026-09-17T10:45:00Z" },
      ],
    },
    {
      id: "MP-105",
      projectId: "PR-03",
      type: "steel",
      quantityT: 6.2,
      quantityRangeT: [5.5, 7],
      condition: "good",
      grade: "A",
      surveyedAt: "2026-09-10T08:00:00Z",
      status: "passport-ready",
      confidence: 0.95,
      evidence: [
        { kind: "survey-sheet", label: "Structural steel schedule", ref: "survey-ber-011", recordedAt: "2026-09-10T08:00:00Z" },
        { kind: "site-photo", label: "Cut and graded sections", ref: "/images/site/steel-beams.jpg", recordedAt: "2026-09-10T08:30:00Z" },
      ],
    },
    {
      id: "MP-106",
      projectId: "PR-02",
      type: "plasterboard",
      quantityT: 4,
      quantityRangeT: [3.2, 4.8],
      condition: "fair",
      grade: "C",
      surveyedAt: "2026-09-15T13:15:00Z",
      status: "passport-ready",
      confidence: 0.6,
      evidence: [
        { kind: "survey-sheet", label: "Drywall strip-out tally", ref: "survey-kx-008", recordedAt: "2026-09-15T13:15:00Z" },
        { kind: "site-photo", label: "Yard — drywall bays", ref: "/images/site/plasterboard-stack.jpg", recordedAt: "2026-09-15T13:20:00Z" },
      ],
    },
    {
      id: "MP-107",
      projectId: "PR-03",
      type: "glass",
      quantityT: 3.5,
      quantityRangeT: [3, 4.2],
      condition: "good",
      grade: "B",
      surveyedAt: "2026-09-10T09:20:00Z",
      status: "passport-ready",
      confidence: 0.8,
      evidence: [
        { kind: "survey-sheet", label: "Curtain-wall glazing survey", ref: "survey-ber-012", recordedAt: "2026-09-10T09:20:00Z" },
        { kind: "site-photo", label: "Glazing storage", ref: "/images/site/glass-cullet.jpg", recordedAt: "2026-09-10T09:30:00Z" },
      ],
    },
  ],
  receivers: [
    {
      id: "R-001",
      name: "Riverstone Aggregates",
      location: "Park Royal, London NW10",
      dailyIntakeT: 45,
      currentStockT: 210,
      acceptedTypes: ["concrete", "brick"],
      distanceKm: 6,
    },
    {
      id: "R-002",
      name: "Brixton Reclaimed Building Materials",
      location: "London SW2",
      dailyIntakeT: 30,
      currentStockT: 140,
      acceptedTypes: ["brick", "timber", "plasterboard"],
      distanceKm: 14,
    },
    {
      id: "R-003",
      name: "Thamesside Steel Recovery",
      location: "London E16",
      dailyIntakeT: 60,
      currentStockT: 480,
      acceptedTypes: ["steel"],
      distanceKm: 21,
    },
    {
      id: "R-004",
      name: "North Acton Recycled Aggregates",
      location: "London NW10",
      dailyIntakeT: 80,
      currentStockT: 640,
      acceptedTypes: ["concrete", "glass", "plasterboard"],
      distanceKm: 8,
    },
    {
      id: "R-005",
      name: "Lea Valley Timber Works",
      location: "London N17",
      dailyIntakeT: 25,
      currentStockT: 95,
      acceptedTypes: ["timber"],
      distanceKm: 17,
    },
  ],
  slots: [
    // The scenario slot: Riverstone concrete intake, 15 t.
    { id: "SL-R1-CONC-0924", receiverId: "R-001", date: "2026-09-24", materialType: "concrete", capacityT: 15 },
    // The next intake day, free for live demo actions.
    { id: "SL-R1-CONC-0928", receiverId: "R-001", date: "2026-09-28", materialType: "concrete", capacityT: 15 },
    { id: "SL-R1-BRK-0928", receiverId: "R-001", date: "2026-09-28", materialType: "brick", capacityT: 12 },
    { id: "SL-R2-BRK-0928", receiverId: "R-002", date: "2026-09-28", materialType: "brick", capacityT: 10 },
    { id: "SL-R2-TMB-0928", receiverId: "R-002", date: "2026-09-28", materialType: "timber", capacityT: 8 },
    { id: "SL-R2-PLA-0928", receiverId: "R-002", date: "2026-09-28", materialType: "plasterboard", capacityT: 6 },
    { id: "SL-R3-STL-0928", receiverId: "R-003", date: "2026-09-28", materialType: "steel", capacityT: 9 },
    { id: "SL-R4-CONC-0928", receiverId: "R-004", date: "2026-09-28", materialType: "concrete", capacityT: 20 },
    { id: "SL-R4-GLS-0928", receiverId: "R-004", date: "2026-09-28", materialType: "glass", capacityT: 5 },
    { id: "SL-R4-PLA-0928", receiverId: "R-004", date: "2026-09-28", materialType: "plasterboard", capacityT: 6 },
    { id: "SL-R5-TMB-0928", receiverId: "R-005", date: "2026-09-28", materialType: "timber", capacityT: 12 },
  ],
  allocations: [
    {
      id: "AL-1",
      materialId: "MP-101",
      receiverId: "R-001",
      slotId: "SL-R1-CONC-0924",
      requestedT: 10,
      status: "cancelled",
      capacityBeforeT: 15,
      capacityAfterT: 5,
      decidedAt: "2026-09-22T09:05:00Z",
      updatedAt: "2026-09-22T10:15:00Z",
      candidates: [
        { receiverId: "R-001", suitability: 0.85, demand: 0.8, distanceKm: 6, availableT: 15, transportCostPerT: 2.84, handlingCostPerT: 3.5, score: 0.866, recommended: true },
        { receiverId: "R-004", suitability: 0.85, demand: 0.5, distanceKm: 8, availableT: 20, transportCostPerT: 3.12, handlingCostPerT: 3.5, score: 0.754, recommended: false },
      ],
    },
    {
      id: "AL-2",
      materialId: "MP-102",
      receiverId: "R-001",
      slotId: "SL-R1-CONC-0924",
      requestedT: 8,
      status: "confirmed",
      capacityBeforeT: 15,
      capacityAfterT: 7,
      decidedAt: "2026-09-22T09:40:00Z",
      updatedAt: "2026-09-22T10:15:03Z",
      candidates: [
        { receiverId: "R-001", suitability: 0.8, demand: 0.8, distanceKm: 6, availableT: 5, transportCostPerT: 2.84, handlingCostPerT: 3.5, score: 0.772, recommended: true },
        { receiverId: "R-004", suitability: 0.8, demand: 0.5, distanceKm: 8, availableT: 20, transportCostPerT: 3.12, handlingCostPerT: 3.5, score: 0.695, recommended: false },
      ],
    },
  ],
  bookings: [
    {
      id: "BK-1",
      allocationId: "AL-1",
      slotId: "SL-R1-CONC-0924",
      receiverId: "R-001",
      materialId: "MP-101",
      tonnesT: 10,
      status: "cancelled",
      capacityBeforeT: 15,
      capacityAfterT: 5,
      createdAt: "2026-09-22T09:05:00Z",
      updatedAt: "2026-09-22T10:15:00Z",
      cancelledAt: "2026-09-22T10:15:00Z",
      cancelledReason: "Programme change — retention slab reused on site",
    },
    {
      id: "BK-2",
      allocationId: "AL-2",
      slotId: "SL-R1-CONC-0924",
      receiverId: "R-001",
      materialId: "MP-102",
      tonnesT: 8,
      status: "confirmed",
      capacityBeforeT: 15,
      capacityAfterT: 7,
      createdAt: "2026-09-22T09:40:00Z",
      updatedAt: "2026-09-22T10:15:03Z",
    },
  ],
  verifications: [
    {
      id: "VR-1",
      bookingId: "BK-2",
      loadRef: "LOAD-1001",
      materialId: "MP-102",
      receiverId: "R-001",
      plannedT: 8,
      actualT: 7.6,
      acceptedT: 7.4,
      rejectedT: 0.2,
      rejectReason: "Contamination — mortar fines",
      status: "verified",
      verifiedAt: "2026-09-26T14:05:00Z",
      evidence: [
        { kind: "weighbridge-ticket", label: "WB-77213", ref: "wb-77213", recordedAt: "2026-09-26T13:55:00Z" },
        { kind: "site-photo", label: "Intake bay 02 — offload", ref: "photo-rs-intake-02", recordedAt: "2026-09-26T14:02:00Z" },
      ],
    },
  ],
  events,
  demands: [
    {
      id: "DM-201",
      receiverId: "R-001",
      materialType: "concrete",
      requiredT: 100,
      period: "October 2026",
      location: "Riverstone Aggregates",
      status: "OPEN",
      createdAt: "2026-09-15T10:00:00Z",
    },
    {
      id: "DM-202",
      receiverId: "R-002",
      materialType: "brick",
      requiredT: 20,
      period: "Q4 2026",
      location: "London Reclaimed Brick",
      status: "PARTIALLY_COVERED",
      createdAt: "2026-09-20T09:00:00Z",
    },
  ],
};

/**
 * Fresh deep clone per call, so callers (and the capacity engine) can mutate
 * freely without cross-contaminating the seed.
 */
export function demoDataset(): GreenLoopDataset {
  return structuredClone(base);
}

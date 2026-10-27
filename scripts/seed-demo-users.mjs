import { DatabaseSync } from "node:sqlite";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, scryptSync } from "node:crypto";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const db = new DatabaseSync(resolve(root, "server/data/greenloop.sqlite"));

const passwordHash = (password) => {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
};

const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const now = new Date().toISOString();

// Provider user
const providerId = "USR-PROVIDER-DEMO";
const providerEmail = "provider@greenloop.demo";
const providerProfile = {
  name: "Vikram Malhotra",
  organization: "Metro Reclaimers Ltd",
  location: "Okhla Phase III, New Delhi",
  workspaces: ["provider", "receiver"],
  activeWorkspace: "provider",
  phone: "+91 98110 12345",
};

// Receiver user
const receiverId = "USR-RECEIVER-DEMO";
const receiverFacilityId = "REC-APEX-001";
const receiverEmail = "receiver@greenloop.demo";
const receiverProfile = {
  name: "Ananya Sharma",
  organization: "Apex Eco Processing",
  location: "Sector 62, Noida, Uttar Pradesh",
  workspaces: ["receiver", "provider"],
  activeWorkspace: "receiver",
  receiverId: receiverFacilityId,
  phone: "+91 98220 54321",
};

// Seed users
db.prepare("INSERT OR REPLACE INTO users VALUES (?, ?, ?, ?)").run(
  providerId,
  providerEmail,
  passwordHash("password123"),
  JSON.stringify(providerProfile)
);

db.prepare("INSERT OR REPLACE INTO users VALUES (?, ?, ?, ?)").run(
  receiverId,
  receiverEmail,
  passwordHash("password123"),
  JSON.stringify(receiverProfile)
);

// Owners
db.prepare("INSERT OR REPLACE INTO owners VALUES (?, ?)").run("PROJ-001", providerId);
db.prepare("INSERT OR REPLACE INTO owners VALUES (?, ?)").run("MAT-STEEL-001", providerId);
db.prepare("INSERT OR REPLACE INTO owners VALUES (?, ?)").run("MAT-CONC-002", providerId);
db.prepare("INSERT OR REPLACE INTO owners VALUES (?, ?)").run(receiverFacilityId, receiverId);

// Dataset document
const dataset = {
  projects: [
    {
      id: "PROJ-001",
      name: "Metro Civic Center Deconstruction",
      location: "Okhla Phase III, New Delhi",
      status: "active",
      createdAt: now,
    },
  ],
  materials: [
    {
      id: "MAT-STEEL-001",
      projectId: "PROJ-001",
      type: "steel",
      quantityT: 80,
      quantityRangeT: [75, 85],
      condition: "good",
      grade: "A",
      confidence: 0.95,
      pricePerT: 32000,
      availableFrom: day(1),
      listingStatus: "published",
      surveyNotes: "Structural I-beams and universal columns surveyed before dismantling.",
      evidence: [
        {
          id: "EVD-001",
          kind: "site-photo",
          label: "Stockpile Survey & Mill Marks",
          status: "valid",
          recordedAt: now,
          notes: "Visual inspection verified clean flange surfaces and grade stamp.",
        },
        {
          id: "EVD-002",
          kind: "test-report",
          label: "Tensile Strength Test Certificate (IS 2062)",
          status: "valid",
          recordedAt: now,
          notes: "Yield strength 250 MPa verified by NABL accredited lab.",
        },
      ],
      createdAt: now,
    },
    {
      id: "MAT-CONC-002",
      projectId: "PROJ-001",
      type: "crushed concrete",
      quantityT: 150,
      quantityRangeT: [140, 160],
      condition: "good",
      grade: "A",
      confidence: 0.9,
      pricePerT: 850,
      availableFrom: day(1),
      listingStatus: "published",
      surveyNotes: "High-grade sound concrete rubble crushed and screened to 40mm down.",
      evidence: [
        {
          id: "EVD-003",
          kind: "lab-report",
          label: "IS 383 Sieve & Silt Test Report",
          status: "valid",
          recordedAt: now,
          notes: "Compliant silt content under 2.5%, suitable for structural fill.",
        },
      ],
      createdAt: now,
    },
  ],
  receivers: [
    {
      id: receiverFacilityId,
      name: "Apex Eco Processing Facility",
      location: "Sector 62, Noida, Uttar Pradesh",
      acceptedTypes: ["steel", "crushed concrete", "brick"],
      dailyIntakeT: 100,
      distanceKm: 28,
      distanceKnown: true,
      createdAt: now,
    },
  ],
  slots: [
    {
      id: "SLOT-STEEL-01",
      receiverId: receiverFacilityId,
      materialType: "steel",
      date: day(7),
      capacityT: 60,
    },
    {
      id: "SLOT-CONC-01",
      receiverId: receiverFacilityId,
      materialType: "crushed concrete",
      date: day(7),
      capacityT: 100,
    },
  ],
  allocations: [],
  bookings: [],
  verifications: [],
  demands: [],
  offers: [],
  events: [
    {
      id: "EV-001",
      kind: "material.published",
      at: now,
      actor: { kind: "contractor", name: "Vikram Malhotra" },
      summary: "Published 80 t Structural Steel Beams asset passport",
      subjectIds: ["PROJ-001", "MAT-STEEL-001"],
    },
    {
      id: "EV-002",
      kind: "material.published",
      at: now,
      actor: { kind: "contractor", name: "Vikram Malhotra" },
      summary: "Published 150 t Crushed Concrete Base asset passport",
      subjectIds: ["PROJ-001", "MAT-CONC-002"],
    },
  ],
  supportRequests: [],
};

db.prepare("INSERT OR REPLACE INTO state VALUES (1, ?)").run(JSON.stringify(dataset));
console.log("Demo dataset and baseline records initialized successfully.");

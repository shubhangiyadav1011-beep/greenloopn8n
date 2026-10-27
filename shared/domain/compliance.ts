/**
 * GreenLoop Compliance & Category Evidence Requirements
 *
 * Defines mandatory and recommended documentation standards per material category
 * and intended application (e.g. structural reuse vs downcycled fill).
 * Pure data and deterministic evaluation logic; shared across backend and frontend.
 */

import type {
  MaterialPassport,
  MaterialTypeKey,
  MaterialGrade,
  Evidence,
  EvidenceKind,
  PassportVerificationStatus,
} from "./types.ts";

export interface CategoryEvidenceRequirement {
  id: string;
  kind: EvidenceKind;
  name: string;
  description: string;
  mandatory: boolean;
  standard?: string;
}

export interface PassportComplianceResult {
  isCompliant: boolean;
  verificationStatus: PassportVerificationStatus;
  requirements: Array<{
    requirement: CategoryEvidenceRequirement;
    satisfied: boolean;
    evidenceItem?: Evidence;
    reason?: string;
  }>;
  missingMandatory: string[];
  rejectedEvidence: Array<{ label: string; reason: string }>;
  limitations: string[];
  explanation: string;
}

/**
 * Return evidence standards for a specific material category and grade.
 */
export function getCategoryEvidenceRequirements(
  materialType: MaterialTypeKey,
  grade: MaterialGrade = "A",
  application: "structural" | "secondary" | "general" = grade === "A" ? "structural" : "secondary"
): CategoryEvidenceRequirement[] {
  const normType = String(materialType).toLowerCase();

  switch (normType) {
    case "concrete":
      if (application === "structural" || grade === "A" || grade === "B") {
        return [
          {
            id: "concrete_lab",
            kind: "lab-report",
            name: "Compressive Strength Laboratory Test",
            description: "Core test assay or rebound hammer report certified to IS 516 / IS 456 / BS EN 12390.",
            mandatory: true,
            standard: "IS 516 / IS 456",
          },
          {
            id: "concrete_photos",
            kind: "site-photo",
            name: "Visual Inspection & Rebar Exposure",
            description: "High-resolution photographs of concrete elements, surface crack patterns, and reinforcement exposure.",
            mandatory: true,
          },
          {
            id: "concrete_survey",
            kind: "survey-sheet",
            name: "Pre-Demolition Salvage Survey",
            description: "Surveyor record detailing structural origin, estimated volume, and deconstruction methodology.",
            mandatory: true,
          },
        ];
      }
      return [
        {
          id: "concrete_secondary_photos",
          kind: "site-photo",
          name: "Visual Condition Photo",
          description: "Photographs confirming absence of excessive soil, chemical residue, or bitumen contamination.",
          mandatory: true,
        },
        {
          id: "concrete_secondary_survey",
          kind: "survey-sheet",
          name: "Contaminant Assessment Sheet",
          description: "Salvage sheet confirming secondary fill or crushing suitability.",
          mandatory: false,
        },
      ];

    case "steel":
      if (application === "structural" || grade === "A" || grade === "B") {
        return [
          {
            id: "steel_lab",
            kind: "lab-report",
            name: "Tensile Strength & Metallurgical Assay",
            description: "Certified yield/tensile test sheet or original mill test certificate (IS 2062 / EN 10025).",
            mandatory: true,
            standard: "IS 2062 / EN 10025",
          },
          {
            id: "steel_photos",
            kind: "site-photo",
            name: "Flange, Web & Corrosion Inspection",
            description: "Photographs documenting section straightness, corrosion pitting index, and weld integrity.",
            mandatory: true,
          },
          {
            id: "steel_survey",
            kind: "survey-sheet",
            name: "Structural Dimension & Provenance Sheet",
            description: "Cross-section dimension measurements, length schedule, and structural origin documentation.",
            mandatory: true,
          },
        ];
      }
      return [
        {
          id: "steel_scrap_photos",
          kind: "site-photo",
          name: "Visual Condition Photo",
          description: "Photographic record of salvage steel geometry and surface condition.",
          mandatory: true,
        },
      ];

    case "brick":
      if (grade === "A" || grade === "B") {
        return [
          {
            id: "brick_photos",
            kind: "site-photo",
            name: "Mortar Cleanliness & Efflorescence Inspection",
            description: "Photographs demonstrating mortar cleanability, absence of chemical efflorescence, and palletization.",
            mandatory: true,
          },
          {
            id: "brick_survey",
            kind: "survey-sheet",
            name: "Masonry Salvage & Format Sheet",
            description: "Brick format dimensions, quantity count, and salvage handling method.",
            mandatory: true,
          },
        ];
      }
      return [
        {
          id: "brick_crush_photos",
          kind: "site-photo",
          name: "Crushed Brick Inspection Photo",
          description: "Visual inspection for sub-base or aggregate reuse.",
          mandatory: true,
        },
      ];

    case "timber":
      if (grade === "A" || grade === "B") {
        return [
          {
            id: "timber_custody",
            kind: "chain-of-custody",
            name: "Chain of Custody & Treatment History",
            description: "Document proving provenance, wood species, and chemical preservation/treatment history.",
            mandatory: true,
          },
          {
            id: "timber_survey",
            kind: "survey-sheet",
            name: "Moisture Content & Fungal/Rot Inspection",
            description: "Inspection record confirming moisture content < 18% and zero dry rot or fungal decay.",
            mandatory: true,
          },
          {
            id: "timber_photos",
            kind: "site-photo",
            name: "End-Grain & Surface Inspection Photos",
            description: "High-resolution photos of section grain, nail/screw holes, and structural straightness.",
            mandatory: true,
          },
        ];
      }
      return [
        {
          id: "timber_general_photos",
          kind: "site-photo",
          name: "Visual Inspection Photo",
          description: "Photographs of salvaged timber pieces and dimensions.",
          mandatory: true,
        },
      ];

    case "plasterboard":
      return [
        {
          id: "plasterboard_survey",
          kind: "survey-sheet",
          name: "Salvage Integrity & Contaminant Audit",
          description: "Pre-demolition audit confirming panels are free from water damage, mold, and hazardous adhesives.",
          mandatory: true,
        },
        {
          id: "plasterboard_photos",
          kind: "site-photo",
          name: "Panel Surface & Edge Photos",
          description: "Photographs of panel face integrity and palletization condition.",
          mandatory: true,
        },
      ];

    case "glass":
      return [
        {
          id: "glass_survey",
          kind: "survey-sheet",
          name: "Glazing Specification & Safety Rating",
          description: "Documentation of tempered/laminated safety mark, pane dimensions, and U-value / thickness.",
          mandatory: true,
        },
        {
          id: "glass_photos",
          kind: "site-photo",
          name: "Edge & Seal Photographic Inspection",
          description: "Detailed photos checking for edge chips, thermal fractures, or seal failure in double-glazed units.",
          mandatory: true,
        },
      ];

    default:
      return [
        {
          id: "general_photos",
          kind: "site-photo",
          name: "Photographic Condition Record",
          description: "Visual evidence showing material condition, packaging, and storage on site.",
          mandatory: true,
        },
        {
          id: "general_survey",
          kind: "survey-sheet",
          name: "Salvage Survey Sheet",
          description: "Survey notes and recovery methodology sheet.",
          mandatory: false,
        },
      ];
  }
}

/**
 * Deterministically evaluate whether a material passport meets category compliance requirements.
 */
export function evaluatePassportCompliance(
  material: MaterialPassport,
  intendedApplication?: "structural" | "secondary" | "general"
): PassportComplianceResult {
  const reqs = getCategoryEvidenceRequirements(material.type, material.grade, intendedApplication);
  const evidenceList = Array.isArray(material.evidence) ? material.evidence : [];

  const rejectedEvidence: Array<{ label: string; reason: string }> = [];
  for (const item of evidenceList) {
    if (item.status === "rejected") {
      rejectedEvidence.push({
        label: item.label || item.kind,
        reason: item.rejectionReason || "Document rejected by compliance reviewer",
      });
    }
  }

  const requirementsState = reqs.map((req) => {
    // Find non-rejected evidence of matching kind (or alias kind)
    const matching = evidenceList.find((item: Evidence) => {
      if (item.status === "rejected") return false;
      if (item.kind === req.kind) return true;
      // Allow lab-report to satisfy certificate/test-report and vice versa
      if (req.kind === "lab-report" && ["certificate", "test-report"].includes(item.kind)) return true;
      if (req.kind === "certificate" && ["lab-report", "test-report"].includes(item.kind)) return true;
      return false;
    });

    const isSatisfied = Boolean(matching);
    let reason: string | undefined;
    if (!isSatisfied) {
      const rejectedMatch = evidenceList.find((item: Evidence) => item.kind === req.kind && item.status === "rejected");
      if (rejectedMatch) {
        reason = `Document rejected: ${rejectedMatch.rejectionReason || "Criteria not met"}`;
      } else {
        reason = "Document not uploaded";
      }
    }

    return {
      requirement: req,
      satisfied: isSatisfied,
      evidenceItem: matching,
      reason,
    };
  });

  const missingMandatory: string[] = [];
  for (const item of requirementsState) {
    if (item.requirement.mandatory && !item.satisfied) {
      missingMandatory.push(`${item.requirement.name} (${item.requirement.description})`);
    }
  }

  const verificationStatus: PassportVerificationStatus =
    material.verificationStatus || (material.status === "verified" ? "verified" : "unverified");

  const limitations: string[] = [];
  if (material.grade === "C") {
    limitations.push("Designated for secondary or downcycled application only; not suitable for primary structural reuse.");
  }
  if (verificationStatus === "rejected") {
    limitations.push(`Verification rejected: ${material.rejectionReason || "Failed compliance review criteria."}`);
  } else if (verificationStatus === "unverified" || verificationStatus === "evidence-submitted") {
    limitations.push("Preliminary declaration only; pending formal reviewer certification and intake weighbridge slip.");
  }

  const isCompliant =
    missingMandatory.length === 0 &&
    verificationStatus !== "rejected" &&
    rejectedEvidence.length === 0;

  let explanation: string;
  if (verificationStatus === "rejected") {
    explanation = `Passport verification rejected: ${material.rejectionReason || "Verification criteria failed."}`;
  } else if (!isCompliant) {
    explanation = `Missing ${missingMandatory.length} mandatory compliance document(s) for ${material.type} (Grade ${material.grade}).`;
  } else if (verificationStatus === "verified") {
    explanation = `Fully verified and certified compliant for ${material.type} reuse.`;
  } else {
    explanation = `Mandatory category documents attached; pending reviewer certification.`;
  }

  return {
    isCompliant,
    verificationStatus,
    requirements: requirementsState,
    missingMandatory,
    rejectedEvidence,
    limitations,
    explanation,
  };
}

import React, { useState, useMemo } from "react";
import { Link } from "react-router";
import type { MaterialPassport, Evidence, EvidenceKind, MaterialProvenance } from "@shared/domain/types";
import { evaluatePassportCompliance } from "@shared/domain/compliance";
import { useGreenLoopStore } from "@/store/GreenLoopStore.helpers";
import StatusBadge from "./StatusBadge";
import { formatDate } from "@/utils";

interface PassportVerificationWorkspaceProps {
  material: MaterialPassport;
  isOwner: boolean;
  canReview: boolean;
}

const KIND_LABELS: Record<EvidenceKind, string> = {
  "lab-report": "Laboratory Test Report",
  "certificate": "Quality Certificate",
  "test-report": "Field / Tensile Test Report",
  "chain-of-custody": "Chain of Custody Record",
  "survey-sheet": "Site Survey Sheet",
  "site-photo": "Inspection / Site Photo",
  "weighbridge-ticket": "Weighbridge Delivery Ticket",
};

export default function PassportVerificationWorkspace({
  material,
  isOwner,
  canReview,
}: PassportVerificationWorkspaceProps) {
  const {
    dataset,
    addMaterialEvidenceAction,
    removeMaterialEvidenceAction,
    submitPassportForReviewAction,
    reviewPassportAction,
    updateMaterialPassportDetailsAction,
  } = useGreenLoopStore();

  // Modals state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [showEditDetailsModal, setShowEditDetailsModal] = useState(false);

  // Upload & evidence reuse state
  const [uploadSource, setUploadSource] = useState<"upload" | "existing">("upload");
  const [selectedExistingRef, setSelectedExistingRef] = useState<string>("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadKind, setUploadKind] = useState<EvidenceKind>("lab-report");
  const [uploadLabel, setUploadLabel] = useState("");
  const [uploadNotes, setUploadNotes] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Submit for review state
  const [submitNotes, setSubmitNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Review state
  const [reviewStatus, setReviewStatus] = useState<"verified" | "rejected">("verified");
  const [reviewNotes, setReviewNotes] = useState("");
  const [reviewRejectionReason, setReviewRejectionReason] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [evidenceItemDecisions, setEvidenceItemDecisions] = useState<
    Record<string, { status: "valid" | "rejected"; reason?: string }>
  >({});

  // Edit details state
  const [editName, setEditName] = useState(material.name || "");
  const [editDimensions, setEditDimensions] = useState(material.dimensions || "");
  const [editStructureType, setEditStructureType] = useState(material.provenance?.structureType || "");
  const [editYearBuilt, setEditYearBuilt] = useState<string>(
    material.provenance?.yearBuilt ? String(material.provenance.yearBuilt) : ""
  );
  const [editDeconstructionMethod, setEditDeconstructionMethod] = useState(
    material.provenance?.deconstructionMethod || ""
  );
  const [editPreviousUse, setEditPreviousUse] = useState(material.provenance?.previousUse || "");
  const [editHandlingInstructions, setEditHandlingInstructions] = useState(
    material.provenance?.handlingInstructions || ""
  );
  const [editSurveyNotes, setEditSurveyNotes] = useState(material.surveyNotes || "");
  const [savingDetails, setSavingDetails] = useState(false);

  // Compliance evaluation
  const compliance = evaluatePassportCompliance(material);
  const currentVerificationStatus = material.verificationStatus ?? "unverified";

  // Reusable repository evidence across materials (e.g. lab reports, accreditations, ISO certs)
  const existingEvidenceOptions = useMemo(() => {
    const map = new Map<string, { ref: string; label: string; kind: EvidenceKind; notes?: string; sourceMaterial: string }>();
    for (const m of dataset.materials) {
      if (m.evidence) {
        for (const ev of m.evidence) {
          if (ev.ref && !map.has(ev.ref)) {
            map.set(ev.ref, {
              ref: ev.ref,
              label: ev.label,
              kind: ev.kind,
              notes: ev.notes,
              sourceMaterial: m.name || m.id,
            });
          }
        }
      }
    }
    return Array.from(map.values());
  }, [dataset.materials]);

  // Connected bookings for this passport
  const connectedBookings = useMemo(() => {
    return dataset.bookings.filter((b) => b.materialId === material.id);
  }, [dataset.bookings, material.id]);

  // Handle genuine file upload
  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) {
      setUploadError("Please select a file to upload.");
      return;
    }
    if (!uploadLabel.trim()) {
      setUploadError("Please enter a document label.");
      return;
    }

    // Check for duplicate document label and kind on this passport
    const isDuplicate = material.evidence?.some(
      (ev) => ev.label.trim().toLowerCase() === uploadLabel.trim().toLowerCase() && ev.kind === uploadKind
    );
    if (isDuplicate) {
      setUploadError("A document with this label and type is already attached to this passport. Duplicate submission prevented.");
      return;
    }

    try {
      setUploading(true);
      setUploadError(null);

      // Read file as base64 data URL
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsDataURL(uploadFile);
      });

      // Post to genuine /api/uploads
      const res = await fetch("/api/uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: uploadFile.name,
          data: dataUrl,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || `Upload failed with status ${res.status}`);
      }

      const { ref } = await res.json();

      // Dispatch addMaterialEvidenceAction
      const newEvidence: Evidence = {
        id: `EVD-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        kind: uploadKind,
        label: uploadLabel.trim(),
        ref,
        notes: uploadNotes.trim() || undefined,
        status: "pending",
        recordedAt: new Date().toISOString(),
      };

      const result = await addMaterialEvidenceAction(material.id, newEvidence);
      if (!result) throw new Error("Failed to attach evidence to passport.");

      // Reset and close
      setUploadFile(null);
      setUploadLabel("");
      setUploadNotes("");
      setShowUploadModal(false);
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : "Failed to upload evidence.");
    } finally {
      setUploading(false);
    }
  };

  // Handle attaching an already verified/uploaded document from repository
  const handleAttachExisting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedExistingRef) {
      setUploadError("Please select an existing document from the repository.");
      return;
    }

    const doc = existingEvidenceOptions.find((d) => d.ref === selectedExistingRef);
    if (!doc) {
      setUploadError("Selected document could not be found.");
      return;
    }

    // Check duplicate
    const isAlreadyAttached = material.evidence?.some((ev) => ev.ref === doc.ref);
    if (isAlreadyAttached) {
      setUploadError("This document is already attached to this material passport. Duplicate attachment prevented.");
      return;
    }

    try {
      setUploading(true);
      setUploadError(null);

      const newEvidence: Evidence = {
        id: `EVD-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        kind: doc.kind,
        label: doc.label,
        ref: doc.ref,
        notes: doc.notes ? `${doc.notes} (Reused from ${doc.sourceMaterial})` : `Reused from ${doc.sourceMaterial}`,
        status: "pending",
        recordedAt: new Date().toISOString(),
      };

      const result = await addMaterialEvidenceAction(material.id, newEvidence);
      if (!result) throw new Error("Failed to attach existing document.");

      setSelectedExistingRef("");
      setShowUploadModal(false);
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : "Failed to attach document.");
    } finally {
      setUploading(false);
    }
  };

  // Handle Remove Evidence
  const handleRemoveEvidence = async (evidenceIdOrRef: string, label: string) => {
    if (!confirm(`Are you sure you want to remove evidence "${label}"?`)) return;
    try {
      await removeMaterialEvidenceAction(material.id, evidenceIdOrRef);
    } catch (err) {
      alert("Failed to remove evidence: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  // Handle Submit for Review
  const handleSubmitForReview = async () => {
    try {
      setSubmitting(true);
      await submitPassportForReviewAction(material.id, submitNotes.trim() || undefined);
      setShowSubmitModal(false);
      setSubmitNotes("");
    } catch (err) {
      alert("Failed to submit passport: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Review action
  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (reviewStatus === "rejected" && !reviewRejectionReason.trim()) {
      setReviewError("A rejection reason is required when rejecting a passport.");
      return;
    }

    if (reviewStatus === "verified" && !compliance.isCompliant) {
      setReviewError(
        `Cannot verify passport: Missing mandatory evidence (${compliance.missingMandatory.join(", ")}).`
      );
      return;
    }

    try {
      setReviewing(true);
      setReviewError(null);

      const evidenceReviews = Object.entries(evidenceItemDecisions).map(([refOrId, decision]) => ({
        refOrId,
        status: decision.status,
        rejectionReason: decision.reason,
      }));

      const res = await reviewPassportAction({
        materialId: material.id,
        status: reviewStatus,
        notes: reviewNotes.trim() || undefined,
        rejectionReason: reviewStatus === "rejected" ? reviewRejectionReason.trim() : undefined,
        evidenceReviews: evidenceReviews.length ? evidenceReviews : undefined,
      });

      if (!res) throw new Error("Review action failed to save.");
      setShowReviewModal(false);
      setReviewNotes("");
      setReviewRejectionReason("");
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : "Verification review failed.");
    } finally {
      setReviewing(false);
    }
  };

  // Handle Edit Details
  const handleSaveDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSavingDetails(true);
      const provenance: MaterialProvenance = {
        structureType: editStructureType.trim() || undefined,
        yearBuilt: editYearBuilt ? parseInt(editYearBuilt, 10) : undefined,
        deconstructionMethod: editDeconstructionMethod.trim() || undefined,
        previousUse: editPreviousUse.trim() || undefined,
        handlingInstructions: editHandlingInstructions.trim() || undefined,
      };

      await updateMaterialPassportDetailsAction(material.id, {
        name: editName.trim() || undefined,
        dimensions: editDimensions.trim() || undefined,
        provenance,
        surveyNotes: editSurveyNotes.trim() || undefined,
      });

      setShowEditDetailsModal(false);
    } catch (err) {
      alert("Failed to save passport details: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSavingDetails(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 0. RESPONSIBLE PARTY & PLAIN-LANGUAGE ACTION BANNER */}
      <section
        className={`rounded-2xl border p-4 text-xs shadow-sm ${
          currentVerificationStatus === "rejected"
            ? "border-red-300 bg-red-50/80 dark:border-red-900/60 dark:bg-red-950/20"
            : currentVerificationStatus === "under-review"
            ? "border-amber-300 bg-amber-50/80 dark:border-amber-900/60 dark:bg-amber-950/20"
            : currentVerificationStatus === "verified"
            ? "border-emerald-300 bg-emerald-50/80 dark:border-emerald-900/60 dark:bg-emerald-950/20"
            : currentVerificationStatus === "evidence-submitted"
            ? "border-blue-300 bg-blue-50/80 dark:border-blue-900/60 dark:bg-blue-950/20"
            : "border-[#d8ded9] bg-[#fbfcfb] dark:border-steel-800 dark:bg-[#17251d]"
        }`}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-bold uppercase tracking-wider text-[10px] text-steel-500 dark:text-steel-400">
                Action Held By:
              </span>
              <span className="font-bold text-[#152e1f] dark:text-white">
                {currentVerificationStatus === "under-review"
                  ? "Authorized Reviewer / Receiver"
                  : currentVerificationStatus === "verified"
                  ? "Receiving Facility Gate (Weighbridge Intake)"
                  : "Material Provider"}
              </span>
            </div>
            <h3 className="font-archivo text-sm font-bold text-[#152e1f] dark:text-white">
              {currentVerificationStatus === "rejected"
                ? "Corrective Action Required — Verification Blocked"
                : currentVerificationStatus === "under-review"
                ? "Third-Party Compliance Review in Progress"
                : currentVerificationStatus === "verified"
                ? "Certified Passport — Ready for Intended Structural Reuse"
                : currentVerificationStatus === "evidence-submitted"
                ? "Evidence on File — Ready for Review Submission"
                : "Submit Mandatory Category Evidence to Initiate Verification"}
            </h3>
            <p className="text-[#4e6052] dark:text-gray-300 leading-relaxed">
              {currentVerificationStatus === "rejected" && (
                <>
                  Deficiency: <strong>{material.rejectionReason || "Standards criteria not met"}</strong>.
                  Upload corrective lab reports or test documents below. Once corrective evidence is attached, the passport will automatically reset to evidence-submitted for re-evaluation.
                </>
              )}
              {currentVerificationStatus === "under-review" && (
                <>
                  Supporting evidence ({material.evidence?.length || 0} documents) has been submitted. Reviewers must evaluate laboratory data against mandatory standards ({compliance.requirements.map(r => r.requirement.name).join(", ")}).
                </>
              )}
              {currentVerificationStatus === "verified" && (
                <>
                  Verified by <strong>{material.verifiedBy || "Compliance Auditor"}</strong> on {material.verifiedAt ? formatDate(material.verifiedAt) : "Date unrecorded"}. Valid for structural reuse. Physical load weight and accepted grade will be reconciled at receiver gate weighbridge upon delivery.
                </>
              )}
              {currentVerificationStatus === "evidence-submitted" && (
                <>
                  {material.evidence?.length} evidence items attached. Submit this passport for formal review, or an authorized reviewer can evaluate compliance now.
                </>
              )}
              {currentVerificationStatus === "unverified" && (
                <>
                  This asset currently relies on unverified self-reported survey data. {compliance.missingMandatory.length > 0 ? `Mandatory category requirements missing: ${compliance.missingMandatory.join("; ")}.` : "Upload supporting laboratory or test certificates to unlock certified procurement."}
                </>
              )}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {currentVerificationStatus === "rejected" && isOwner && (
              <button
                type="button"
                onClick={() => setShowUploadModal(true)}
                className="rounded-xl bg-red-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-red-700 shadow-xs"
              >
                + Upload Corrective Document
              </button>
            )}
            {currentVerificationStatus === "under-review" && canReview && !isOwner && (
              <button
                type="button"
                onClick={() => {
                  const isOk = compliance.isCompliant;
                  setReviewStatus(isOk ? "verified" : "rejected");
                  if (!isOk) {
                    setReviewRejectionReason(`Missing mandatory category documentation: ${compliance.missingMandatory.join("; ")}`);
                  }
                  setShowReviewModal(true);
                }}
                className="rounded-xl bg-[#B7F34A] px-3.5 py-1.5 text-xs font-bold text-[#0c1811] hover:bg-[#cbf975] shadow-xs"
              >
                Evaluate &amp; Issue Decision →
              </button>
            )}
            {currentVerificationStatus === "unverified" && isOwner && (
              <button
                type="button"
                onClick={() => setShowUploadModal(true)}
                className="rounded-xl bg-[#1a3827] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-[#28573d] dark:bg-[#00e599] dark:text-[#0c1811] shadow-xs"
              >
                + Add Category Evidence
              </button>
            )}
          </div>
        </div>
      </section>

      {/* 1. VERIFICATION STATUS HEADER & WORKFLOW CONTROL */}
      <section className="overflow-hidden rounded-2xl border border-[#d2dbd4] bg-white p-6 shadow-sm dark:border-steel-800 dark:bg-[#17251d]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold uppercase tracking-wider text-[#55695a] dark:text-gray-400">
                Verification State
              </span>
              <StatusBadge status={currentVerificationStatus} />
            </div>
            <h2 className="font-archivo text-xl font-bold text-[#152e1f] dark:text-white">
              {material.name || `${material.type.toUpperCase()} Asset Passport`}
            </h2>
            <p className="text-xs text-[#526456] dark:text-gray-400">
              {currentVerificationStatus === "verified" && material.verifiedAt && (
                <span>
                  Certified Verified on {formatDate(material.verifiedAt)} by{" "}
                  <strong>{material.verifiedBy || "Compliance Reviewer"}</strong>
                </span>
              )}
              {currentVerificationStatus === "under-review" && (
                <span className="text-amber-700 dark:text-amber-300">
                  Passport submitted for third-party compliance review. Decisions pending.
                </span>
              )}
              {currentVerificationStatus === "evidence-submitted" && (
                <span className="text-blue-700 dark:text-blue-300">
                  Evidence documents uploaded. Ready for review submission.
                </span>
              )}
              {currentVerificationStatus === "unverified" && (
                <span className="text-gray-500 dark:text-gray-400">
                  No verification evidence submitted. Ineligible for certified structural procurement.
                </span>
              )}
              {currentVerificationStatus === "rejected" && (
                <span className="font-medium text-red-600 dark:text-red-400">
                  Verification Rejected: {material.rejectionReason || "Requirements not met."}
                </span>
              )}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {isOwner && (
              <>
                <button
                  type="button"
                  onClick={() => setShowEditDetailsModal(true)}
                  className="rounded-xl border border-[#cbd5ce] bg-[#f8faf8] px-4 py-2 text-xs font-semibold text-[#183623] hover:bg-[#eaf2eb] dark:border-steel-700 dark:bg-[#1f3126] dark:text-white"
                >
                  Edit Passport Details
                </button>
                <button
                  type="button"
                  onClick={() => setShowUploadModal(true)}
                  className="rounded-xl border border-[#cbd5ce] bg-[#f8faf8] px-4 py-2 text-xs font-semibold text-[#183623] hover:bg-[#eaf2eb] dark:border-steel-700 dark:bg-[#1f3126] dark:text-white"
                >
                  + Upload Evidence
                </button>
                {currentVerificationStatus !== "under-review" && currentVerificationStatus !== "verified" && (
                  <button
                    type="button"
                    onClick={() => setShowSubmitModal(true)}
                    disabled={!material.evidence?.length}
                    className="rounded-xl bg-[#1a3827] px-4 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-[#28573d] disabled:opacity-50 dark:bg-[#00e599] dark:text-[#0c1811] dark:hover:bg-[#34f5b0]"
                  >
                    Submit for Review
                  </button>
                )}
              </>
            )}

            {canReview && !isOwner && (
              <button
                type="button"
                onClick={() => {
                  setReviewStatus(compliance.isCompliant ? "verified" : "rejected");
                  setShowReviewModal(true);
                }}
                className="rounded-xl bg-[#B7F34A] px-4 py-2 text-xs font-bold text-[#0c1811] shadow-xs transition hover:bg-[#cbf975]"
              >
                Review &amp; Verify Passport
              </button>
            )}
          </div>
        </div>

        {/* Verification Limitations & Compliance Alert */}
        <div className="mt-4 rounded-xl border border-[#e1e8e2] bg-[#f7faf7] p-3 text-xs dark:border-steel-800 dark:bg-white/[0.02]">
          <div className="flex items-start gap-2.5">
            <span className="text-base">📋</span>
            <div className="space-y-0.5">
              <p className="font-semibold text-[#183623] dark:text-white">
                Compliance Status:{" "}
                <span className={compliance.isCompliant ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"}>
                  {compliance.isCompliant ? "Fully Compliant" : "Missing Mandatory Documentation"}
                </span>
              </p>
              <p className="text-[#4e6052] dark:text-gray-300">
                {compliance.explanation}
              </p>
              {compliance.limitations.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1.5 pt-1">
                  {compliance.limitations.map((lim, idx) => (
                    <span
                      key={idx}
                      className="rounded bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
                    >
                      ⚠ {lim}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* 2. PROVENANCE & TECHNICAL DIMENSIONS */}
      <section className="rounded-2xl border border-[#d2dbd4] bg-white p-6 shadow-sm dark:border-steel-800 dark:bg-[#17251d]">
        <div className="flex items-center justify-between border-b border-[#ecebe6] pb-3 dark:border-steel-800">
          <h3 className="font-archivo text-base font-bold text-[#152e1f] dark:text-white">
            Asset Identity &amp; Provenance
          </h3>
          {material.dimensions && (
            <span className="font-mono text-xs font-semibold text-[#3b5742] dark:text-[#a0cfae]">
              Dimensions: {material.dimensions}
            </span>
          )}
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 text-xs">
          <div className="rounded-xl border border-[#eeebe2] bg-[#fbfaf6] p-3 dark:border-steel-800 dark:bg-white/[0.02]">
            <span className="font-bold uppercase tracking-wider text-[#79887c] dark:text-gray-400 text-[10px]">
              Structure of Origin
            </span>
            <p className="mt-1 font-semibold text-[#182f20] dark:text-white">
              {material.provenance?.structureType || "Not specified"}
            </p>
            {material.provenance?.yearBuilt && (
              <p className="mt-0.5 text-[#55695a] dark:text-gray-400">
                Year Built: {material.provenance.yearBuilt}
              </p>
            )}
          </div>

          <div className="rounded-xl border border-[#eeebe2] bg-[#fbfaf6] p-3 dark:border-steel-800 dark:bg-white/[0.02]">
            <span className="font-bold uppercase tracking-wider text-[#79887c] dark:text-gray-400 text-[10px]">
              Deconstruction Method
            </span>
            <p className="mt-1 font-semibold text-[#182f20] dark:text-white">
              {material.provenance?.deconstructionMethod || "Site demolition survey"}
            </p>
            <p className="mt-0.5 text-[#55695a] dark:text-gray-400">
              Previous Use: {material.provenance?.previousUse || "Structural component"}
            </p>
          </div>

          <div className="rounded-xl border border-[#eeebe2] bg-[#fbfaf6] p-3 dark:border-steel-800 dark:bg-white/[0.02]">
            <span className="font-bold uppercase tracking-wider text-[#79887c] dark:text-gray-400 text-[10px]">
              Handling &amp; Storage
            </span>
            <p className="mt-1 text-[#182f20] dark:text-white">
              {material.provenance?.handlingInstructions || "Follow standard C&D handling protocols."}
            </p>
          </div>
        </div>
      </section>

      {/* 3. CATEGORY COMPLIANCE STANDARDS & CHECKLIST */}
      <section className="rounded-2xl border border-[#d2dbd4] bg-white p-6 shadow-sm dark:border-steel-800 dark:bg-[#17251d]">
        <div className="flex items-center justify-between border-b border-[#ecebe6] pb-3 dark:border-steel-800">
          <div>
            <h3 className="font-archivo text-base font-bold text-[#152e1f] dark:text-white">
              Category Evidence Standards
            </h3>
            <p className="text-xs text-[#526456] dark:text-gray-400">
              Mandatory standards required for {material.type} ({material.grade} Grade) procurement
            </p>
          </div>
          <span className="rounded-full bg-[#f0f4f1] px-3 py-1 text-xs font-bold text-[#183623] dark:bg-[#203427] dark:text-white">
            {compliance.requirements.filter((r) => r.satisfied).length} of {compliance.requirements.length} Satisfied
          </span>
        </div>

        <div className="mt-4 divide-y divide-[#ecebe6] dark:divide-steel-800">
          {compliance.requirements.map((item, idx) => (
            <div key={idx} className="flex items-start justify-between py-3 text-xs">
              <div className="space-y-0.5 pr-4">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-[#182f20] dark:text-white">
                    {item.requirement.name}
                  </span>
                  {item.requirement.mandatory ? (
                    <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-800 dark:bg-red-950/40 dark:text-red-300">
                      Mandatory
                    </span>
                  ) : (
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-gray-700 dark:bg-white/10 dark:text-gray-300">
                      Recommended
                    </span>
                  )}
                  {item.requirement.standard && (
                    <span className="font-mono text-[11px] text-[#4f6755] dark:text-[#a0cfae]">
                      [{item.requirement.standard}]
                    </span>
                  )}
                </div>
                <p className="text-[#55695a] dark:text-gray-400">
                  {item.requirement.description}
                </p>
                {item.reason && !item.satisfied && (
                  <p className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
                    ⚠ {item.reason}
                  </p>
                )}
              </div>

              <div>
                {item.satisfied ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                    ✓ Verified Document
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                    ○ Missing
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 4. GENUINE EVIDENCE DOCUMENTS GALLERY */}
      <section className="rounded-2xl border border-[#d2dbd4] bg-white p-6 shadow-sm dark:border-steel-800 dark:bg-[#17251d]">
        <div className="flex items-center justify-between border-b border-[#ecebe6] pb-3 dark:border-steel-800">
          <div>
            <h3 className="font-archivo text-base font-bold text-[#152e1f] dark:text-white">
              Supporting Evidence &amp; Documents
            </h3>
            <p className="text-xs text-[#526456] dark:text-gray-400">
              Authentic test reports, certificates, and site inspection records ({material.evidence?.length || 0} attached)
            </p>
          </div>
          {isOwner && (
            <button
              type="button"
              onClick={() => setShowUploadModal(true)}
              className="rounded-lg bg-[#1a3827] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#28573d] dark:bg-[#00e599] dark:text-[#0c1811]"
            >
              + Add Document
            </button>
          )}
        </div>

        {(!material.evidence || material.evidence.length === 0) ? (
          <div className="py-8 text-center text-xs text-gray-500 dark:text-gray-400">
            No evidence documents uploaded yet. Upload laboratory test certificates or site photos to initiate verification.
          </div>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {material.evidence.map((doc, idx) => (
              <div
                key={doc.id || idx}
                className="flex flex-col justify-between rounded-xl border border-[#e5e3da] bg-[#fbfaf6] p-4 text-xs dark:border-steel-800 dark:bg-white/[0.02]"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="rounded bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#183623] shadow-2xs dark:bg-steel-700 dark:text-white">
                        {KIND_LABELS[doc.kind] || doc.kind}
                      </span>
                      <h4 className="mt-1 font-bold text-[#152e1f] dark:text-white">
                        {doc.label}
                      </h4>
                    </div>
                    <span
                      className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                        doc.status === "valid"
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                          : doc.status === "rejected"
                          ? "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300"
                          : "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300"
                      }`}
                    >
                      {doc.status || "pending"}
                    </span>
                  </div>

                  {doc.notes && (
                    <p className="mt-2 text-[#4e6052] dark:text-gray-300">
                      {doc.notes}
                    </p>
                  )}

                  {doc.rejectionReason && (
                    <p className="mt-1.5 font-medium text-red-700 dark:text-red-400">
                      Rejection Reason: {doc.rejectionReason}
                    </p>
                  )}
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-[#ede9df] pt-2 text-[11px] text-[#718475] dark:border-steel-800 dark:text-gray-400">
                  <span>Recorded: {formatDate(doc.recordedAt)}</span>

                  <div className="flex items-center gap-2">
                    {doc.ref?.startsWith("/api/uploads/") ? (
                      <a
                        href={doc.ref}
                        target="_blank"
                        rel="noreferrer"
                        className="font-bold text-[#183623] underline hover:text-[#00e599] dark:text-[#a0cfae]"
                      >
                        View Document ↗
                      </a>
                    ) : (
                      doc.ref && <span className="font-mono">Ref: {doc.ref}</span>
                    )}

                    {isOwner && (
                      <button
                        type="button"
                        onClick={() => handleRemoveEvidence(doc.id || doc.ref || `${material.id}:${idx}`, doc.label)}
                        className="text-red-600 hover:text-red-800 dark:text-red-400"
                        title="Remove evidence"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 5. AUDITABLE VERIFICATION HISTORY TIMELINE */}
      <section className="rounded-2xl border border-[#d2dbd4] bg-white p-6 shadow-sm dark:border-steel-800 dark:bg-[#17251d]">
        <h3 className="font-archivo text-base font-bold text-[#152e1f] dark:text-white border-b border-[#ecebe6] pb-3 dark:border-steel-800">
          Auditable Verification History
        </h3>

        {(!material.verificationAudit || material.verificationAudit.length === 0) ? (
          <div className="py-6 text-center text-xs text-gray-500 dark:text-gray-400">
            No verification actions recorded yet.
          </div>
        ) : (
          <div className="mt-4 space-y-4 text-xs">
            {material.verificationAudit
              .slice()
              .reverse()
              .map((audit, idx) => (
                <div key={idx} className="relative flex gap-3 border-l-2 border-[#1a3827] pl-4 dark:border-[#00e599]">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[#152e1f] dark:text-white">
                        {audit.actor || audit.reviewer || "System"}
                      </span>
                      <span className="rounded bg-[#f0f4f1] px-1.5 py-0.2 text-[10px] font-semibold uppercase tracking-wider text-[#183623] dark:bg-white/10 dark:text-gray-300">
                        {audit.action || audit.status}
                      </span>
                      <span className="text-[#718475] dark:text-gray-400">
                        {formatDate(audit.at)}
                      </span>
                    </div>
                    {audit.fromStatus && audit.toStatus && (
                      <p className="text-[11px] text-[#55695a] dark:text-gray-400">
                        Transition: {audit.fromStatus} → <strong>{audit.toStatus}</strong>
                      </p>
                    )}
                    {audit.notes && (
                      <p className="text-[#3b4b3e] dark:text-gray-300">
                        {audit.notes}
                      </p>
                    )}
                    {audit.rejectionReason && (
                      <p className="font-medium text-red-600 dark:text-red-400">
                        Reason: {audit.rejectionReason}
                      </p>
                    )}
                  </div>
                </div>
              ))}
          </div>
        )}
      </section>

      {/* 6. CONNECTED PROCUREMENT ORDERS & WEIGHBRIDGE INTAKE */}
      <section className="rounded-2xl border border-[#d2dbd4] bg-white p-6 shadow-sm dark:border-steel-800 dark:bg-[#17251d]">
        <div className="flex items-center justify-between border-b border-[#ecebe6] pb-3 dark:border-steel-800">
          <div>
            <h3 className="font-archivo text-base font-bold text-[#152e1f] dark:text-white">
              Connected Procurement Orders &amp; Delivery Intake
            </h3>
            <p className="text-xs text-[#526456] dark:text-gray-400">
              Procurement orders linked to this Material Passport ({connectedBookings.length} active/completed)
            </p>
          </div>
          <span className="rounded-full bg-[#f0f4f1] px-3 py-1 text-xs font-bold text-[#183623] dark:bg-[#203427] dark:text-white">
            {connectedBookings.length} {connectedBookings.length === 1 ? "Order" : "Orders"}
          </span>
        </div>

        {connectedBookings.length === 0 ? (
          <div className="py-6 text-center text-xs text-gray-500 dark:text-gray-400">
            No active orders linked to this material passport yet. Available for procurement once verified.
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {connectedBookings.map((b) => {
              const verification = dataset.verifications.find((v) => v.bookingId === b.id);
              const receiver = dataset.receivers.find((r) => r.id === b.receiverId);
              return (
                <div
                  key={b.id}
                  className="flex flex-col justify-between gap-3 rounded-xl border border-[#e5e3da] bg-[#fbfaf6] p-4 text-xs dark:border-steel-800 dark:bg-white/[0.02] sm:flex-row sm:items-center"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-[#152e1f] dark:text-white">
                        {b.loadRef || b.id}
                      </span>
                      <StatusBadge status={b.status} size="sm" />
                      {verification && (
                        <span className="rounded bg-steel-100 px-2 py-0.5 text-[10px] font-semibold dark:bg-steel-700">
                          QA: {verification.status}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#526456] dark:text-gray-400">
                      Destination: <strong>{receiver?.name || b.receiverId}</strong> · Allocated: <strong>{b.tonnesT} t</strong>
                    </p>
                    {verification && (
                      <p className="text-[11px] text-[#34533b] dark:text-[#a0cfae]">
                        Weighbridge gross: <strong>{verification.actualT} t</strong> · Accepted: <strong>{verification.acceptedT} t</strong> {verification.rejectedT > 0 && <span className="text-red-600 dark:text-red-400">(Rejected: {verification.rejectedT} t)</span>}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <Link
                      to={`/app/orders/${b.id}`}
                      className="inline-flex items-center gap-1 rounded-xl bg-[#1a3827] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-[#28573d] dark:bg-[#00e599] dark:text-[#0c1811] shadow-xs"
                    >
                      Open Order Workspace →
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* MODAL 1: UPLOAD / REUSE EVIDENCE */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-[#17251d] text-ink-900 dark:text-white">
            <h3 className="font-archivo text-lg font-bold">Attach Supporting Evidence</h3>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Attach genuine lab reports, certificates, or reuse existing verified repository documents without re-uploading.
            </p>

            {/* Toggle: Upload New vs Reuse Existing */}
            <div className="mt-4 flex rounded-lg border border-gray-200 bg-gray-100 p-0.5 text-xs font-semibold dark:border-steel-700 dark:bg-steel-800">
              <button
                type="button"
                onClick={() => { setUploadSource("upload"); setUploadError(null); }}
                className={`flex-1 rounded-md py-1.5 transition ${
                  uploadSource === "upload"
                    ? "bg-white text-ink-900 shadow-xs dark:bg-[#1f3126] dark:text-white"
                    : "text-gray-600 hover:text-ink-900 dark:text-gray-400 dark:hover:text-white"
                }`}
              >
                Upload New Document
              </button>
              <button
                type="button"
                onClick={() => { setUploadSource("existing"); setUploadError(null); }}
                className={`flex-1 rounded-md py-1.5 transition ${
                  uploadSource === "existing"
                    ? "bg-white text-ink-900 shadow-xs dark:bg-[#1f3126] dark:text-white"
                    : "text-gray-600 hover:text-ink-900 dark:text-gray-400 dark:hover:text-white"
                }`}
              >
                Reuse from Repository ({existingEvidenceOptions.length})
              </button>
            </div>

            {uploadSource === "existing" ? (
              <form onSubmit={handleAttachExisting} className="mt-4 space-y-4 text-xs">
                <div>
                  <label className="block font-bold">Select Existing Repository Document</label>
                  {existingEvidenceOptions.length === 0 ? (
                    <p className="mt-2 text-gray-500 dark:text-gray-400">No previous documents found in the repository.</p>
                  ) : (
                    <select
                      value={selectedExistingRef}
                      onChange={(e) => {
                        setSelectedExistingRef(e.target.value);
                        setUploadError(null);
                      }}
                      className="mt-1 w-full rounded-lg border border-gray-300 p-2 dark:border-steel-700 dark:bg-steel-800"
                    >
                      <option value="">-- Choose document --</option>
                      {existingEvidenceOptions.map((opt) => {
                        const isAttached = material.evidence?.some((e) => e.ref === opt.ref);
                        return (
                          <option key={opt.ref} value={opt.ref} disabled={isAttached}>
                            {opt.label} ({KIND_LABELS[opt.kind] || opt.kind}) {isAttached ? "— Already Attached" : `[From ${opt.sourceMaterial}]`}
                          </option>
                        );
                      })}
                    </select>
                  )}
                </div>

                {selectedExistingRef && (
                  (() => {
                    const selectedDoc = existingEvidenceOptions.find((d) => d.ref === selectedExistingRef);
                    const isAlreadyAttached = material.evidence?.some((e) => e.ref === selectedExistingRef);
                    return (
                      <div className="rounded-lg border border-steel-200 bg-steel-50 p-3 text-xs dark:border-steel-700 dark:bg-steel-800/50">
                        <p className="font-bold text-[#152e1f] dark:text-white">{selectedDoc?.label}</p>
                        <p className="text-[#55695a] dark:text-gray-300">
                          Type: {selectedDoc ? (KIND_LABELS[selectedDoc.kind] || selectedDoc.kind) : ""}
                        </p>
                        {selectedDoc?.notes && <p className="mt-1 italic text-gray-500 dark:text-gray-400">{selectedDoc.notes}</p>}
                        {isAlreadyAttached && (
                          <p className="mt-2 font-semibold text-amber-700 dark:text-amber-400">
                            ⚠ This document is already attached to this material passport. Duplicate submission prevented.
                          </p>
                        )}
                      </div>
                    );
                  })()
                )}

                {uploadError && (
                  <p className="text-xs text-red-600 dark:text-red-400">{uploadError}</p>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowUploadModal(false)}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 font-semibold text-gray-700 hover:bg-gray-100 dark:border-steel-700 dark:text-gray-300 dark:hover:bg-steel-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={uploading || !selectedExistingRef || material.evidence?.some((e) => e.ref === selectedExistingRef)}
                    className="rounded-lg bg-[#1a3827] px-4 py-1.5 font-bold text-white hover:bg-[#28573d] disabled:opacity-50 dark:bg-[#00e599] dark:text-[#0c1811]"
                  >
                    {uploading ? "Attaching..." : "Attach Existing Document"}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleUploadSubmit} className="mt-4 space-y-4 text-xs">
                <div>
                  <label className="block font-bold">Document Type</label>
                  <select
                    value={uploadKind}
                    onChange={(e) => setUploadKind(e.target.value as EvidenceKind)}
                    className="mt-1 w-full rounded-lg border border-gray-300 p-2 dark:border-steel-700 dark:bg-steel-800"
                  >
                    <option value="lab-report">Laboratory Test Report (e.g. IS 516 Compressive Strength)</option>
                    <option value="certificate">Quality / Conformity Certificate</option>
                    <option value="test-report">Field / Tensile Test Report (e.g. IS 2062)</option>
                    <option value="chain-of-custody">Chain of Custody Record</option>
                    <option value="survey-sheet">Site Survey Sheet</option>
                    <option value="site-photo">Inspection Photo</option>
                    <option value="weighbridge-ticket">Weighbridge Delivery Ticket</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold">Document Label / Title</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. IS 516 Core Test Certificate - Lab Batch 4"
                    value={uploadLabel}
                    onChange={(e) => {
                      setUploadLabel(e.target.value);
                      setUploadError(null);
                    }}
                    className="mt-1 w-full rounded-lg border border-gray-300 p-2 dark:border-steel-700 dark:bg-steel-800"
                  />
                  {material.evidence?.some((ev) => ev.label.trim().toLowerCase() === uploadLabel.trim().toLowerCase() && ev.kind === uploadKind) && (
                    <p className="mt-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                      ⚠ A document with this label and type is already attached to this passport.
                    </p>
                  )}
                </div>

                <div>
                  <label className="block font-bold">Select File</label>
                  <input
                    type="file"
                    required
                    accept=".pdf,image/png,image/jpeg,image/webp"
                    onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                    className="mt-1 w-full text-xs text-gray-500 dark:text-gray-400 file:mr-3 file:rounded-md file:border-0 file:bg-[#1a3827] file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white dark:file:bg-[#00e599] dark:file:text-ink-900"
                  />
                </div>

                <div>
                  <label className="block font-bold">Notes / Testing Laboratory Details</label>
                  <textarea
                    rows={2}
                    placeholder="Testing lab name, sample batch, or inspection remarks..."
                    value={uploadNotes}
                    onChange={(e) => setUploadNotes(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 p-2 dark:border-steel-700 dark:bg-steel-800"
                  />
                </div>

                {uploadError && (
                  <p className="text-xs text-red-600 dark:text-red-400">{uploadError}</p>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowUploadModal(false)}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 font-semibold text-gray-700 hover:bg-gray-100 dark:border-steel-700 dark:text-gray-300 dark:hover:bg-steel-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={uploading}
                    className="rounded-lg bg-[#1a3827] px-4 py-1.5 font-bold text-white hover:bg-[#28573d] disabled:opacity-50 dark:bg-[#00e599] dark:text-[#0c1811]"
                  >
                    {uploading ? "Uploading..." : "Upload & Attach"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* MODAL 2: SUBMIT FOR REVIEW */}
      {showSubmitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-[#17251d] text-ink-900 dark:text-white">
            <h3 className="font-archivo text-lg font-bold">Submit Passport for Compliance Review</h3>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Submit this passport and its {material.evidence?.length} attached documents for third-party compliance verification.
            </p>

            <div className="mt-4 space-y-3 text-xs">
              <div>
                <label className="block font-bold">Submission Notes / Target Standards</label>
                <textarea
                  rows={3}
                  placeholder="Add any specific context or target project application..."
                  value={submitNotes}
                  onChange={(e) => setSubmitNotes(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 p-2 dark:border-steel-700 dark:bg-steel-800"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSubmitModal(false)}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 font-semibold text-gray-700 hover:bg-gray-100 dark:border-steel-700 dark:text-gray-300 dark:hover:bg-steel-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSubmitForReview}
                  disabled={submitting}
                  className="rounded-lg bg-[#1a3827] px-4 py-1.5 font-bold text-white hover:bg-[#28573d] disabled:opacity-50 dark:bg-[#00e599] dark:text-[#0c1811]"
                >
                  {submitting ? "Submitting..." : "Confirm Submission"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: REVIEW & CERTIFY (RECEIVER / REVIEWER) */}
      {showReviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl dark:bg-[#17251d] text-ink-900 dark:text-white max-h-[90vh] overflow-y-auto">
            <h3 className="font-archivo text-lg font-bold">Passport Verification Review</h3>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              As an authorized reviewer, certify or reject the material passport based on category standards.
            </p>

            <form onSubmit={handleReviewSubmit} className="mt-4 space-y-4 text-xs">
              {!compliance.isCompliant && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                  <p className="font-bold">⚠️ Cannot Certify: Mandatory Documentation Missing</p>
                  <p className="mt-0.5">Missing: {compliance.missingMandatory.join("; ")}. Category standards require all mandatory test records before certification.</p>
                </div>
              )}

              <div>
                <label className="block font-bold">Verification Decision</label>
                <div className="mt-2 flex gap-4">
                  <label className={`flex items-center gap-2 ${!compliance.isCompliant ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}>
                    <input
                      type="radio"
                      name="decision"
                      value="verified"
                      disabled={!compliance.isCompliant}
                      checked={reviewStatus === "verified"}
                      onChange={() => setReviewStatus("verified")}
                    />
                    <span className="font-bold text-emerald-700 dark:text-emerald-400">
                      ✓ Verify &amp; Certify {!compliance.isCompliant && "(Blocked - Incomplete Evidence)"}
                    </span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="decision"
                      value="rejected"
                      checked={reviewStatus === "rejected"}
                      onChange={() => setReviewStatus("rejected")}
                    />
                    <span className="font-bold text-red-600 dark:text-red-400">
                      ✕ Reject Passport
                    </span>
                  </label>
                </div>
              </div>

              {reviewStatus === "rejected" && (
                <div>
                  <label className="block font-bold text-red-600 dark:text-red-400">
                    Rejection Reason (Required)
                  </label>
                  <textarea
                    rows={2}
                    required
                    placeholder="Specify why the passport fails compliance (e.g. missing 28-day compressive lab certificate)..."
                    value={reviewRejectionReason}
                    onChange={(e) => setReviewRejectionReason(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-red-300 p-2 dark:border-red-900 dark:bg-steel-800"
                  />
                </div>
              )}

              <div>
                <label className="block font-bold">Reviewer Certification Notes</label>
                <textarea
                  rows={2}
                  placeholder="Observations on test reports, standards conformity, or structural limitations..."
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 p-2 dark:border-steel-700 dark:bg-steel-800"
                />
              </div>

              {/* Review individual documents */}
              {material.evidence && material.evidence.length > 0 && (
                <div>
                  <label className="block font-bold">Individual Document Checks</label>
                  <div className="mt-2 space-y-2 border-t border-gray-200 pt-2 dark:border-steel-800">
                    {material.evidence.map((doc, idx) => {
                      const id = doc.id || doc.ref || `${material.id}:${idx}`;
                      const currentDecision = evidenceItemDecisions[id]?.status || doc.status || "valid";
                      return (
                        <div key={id} className="flex items-center justify-between rounded bg-gray-50 p-2 dark:bg-steel-800/40">
                          <span className="truncate max-w-[200px] font-medium">{doc.label}</span>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                setEvidenceItemDecisions((prev) => ({
                                  ...prev,
                                  [id]: { status: "valid" },
                                }))
                              }
                              className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                                currentDecision === "valid" ? "bg-emerald-600 text-white" : "bg-gray-200 dark:bg-steel-700"
                              }`}
                            >
                              Valid
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setEvidenceItemDecisions((prev) => ({
                                  ...prev,
                                  [id]: { status: "rejected", reason: "Criteria not met" },
                                }))
                              }
                              className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                                currentDecision === "rejected" ? "bg-red-600 text-white" : "bg-gray-200 dark:bg-steel-700"
                              }`}
                            >
                              Reject
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {reviewError && (
                <p className="text-xs text-red-600 dark:text-red-400">{reviewError}</p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowReviewModal(false)}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 font-semibold text-gray-700 hover:bg-gray-100 dark:border-steel-700 dark:text-gray-300 dark:hover:bg-steel-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={reviewing}
                  className="rounded-lg bg-[#B7F34A] px-4 py-1.5 font-bold text-[#0c1811] hover:bg-[#cbf975] disabled:opacity-50"
                >
                  {reviewing ? "Saving Review..." : "Submit Review"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: EDIT DETAILS */}
      {showEditDetailsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl dark:bg-[#17251d] text-ink-900 dark:text-white max-h-[90vh] overflow-y-auto">
            <h3 className="font-archivo text-lg font-bold">Edit Passport Identity &amp; Provenance</h3>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Provide complete asset specifications, origin structure, and handling instructions.
            </p>

            <form onSubmit={handleSaveDetails} className="mt-4 space-y-4 text-xs">
              <div>
                <label className="block font-bold">Asset Name</label>
                <input
                  type="text"
                  placeholder="e.g. Precast RC Structural Beams (350x600mm)"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 p-2 dark:border-steel-700 dark:bg-steel-800"
                />
              </div>

              <div>
                <label className="block font-bold">Dimensions / Section Specs</label>
                <input
                  type="text"
                  placeholder="e.g. 6.2m length x 0.35m width x 0.60m depth"
                  value={editDimensions}
                  onChange={(e) => setEditDimensions(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 p-2 dark:border-steel-700 dark:bg-steel-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold">Structure of Origin</label>
                  <input
                    type="text"
                    placeholder="e.g. Commercial Office Building"
                    value={editStructureType}
                    onChange={(e) => setEditStructureType(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 p-2 dark:border-steel-700 dark:bg-steel-800"
                  />
                </div>
                <div>
                  <label className="block font-bold">Year Built</label>
                  <input
                    type="number"
                    placeholder="e.g. 2008"
                    value={editYearBuilt}
                    onChange={(e) => setEditYearBuilt(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 p-2 dark:border-steel-700 dark:bg-steel-800"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold">Deconstruction Method</label>
                <input
                  type="text"
                  placeholder="e.g. Selective diamond-saw cutting & crane rigging"
                  value={editDeconstructionMethod}
                  onChange={(e) => setEditDeconstructionMethod(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 p-2 dark:border-steel-700 dark:bg-steel-800"
                />
              </div>

              <div>
                <label className="block font-bold">Previous Structural Use</label>
                <input
                  type="text"
                  placeholder="e.g. Primary floor supporting beams"
                  value={editPreviousUse}
                  onChange={(e) => setEditPreviousUse(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 p-2 dark:border-steel-700 dark:bg-steel-800"
                />
              </div>

              <div>
                <label className="block font-bold">Handling &amp; Storage Instructions</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Store horizontally with timber bearers at 1/5 points; avoid shock loads."
                  value={editHandlingInstructions}
                  onChange={(e) => setEditHandlingInstructions(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 p-2 dark:border-steel-700 dark:bg-steel-800"
                />
              </div>

              <div>
                <label className="block font-bold">Surveyor Field Notes</label>
                <textarea
                  rows={2}
                  placeholder="Additional survey notes..."
                  value={editSurveyNotes}
                  onChange={(e) => setEditSurveyNotes(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 p-2 dark:border-steel-700 dark:bg-steel-800"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEditDetailsModal(false)}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 font-semibold text-gray-700 hover:bg-gray-100 dark:border-steel-700 dark:text-gray-300 dark:hover:bg-steel-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingDetails}
                  className="rounded-lg bg-[#1a3827] px-4 py-1.5 font-bold text-white hover:bg-[#28573d] disabled:opacity-50 dark:bg-[#00e599] dark:text-[#0c1811]"
                >
                  {savingDetails ? "Saving..." : "Save Details"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

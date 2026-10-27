import { useState, useMemo, useId } from "react";
import type { Project, MaterialCondition, MaterialGrade } from "@shared/domain/types";
import { materialTypeLabel } from "@/utils";

interface BulkMaterialImportProps {
  projects: Project[];
  defaultProjectId?: string;
  onImport: (items: unknown[]) => Promise<unknown[] | null>;
  onCancel: () => void;
  onSuccess: () => void;
}

interface ParsedRow {
  rowNumber: number;
  type: string;
  quantityT: number;
  condition: MaterialCondition;
  grade: MaterialGrade;
  pricePerT?: number;
  availableFrom?: string;
  surveyNotes?: string;
  isValid: boolean;
  errors: string[];
}

const SAMPLE_CSV = `type,quantityT,condition,grade,pricePerT,availableFrom,surveyNotes
brick,45,good,A,850,2026-11-05,Palletized facing bricks from facade demolition
steel,25.5,fair,B,34000,2026-11-10,Structural I-beams and columns
timber,18,good,A,18000,,Reclaimed structural joists and roof trusses`;

export default function BulkMaterialImport({
  projects,
  defaultProjectId,
  onImport,
  onCancel,
  onSuccess,
}: BulkMaterialImportProps) {
  const projectSelectId = useId();
  const csvTextareaId = useId();

  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    defaultProjectId || projects[0]?.id || ""
  );
  const [csvText, setCsvText] = useState<string>(SAMPLE_CSV);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const parsedRows: ParsedRow[] = useMemo(() => {
    const lines = csvText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return [];

    // Check if line 0 is a header
    let startIndex = 0;
    const firstLineLower = lines[0].toLowerCase();
    if (firstLineLower.includes("type") && firstLineLower.includes("quantity")) {
      startIndex = 1;
    }

    const rows: ParsedRow[] = [];
    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i];
      const cols = line.split(",").map((c) => c.trim().replace(/^["']|["']$/g, ""));
      const errors: string[] = [];

      const rawType = cols[0] || "";
      if (!rawType || rawType.length < 2) {
        errors.push("Missing or invalid material type");
      }

      const rawQty = cols[1];
      const numQty = Number(rawQty);
      if (!rawQty || !Number.isFinite(numQty) || numQty <= 0) {
        errors.push("Quantity must be a positive number");
      }

      const rawCond = (cols[2] || "").toLowerCase() as MaterialCondition;
      if (!["good", "fair", "poor"].includes(rawCond)) {
        errors.push("Condition must be 'good', 'fair', or 'poor'");
      }

      const rawGrade = (cols[3] || "").toUpperCase() as MaterialGrade;
      if (!["A", "B", "C"].includes(rawGrade)) {
        errors.push("Grade must be 'A', 'B', or 'C'");
      }

      let pricePerT: number | undefined;
      if (cols[4]) {
        const p = Number(cols[4]);
        if (Number.isFinite(p) && p >= 0) pricePerT = p;
        else errors.push("Price must be a non-negative number");
      }

      let availableFrom: string | undefined;
      if (cols[5]) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(cols[5])) availableFrom = cols[5];
        else errors.push("Date must be formatted YYYY-MM-DD");
      }

      const surveyNotes = cols[6] || undefined;

      rows.push({
        rowNumber: i + 1,
        type: rawType.toLowerCase(),
        quantityT: Number.isFinite(numQty) ? numQty : 0,
        condition: ["good", "fair", "poor"].includes(rawCond) ? rawCond : "good",
        grade: ["A", "B", "C"].includes(rawGrade) ? rawGrade : "A",
        pricePerT,
        availableFrom,
        surveyNotes,
        isValid: errors.length === 0,
        errors,
      });
    }

    return rows;
  }, [csvText]);

  const validRows = useMemo(() => parsedRows.filter((r) => r.isValid), [parsedRows]);
  const invalidRows = useMemo(() => parsedRows.filter((r) => !r.isValid), [parsedRows]);

  const handleImport = async () => {
    setServerError(null);
    if (!selectedProjectId) {
      setServerError("Please select a target project for the imported materials.");
      return;
    }
    if (validRows.length === 0) {
      setServerError("No valid rows to import. Please resolve validation errors.");
      return;
    }

    setIsSubmitting(true);
    try {
      const itemsToImport = validRows.map((r) => ({
        projectId: selectedProjectId,
        type: r.type,
        quantityT: r.quantityT,
        condition: r.condition,
        grade: r.grade,
        confidence: 0.9,
        pricePerT: r.pricePerT,
        availableFrom: r.availableFrom,
        surveyNotes: r.surveyNotes,
        listingStatus: "published",
        evidence: [],
      }));

      const res = await onImport(itemsToImport);
      if (res && res.length > 0) {
        onSuccess();
      } else {
        setServerError("Import failed. Please verify that all fields meet system constraints.");
      }
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Bulk import failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="rounded-[24px] border border-[#e4e1d7] bg-white p-5 shadow-sm sm:p-7 dark:border-steel-800 dark:bg-[#152219]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[#00e599]/15 text-[#00a86b] dark:text-[#00e599]">
            <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
            </svg>
          </span>
          <div>
            <h2 className="font-archivo text-xl font-bold tracking-tight text-[#14261c] dark:text-white">
              Bulk Material Inventory Import
            </h2>
            <p className="text-xs text-[#6e7b71] dark:text-gray-400">
              Paste or edit structured material passport rows for multi-asset recovery listings.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCsvText(SAMPLE_CSV)}
            className="rounded-full border border-[#cbd5cb] px-3.5 py-1.5 text-xs font-semibold text-[#285733] transition hover:bg-[#f2f6f1] dark:border-steel-700 dark:text-[#a0cfae] dark:hover:bg-steel-800"
          >
            Load Sample CSV
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-[#d2cfc4] px-3.5 py-1.5 text-xs font-semibold text-[#5a6b5e] transition hover:bg-[#f2f1ec] dark:border-steel-700 dark:text-gray-300 dark:hover:bg-steel-800"
          >
            Back to Inventory
          </button>
        </div>
      </div>

      {serverError && (
        <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs font-medium text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          {serverError}
        </div>
      )}

      {/* Target Project Selection */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={projectSelectId} className="block text-xs font-bold uppercase tracking-wider text-[#5a6b5e] dark:text-gray-300">
            Target Project Destination
          </label>
          <select
            id={projectSelectId}
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            disabled={isSubmitting}
            className="mt-1.5 w-full rounded-xl border border-[#d2cfc4] bg-[#f9f9f6] px-3.5 py-2.5 text-sm text-[#14261c] shadow-xs focus:border-[#00e599] focus:outline-none focus:ring-1 focus:ring-[#00e599] dark:border-steel-700 dark:bg-[#121f17] dark:text-white"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.location} ({p.status})
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-xl border border-[#e4e1d7] bg-[#f9f9f6] p-3 text-xs dark:border-steel-800 dark:bg-white/[0.02]">
          <p className="font-bold text-[#14261c] dark:text-white">CSV Format Specification</p>
          <p className="mt-1 text-[#6e7b71] dark:text-gray-400">
            <span className="font-mono text-[11px] text-[#255734] dark:text-[#a6d5b0]">
              type, quantityT, condition (good|fair|poor), grade (A|B|C), pricePerT, availableFrom, notes
            </span>
          </p>
        </div>
      </div>

      {/* Raw CSV Textarea */}
      <div className="mt-4">
        <label htmlFor={csvTextareaId} className="block text-xs font-bold uppercase tracking-wider text-[#5a6b5e] dark:text-gray-300">
          CSV Data Input
        </label>
        <textarea
          id={csvTextareaId}
          rows={6}
          value={csvText}
          onChange={(e) => setCsvText(e.target.value)}
          disabled={isSubmitting}
          placeholder="concrete,40,good,A,1200,2026-11-01,Precast elements..."
          className="mt-1.5 w-full rounded-xl border border-[#d2cfc4] bg-white p-3 font-mono text-xs leading-relaxed text-[#14261c] shadow-xs focus:border-[#00e599] focus:outline-none focus:ring-1 focus:ring-[#00e599] dark:border-steel-700 dark:bg-[#101b14] dark:text-gray-200"
        />
      </div>

      {/* Row-Level Validation Summary */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-b border-[#edebe4] pb-3 dark:border-steel-800">
        <div className="flex items-center gap-3">
          <h3 className="font-archivo text-base font-bold text-[#14261c] dark:text-white">
            Parsed Asset Rows
          </h3>
          <span className="inline-flex items-center gap-1 rounded-full bg-[#e8f5ec] px-2.5 py-0.5 text-xs font-bold text-[#1e542d] dark:bg-emerald-950/60 dark:text-[#00e599]">
            ✓ {validRows.length} Valid
          </span>
          {invalidRows.length > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-700 dark:bg-red-950/60 dark:text-red-300">
              ✕ {invalidRows.length} Errors
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={handleImport}
          disabled={isSubmitting || validRows.length === 0 || !selectedProjectId}
          className="inline-flex items-center gap-2 rounded-full bg-[#00e599] px-6 py-2.5 text-xs font-bold text-[#0c1811] shadow-xs transition hover:bg-[#34f5b0] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? "Importing..." : `Import ${validRows.length} Valid Asset${validRows.length === 1 ? "" : "s"}`}
        </button>
      </div>

      {/* Validation Table */}
      <div className="mt-4 overflow-x-auto rounded-xl border border-[#e4e1d7] dark:border-steel-800">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-[#e4e1d7] bg-[#f9f9f6] text-[10px] font-bold uppercase tracking-wider text-[#6e7b71] dark:border-steel-800 dark:bg-white/[0.03] dark:text-gray-400">
            <tr>
              <th className="px-3.5 py-2.5">Row</th>
              <th className="px-3.5 py-2.5">Type</th>
              <th className="px-3.5 py-2.5">Quantity</th>
              <th className="px-3.5 py-2.5">Condition</th>
              <th className="px-3.5 py-2.5">Grade</th>
              <th className="px-3.5 py-2.5">Price (₹/t)</th>
              <th className="px-3.5 py-2.5">Available Date</th>
              <th className="px-3.5 py-2.5">Notes</th>
              <th className="px-3.5 py-2.5">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#edebe4] dark:divide-steel-800">
            {parsedRows.map((row) => (
              <tr
                key={row.rowNumber}
                className={row.isValid ? "hover:bg-[#fbfbf9] dark:hover:bg-white/[0.01]" : "bg-red-50/50 hover:bg-red-50 dark:bg-red-950/15"}
              >
                <td className="px-3.5 py-2.5 font-mono text-gray-500">{row.rowNumber}</td>
                <td className="px-3.5 py-2.5 font-semibold text-[#14261c] dark:text-white">
                  {materialTypeLabel(row.type)}
                </td>
                <td className="px-3.5 py-2.5 font-mono font-bold text-[#14261c] dark:text-white">
                  {row.quantityT > 0 ? `${row.quantityT} t` : "—"}
                </td>
                <td className="px-3.5 py-2.5 capitalize text-[#48564c] dark:text-gray-300">{row.condition}</td>
                <td className="px-3.5 py-2.5 font-bold text-[#14261c] dark:text-white">Grade {row.grade}</td>
                <td className="px-3.5 py-2.5 font-mono text-[#255734] dark:text-[#a6d5b0]">
                  {row.pricePerT !== undefined ? `₹${row.pricePerT.toLocaleString("en-IN")}` : "On request"}
                </td>
                <td className="px-3.5 py-2.5 font-mono text-gray-500">{row.availableFrom || "Immediate"}</td>
                <td className="max-w-xs truncate px-3.5 py-2.5 text-gray-600 dark:text-gray-400">
                  {row.surveyNotes || "—"}
                </td>
                <td className="px-3.5 py-2.5">
                  {row.isValid ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300">
                      ✓ Ready
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-md bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-800 dark:bg-red-950/70 dark:text-red-300" title={row.errors.join("; ")}>
                      ✕ {row.errors[0]}
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {parsedRows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                  Paste CSV lines above or click "Load Sample CSV" to preview rows.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

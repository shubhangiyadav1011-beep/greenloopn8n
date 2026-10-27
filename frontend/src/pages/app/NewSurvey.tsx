import PageMeta from "@/components/common/PageMeta";
import AddressLocation from "@/components/greenloop/AddressLocation";
import { LocationMap } from "@/components/greenloop/LocationMap";
import { materialMediaFor } from "@/config/appMedia";
import type { Evidence, GeoPoint, MaterialCondition, MaterialGrade, MaterialPassport, MaterialTypeKey } from "@shared/domain/types";
import { uploadFile } from "@/lib/api";
import { useGreenLoopStore } from "@/store/GreenLoopStore.helpers";
import { cn, materialTypeLabel } from "@/utils";
import { AnimatePresence, motion } from "motion/react";
import { useState, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate, useSearchParams } from "react-router";

const TYPE_LABEL: Record<string, string> = {
  concrete: "Concrete",
  brick: "Brick",
  steel: "Steel",
  timber: "Timber",
  plasterboard: "Plasterboard",
  glass: "Glass",
};

const CUSTOM_TYPE = "__custom__";
const normalizeCustomType = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export default function NewSurvey() {
  const { t } = useTranslation();
  const { dataset, addMaterialAction, addProjectAction, updateMaterialAction, setMaterialListingStatusAction, addMaterialEvidenceAction } = useGreenLoopStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();

  const draftIdParam = params.get("draft") || params.get("draftId") || params.get("editId");
  const existingDraft = useMemo(() => {
    return draftIdParam ? dataset.materials.find((m) => m.id === draftIdParam) : null;
  }, [draftIdParam, dataset.materials]);
  
  const [step, setStep] = useState(1);
  const [projectId, setProjectId] = useState(location.state?.projectId || params.get("project") || dataset.projects[0]?.id || "");
  const [projectGeo, setProjectGeo] = useState<GeoPoint | undefined>(() => dataset.projects.find((project) => project.id === (location.state?.projectId || params.get("project") || dataset.projects[0]?.id))?.geo);
  const [type, setType] = useState<MaterialTypeKey>("concrete");
  const [customName, setCustomName] = useState("");
  const [unit, setUnit] = useState("tonnes");
  const [conversionFactor, setConversionFactor] = useState("1");
  const [quantity, setQuantity] = useState("10");
  const [rangeMin, setRangeMin] = useState("8");
  const [rangeMax, setRangeMax] = useState("12");
  const [condition, setCondition] = useState<MaterialCondition>("good");
  const [grade, setGrade] = useState<MaterialGrade>("A");
  const [availableFrom, setAvailableFrom] = useState("");
  const [pricePerT, setPricePerT] = useState("");
  const [reusable, setReusable] = useState(false);
  const [surveyNotes, setSurveyNotes] = useState("");
  const [confidence] = useState("0.85");
  const [showProjectForm, setShowProjectForm] = useState(dataset.projects.length === 0);
  const [projectName, setProjectName] = useState("");
  const [projectLocation, setProjectLocation] = useState(() => dataset.projects.find(project => project.id === (location.state?.projectId || params.get("project") || dataset.projects[0]?.id))?.location ?? "");
  const [creatingProject, setCreatingProject] = useState(false);
  const [projectError, setProjectError] = useState("");
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [uploadError, setUploadError] = useState("");
  const [validationError, setValidationError] = useState("");
  const [isSavingDraft, setIsSavingDraft] = useState(false);

  useEffect(() => {
    if (!existingDraft) return;
    if (existingDraft.projectId) setProjectId(existingDraft.projectId);
    if (existingDraft.geo) setProjectGeo(existingDraft.geo);
    if (existingDraft.type) {
      if (existingDraft.type in TYPE_LABEL) {
        setType(existingDraft.type as MaterialTypeKey);
      } else {
        setType(CUSTOM_TYPE as MaterialTypeKey);
        setCustomName(existingDraft.name || existingDraft.type);
      }
    }
    if (existingDraft.originalUnit) setUnit(existingDraft.originalUnit);
    if (existingDraft.conversionFactor) setConversionFactor(String(existingDraft.conversionFactor));
    if (existingDraft.originalQuantity != null) setQuantity(String(existingDraft.originalQuantity));
    else if (existingDraft.quantityT != null) setQuantity(String(existingDraft.quantityT));
    if (existingDraft.quantityRangeT?.[0] != null) setRangeMin(String(existingDraft.quantityRangeT[0]));
    if (existingDraft.quantityRangeT?.[1] != null) setRangeMax(String(existingDraft.quantityRangeT[1]));
    if (existingDraft.condition) setCondition(existingDraft.condition);
    if (existingDraft.grade) setGrade(existingDraft.grade);
    if (existingDraft.availableFrom) setAvailableFrom(existingDraft.availableFrom);
    if (existingDraft.pricePerT != null) setPricePerT(String(existingDraft.pricePerT));
    if (existingDraft.reusable != null) setReusable(Boolean(existingDraft.reusable));
    if (existingDraft.surveyNotes) setSurveyNotes(existingDraft.surveyNotes);
    if (existingDraft.evidence?.length) setEvidence(existingDraft.evidence);
    const p = dataset.projects.find(proj => proj.id === existingDraft.projectId);
    if (p) setProjectLocation(p.location);
  }, [existingDraft, dataset.projects]);

  const [createdPassport, setCreatedPassport] = useState<MaterialPassport | null>(null);
  const typeValue = type === CUSTOM_TYPE ? normalizeCustomType(customName) : type;
  const isTonnes = unit.toLowerCase() === 'tonnes' || unit.toLowerCase() === 't';
  const cFactor = isTonnes ? 1 : Number(conversionFactor) || 1;
  const quantityTValue = (Number(quantity) || 0) * cFactor;
  
  const rangeIsValid = Number.isFinite(Number(rangeMin)) && Number.isFinite(Number(rangeMax)) && Number(rangeMin) >= 0 && Number(rangeMax) >= Number(rangeMin) && Number(rangeMin) <= Number(quantity) && Number(rangeMax) >= Number(quantity);
  const estimateRange: [number, number] = rangeIsValid ? [Number(rangeMin) * cFactor, Number(rangeMax) * cFactor] : [quantityTValue, quantityTValue];

  const [uploading, setUploading] = useState(false);
  const handleFiles = async (files: FileList | null) => {
    if (!files || uploading) return;
    setUploadError(""); setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const ref = await uploadFile(file);
        const kind: Evidence["kind"] = file.type.startsWith("image/") ? "site-photo" : "survey-sheet";
        setEvidence(current => [...current, { kind, label: file.name, ref, recordedAt: new Date().toISOString() }]);
      }
    } catch (cause) { setUploadError(cause instanceof Error ? cause.message : t("backend.uploadFailed")); }
    finally { setUploading(false); }
  };

  const handleCreateProject = async () => {
    if (creatingProject) return;
    if (!projectName.trim() || !projectLocation.trim()) {
      setProjectError(t("projectLocationForm.required"));
      return;
    }
    setCreatingProject(true);
    setProjectError("");
    try {
      const project = await addProjectAction({ name: projectName.trim(), location: projectLocation.trim(), status: "active", ...(projectGeo ? { geo: projectGeo } : {}) });
      if (!project) { setProjectError(t("projectLocationForm.failed")); return; }
      setProjectId(project.id);
      setProjectGeo(project.geo);
      setProjectName("");
      setProjectLocation(project.location);
      setShowProjectForm(false);
    } finally { setCreatingProject(false); }
  };

  const handleQuantityChange = (val: string) => {
    setQuantity(val);
    const num = Number(val);
    if (Number.isFinite(num) && num > 0) {
      setRangeMin(String(Math.round(num * 0.9 * 10) / 10));
      setRangeMax(String(Math.round(num * 1.1 * 10) / 10));
    }
  };

  const handleSave = async (publishStatus: "published" | "draft" = "published") => {
    if (uploading || isSavingDraft) return;
    const quantityValue = Number(quantity);
    if (publishStatus === "published") {
      if (!Number.isFinite(quantityValue) || quantityValue <= 0) {
        setValidationError("Enter a quantity greater than zero.");
        setStep(2);
        return;
      }
      if (typeValue.length < 2) {
        setValidationError("Enter a material name for the custom material.");
        setStep(1);
        return;
      }
    }
    const resolvedProjectId = projectId || dataset.projects[0]?.id;
    if (publishStatus === "published" && !resolvedProjectId) {
      setValidationError("Choose or create the project location for this material.");
      setStep(3);
      return;
    }
    const targetProject = dataset.projects.find((p) => p.id === resolvedProjectId);
    const resolvedGeo = projectGeo || targetProject?.geo;
    setValidationError("");

    if (existingDraft) {
      setIsSavingDraft(true);
      try {
        await updateMaterialAction(existingDraft.id, {
          type: typeValue.length >= 2 ? typeValue : existingDraft.type,
          quantityT: Number.isFinite(quantityValue) && quantityValue > 0 ? quantityTValue : existingDraft.quantityT,
          condition,
          grade,
          surveyNotes: surveyNotes.trim(),
          pricePerT: pricePerT !== "" ? Number(pricePerT) : null,
          availableFrom: availableFrom || null,
          reusable,
          ...(resolvedGeo ? { geo: resolvedGeo } : {}),
        });
        const existingRefOrIds = new Set((existingDraft.evidence ?? []).map((e) => e.ref || e.id || e.label));
        for (const ev of evidence) {
          if (!existingRefOrIds.has(ev.ref || ev.id || ev.label)) {
            await addMaterialEvidenceAction(existingDraft.id, ev);
          }
        }
        if (publishStatus === "published") {
          await setMaterialListingStatusAction(existingDraft.id, "published");
          navigate(`/app/materials/${existingDraft.id}`);
        } else {
          navigate("/app/materials");
        }
      } finally {
        setIsSavingDraft(false);
      }
      return;
    }

    setIsSavingDraft(true);
    try {
      const passport = await addMaterialAction({
        projectId: resolvedProjectId || dataset.projects[0]?.id || "",
        type: typeValue.length >= 2 ? typeValue : "concrete",
        quantityT: Number.isFinite(quantityValue) && quantityValue > 0 ? quantityTValue : 1,
        quantityRangeT: estimateRange,
        ...(isTonnes ? {} : {
          originalUnit: unit,
          originalQuantity: Number(quantity) || 1,
          conversionFactor: cFactor,
        }),
        condition,
        grade,
        confidence: parseFloat(confidence) || 0.85,
        surveyNotes: surveyNotes.trim() || undefined,
        evidence,
        ...(reusable ? { reusable: true } : {}),
        ...(availableFrom ? { availableFrom } : {}),
        ...(pricePerT !== "" ? { pricePerT: Number(pricePerT) } : {}),
        ...(resolvedGeo ? { geo: resolvedGeo } : {}),
        listingStatus: publishStatus,
      });
      if (!passport) return;
      if (publishStatus === "draft") {
        navigate("/app/materials");
      } else {
        setCreatedPassport(passport);
        setStep(6);
      }
    } finally {
      setIsSavingDraft(false);
    }
  };

  return (
    <div className="relative min-h-screen pb-12">
      <PageMeta title="Add Material | GreenLoop" description="Add construction material from a project and attach supporting photos." />

      <div className="mx-auto max-w-5xl">
        <header className="mb-4">
          {existingDraft && (
            <div className="mb-3 flex items-center justify-between rounded-xl border border-blue-200 bg-blue-50/90 px-4 py-2.5 text-xs text-blue-900 dark:border-blue-800/50 dark:bg-blue-950/40 dark:text-blue-200">
              <div className="flex items-center gap-2">
                <span className="flex size-5 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">i</span>
                <span>
                  Resuming incomplete draft <strong>{existingDraft.id}</strong> ({existingDraft.listingStatus || "draft"}). Edit details and publish without starting over.
                </span>
              </div>
              <span className="rounded-full bg-blue-100 px-2 py-0.5 font-bold text-blue-800 dark:bg-blue-900/60 dark:text-blue-300">Incomplete Draft</span>
            </div>
          )}
          <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
            <h1 className="font-archivo text-2xl font-bold tracking-tight text-[#1e3024] dark:text-white sm:text-3xl">Add Material</h1>
            <p className="text-xs font-semibold text-[#597061] dark:text-gray-300">
              Step {step < 6 ? step : 5} of 5 · {step === 1 ? "Choose material" : step === 2 ? "Enter amount" : step === 3 ? "Choose location" : step === 4 ? "Add photos" : step === 5 ? "Review" : "Complete"}
            </p>
          </div>
          <p className="mt-1 max-w-3xl text-sm leading-5 text-[#68756b] dark:text-gray-400">
            Add what you have, how much there is, where it is, and a photo. GreenLoop creates a Material Passport—your material’s digital record.
          </p>
        </header>
        {step < 6 && (
          <nav aria-label="Material passport progress" className="mb-4 rounded-2xl border border-[#e1e5dc] bg-white/90 px-3 py-3 shadow-sm dark:border-white/10 dark:bg-[#17241b] sm:px-6">
            <ol className="grid grid-cols-5 gap-1 sm:gap-3">
              {["Material Type", "Details", "Location", "Photos", "Review"].map((label, idx) => {
                const stepNumber = idx + 1;
                const active = step === stepNumber;
                const complete = step > stepNumber;
                return (
                <li key={label} className="relative flex min-w-0 items-center gap-1.5 sm:gap-2">
                  {idx < 4 && <span className={cn("absolute start-[2rem] top-3 hidden h-px w-[calc(100%-1.6rem)] sm:block", complete ? "bg-[#4b8b67]" : "bg-[#dfe5dc] dark:bg-white/10")} aria-hidden="true" />}
                  <span className={cn("relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold sm:size-7", active ? "border-[#145b35] bg-[#145b35] text-white shadow-[0_0_0_3px_rgba(20,91,53,.12)]" : complete ? "border-[#4b8b67] bg-[#4b8b67] text-white" : "border-[#d5ddd4] bg-[#f5f7f2] text-[#7a887d] dark:border-white/15 dark:bg-white/5 dark:text-gray-400")}>
                    {complete ? "✓" : stepNumber}
                  </span>
                  <span className={cn("truncate text-[9px] font-semibold sm:text-xs", active ? "text-[#1c3424] dark:text-white" : complete ? "text-[#4b805e] dark:text-[#a6c7ad]" : "text-[#879188] dark:text-gray-500")}>
                    {label}
                  </span>
                </li>
              );})}
            </ol>
          </nav>
        )}

        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div key="choose-material" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="rounded-2xl border border-[#e3e5dc] bg-white p-4 shadow-[0_12px_36px_rgba(31,49,35,.06)] dark:border-white/10 dark:bg-[#17241b] sm:p-6">
              <h2 className="font-archivo text-2xl font-bold tracking-tight text-[#1e3024] dark:text-white">What material do you have?</h2>
              <p className="mt-1 text-sm text-[#68756b] dark:text-gray-400">Choose the material that best matches what you want to list.</p>
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4" role="radiogroup" aria-label="Material type">
                {(Object.entries(TYPE_LABEL) as [MaterialTypeKey, string][]).map(([key, label]) => {
                  const media = materialMediaFor(key);
                  const active = type === key;
                  const descriptions: Record<MaterialTypeKey, string> = {
                    concrete: "Broken concrete, RCC, slabs, blocks and more.",
                    brick: "Bricks, blocks and masonry materials.",
                    steel: "Rebar, structural steel and metal components.",
                    timber: "Beams, planks, shuttering wood and components.",
                    plasterboard: "Gypsum boards, drywall and ceiling materials.",
                    glass: "Glass panels, windows and glass waste.",
                  };
                  return (
                    <button
                      key={key}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setType(key)}
                      className={cn(
                        "group relative overflow-hidden rounded-2xl border text-start shadow-sm transition duration-300 hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#37794e]",
                        active ? "border-[#24643d] ring-2 ring-[#24643d] dark:border-[#8fc69c] dark:ring-[#8fc69c]" : "border-[#e2e5dd] hover:border-[#76a782] dark:border-white/10",
                      )}
                    >
                      <span className="relative block h-[118px] w-full overflow-hidden sm:h-[132px]">
                        <img src={media.src} alt={media.alt} loading="lazy" className={cn("size-full object-cover transition-transform duration-500", active ? "scale-105" : "group-hover:scale-105")} />
                        <span className="absolute inset-0 bg-gradient-to-t from-[#101d14]/90 via-[#101d14]/15 to-transparent" aria-hidden="true" />
                        <span className="absolute inset-x-3 bottom-2.5 text-white">
                          <span className="block font-archivo text-sm font-bold">{label}</span>
                          <span className="mt-0.5 block line-clamp-2 text-[10px] leading-3.5 text-white/85">{descriptions[key]}</span>
                        </span>
                        {active && <span className="absolute right-2 top-2 flex size-6 items-center justify-center rounded-full border-2 border-white bg-[#267448] text-xs font-bold text-white shadow" aria-hidden="true">✓</span>}
                      </span>
                    </button>
                  );
                })}
                <button
                  type="button"
                  role="radio"
                  aria-checked={type === CUSTOM_TYPE}
                  onClick={() => setType(CUSTOM_TYPE)}
                  className={cn(
                    "group relative col-span-2 overflow-hidden rounded-2xl border text-start shadow-sm transition duration-300 hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#37794e] sm:col-span-3",
                    type === CUSTOM_TYPE ? "border-[#24643d] ring-2 ring-[#24643d] dark:border-[#8fc69c] dark:ring-[#8fc69c]" : "border-[#e2e5dd] hover:border-[#76a782] dark:border-white/10",
                  )}
                >
                  <span className="relative block h-[92px] w-full overflow-hidden sm:h-[100px]">
                    <img src={materialMediaFor("custom").src} alt="Other construction materials" loading="lazy" className="size-full object-cover transition-transform duration-500 group-hover:scale-105" />
                    <span className="absolute inset-0 bg-gradient-to-r from-[#101d14]/90 via-[#101d14]/55 to-transparent" aria-hidden="true" />
                    <span className="absolute inset-y-0 start-4 flex max-w-[75%] flex-col justify-center text-white">
                      <span className="font-archivo text-sm font-bold">Other / Custom</span>
                      <span className="mt-1 text-[10px] text-white/85">Other construction materials not listed above.</span>
                    </span>
                    {type === CUSTOM_TYPE && <span className="absolute right-3 top-3 flex size-6 items-center justify-center rounded-full border-2 border-white bg-[#267448] text-xs font-bold text-white shadow" aria-hidden="true">✓</span>}
                  </span>
                </button>
              </div>
              {type === CUSTOM_TYPE && (
                <div className="mt-4 rounded-xl border border-[#dce7da] bg-[#f2f7ef] p-4 dark:border-white/10 dark:bg-white/[0.03]">
                  <label htmlFor="custom-material-name" className="block text-sm font-semibold text-ink-800 dark:text-gray-200">Material name</label>
                  <input
                    id="custom-material-name"
                    type="text"
                    value={customName}
                    onChange={(event) => setCustomName(event.target.value)}
                    placeholder="Enter material name, e.g. roof tiles, copper wire"
                    required
                    className="mt-2 block w-full rounded-xl border border-[#d7ded5] bg-white p-3 text-sm outline-none transition focus:border-[#4f8b60] focus:ring-2 focus:ring-[#4f8b60]/15 dark:border-steel-700 dark:bg-black dark:text-white"
                  />
                  <p className="mt-2 text-xs text-steel-500 dark:text-gray-400">Your custom material becomes a real GreenLoop material — usable in inventory, requests, offers, matching and pricing.</p>
                </div>
              )}
              <div className="mt-5 flex justify-end"><button onClick={() => setStep(2)} className="min-h-10 rounded-xl bg-[#164b2d] px-7 py-2.5 font-semibold text-white shadow-sm transition hover:bg-[#22633e] dark:bg-[#2d7047]">Continue <span aria-hidden="true">→</span></button></div>
            </motion.div>
          )}
          {step === 3 && (
            <motion.div key="choose-location" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="rounded-2xl border border-[#e3e5dc] bg-white p-4 shadow-[0_12px_36px_rgba(31,49,35,.06)] dark:border-white/10 dark:bg-[#17241b] sm:p-6">
              <h2 className="font-archivo text-2xl font-bold tracking-tight text-[#1e3024] dark:text-white">Where is the material?</h2>
              <p className="mt-1 text-sm text-[#68756b] dark:text-gray-400">Choose the project and confirm the material’s location.</p>
              <div className="mt-5 grid items-start gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(260px,.9fr)]">
                <div className="rounded-2xl border border-[#e2e7df] bg-[#f8f9f6] p-3.5 dark:border-white/10 dark:bg-white/[0.025] sm:p-4">
                  <AddressLocation
                    label="Project location"
                    address={projectLocation}
                    onAddressChange={value => { setProjectLocation(value); setProjectGeo(undefined); }}
                    geo={projectGeo}
                    onGeoChange={setProjectGeo}
                    sources={[...dataset.projects.map((project) => project.location), ...dataset.demands.map((demand) => demand.location)]}
                    placeholder="Search project address…"
                    showMapPreview={false}
                  />
                  <div className="mt-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-[#536559] dark:text-gray-300">Project</p>
                      <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">Required</span>
                    </div>
                    <p className="text-[11px] text-[#55705d] dark:text-[#a0cfae]">
                      ✓ Site location and coordinates automatically sync from the selected project profile.
                    </p>
                    {dataset.projects.map(p => (
                      <label key={p.id} className={cn("flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition-all hover:border-[#75a682]", projectId === p.id ? "border-[#6d9a73] bg-[#e9f2e7] dark:bg-[#203a28]" : "border-[#e2e7df] bg-white dark:border-white/10 dark:bg-[#17241b]")}>
                        <input type="radio" name="project" value={p.id} checked={projectId === p.id} onChange={() => { setProjectId(p.id); setProjectGeo(p.geo); setProjectLocation(p.location); }} className="size-4 accent-[#24643d]" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-bold text-[#243229] dark:text-white">{p.name}</span>
                          <span className="block truncate text-[10px] text-[#748078] dark:text-gray-400">{p.location} · {p.status}</span>
                        </span>
                      </label>
                    ))}
                    {showProjectForm ? (
                      <div className="grid gap-3 rounded-xl border border-[#dce7da] bg-white p-3 dark:border-white/10 dark:bg-[#17241b]">
                        <label className="text-xs font-medium text-[#536559] dark:text-gray-300">{t("projectLocationForm.name")}<input value={projectName} maxLength={250} disabled={creatingProject} onChange={(event) => setProjectName(event.target.value)} placeholder={t("projectLocationForm.name")} className="mt-1 h-10 w-full rounded-xl border border-[#d7ded5] bg-white px-3 text-sm dark:border-steel-700 dark:bg-black dark:text-white" /></label>
                        <label className="text-xs font-medium text-[#536559] dark:text-gray-300">{t("projectLocationForm.location")}<input value={projectLocation} maxLength={250} disabled={creatingProject} onChange={event => { setProjectLocation(event.target.value); setProjectGeo(undefined); setProjectError(""); }} placeholder={t("projectLocationForm.placeholder")} className="mt-1 h-10 w-full rounded-xl border border-[#d7ded5] bg-white px-3 text-sm dark:border-steel-700 dark:bg-black dark:text-white" /></label>
                        <p className="text-xs text-[#748078] dark:text-gray-400">{t("projectLocationForm.hint")}</p>
                        {projectError && <p role="alert" className="text-sm text-error-600 dark:text-error-300">{projectError}</p>}
                        <div className="flex gap-2">
                          <button type="button" onClick={handleCreateProject} disabled={creatingProject || !projectName.trim() || !projectLocation.trim()} className="min-h-9 rounded-lg bg-[#24643d] px-4 text-xs font-semibold text-white transition hover:bg-[#174b2d] disabled:opacity-50">{t(creatingProject ? "projectLocationForm.creating" : "projectLocationForm.create")}</button>
                          {dataset.projects.length > 0 && <button type="button" disabled={creatingProject} onClick={() => setShowProjectForm(false)} className="min-h-9 rounded-lg px-3 text-xs font-semibold text-[#536559] dark:text-gray-300">Cancel</button>}
                        </div>
                      </div>
                    ) : (
                      <button type="button" onClick={() => setShowProjectForm(true)} className="flex min-h-10 w-full items-center gap-2 rounded-xl border border-dashed border-[#cbd8c9] px-3 text-start text-xs font-semibold text-[#315f3d] transition hover:bg-[#f2f7ef] dark:border-white/15 dark:text-[#a6c7ad]">
                        <span className="flex size-5 items-center justify-center rounded-full border border-current">+</span>
                        Create a project
                      </button>
                    )}
                  </div>
                </div>
                <div className="rounded-2xl border border-[#e2e7df] bg-[#f8f9f6] p-3 dark:border-white/10 dark:bg-white/[0.025]">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-[#536559] dark:text-gray-300">Location preview</h3>
                    {projectGeo && (
                      <button type="button" onClick={() => setProjectGeo(undefined)} className="text-[10px] font-semibold text-[#477e5d] underline underline-offset-2 dark:text-[#a6c7ad]">
                        Remove pin
                      </button>
                    )}
                  </div>
                  <div className="overflow-hidden rounded-xl">
                    <LocationMap geo={projectGeo} size="sm" className="!h-[190px] rounded-xl" />
                  </div>
                  <div className="mt-2 rounded-xl border border-[#e2e7df] bg-white px-3 py-2 dark:border-white/10 dark:bg-[#17241b]">
                    <p className="text-[9px] font-semibold uppercase tracking-wide text-[#879188]">Selected location</p>
                    <p className="mt-0.5 truncate text-xs font-semibold text-[#35443a] dark:text-gray-200">{projectLocation || "Choose or enter a project location"}</p>
                    {projectGeo && <p className="mt-1 text-[9px] text-[#748078] dark:text-gray-400">{projectGeo.lat.toFixed(5)}, {projectGeo.lng.toFixed(5)}</p>}
                  </div>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                <button onClick={() => setStep(2)} className="min-h-10 rounded-xl px-4 font-semibold text-[#536559] transition hover:bg-[#eff3ec] dark:text-gray-300 dark:hover:bg-white/5">Back</button>
                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => void handleSave("draft")}
                    disabled={isSavingDraft}
                    className="min-h-10 rounded-xl border border-[#cbd5cb] px-4 py-2 text-xs font-semibold text-[#3b5443] transition hover:bg-[#edf3eb] dark:border-steel-700 dark:text-gray-300 dark:hover:bg-white/5"
                  >
                    {isSavingDraft ? "Saving…" : "Save as Draft"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSave("published")}
                    disabled={!projectId || creatingProject || showProjectForm || isSavingDraft}
                    className="min-h-10 rounded-xl border border-[#24643d] px-5 py-2 text-xs font-bold text-[#164b2d] transition hover:bg-[#f2f7f0] disabled:opacity-50 dark:border-[#8fc69c] dark:text-[#a5d8b1] dark:hover:bg-white/5"
                  >
                    ⚡ Quick Publish
                  </button>
                  <button onClick={() => setStep(4)} disabled={!projectId || creatingProject || showProjectForm} className="min-h-10 rounded-xl bg-[#164b2d] px-7 py-2.5 font-semibold text-white shadow-sm transition hover:bg-[#22633e] disabled:opacity-50 dark:bg-[#2d7047]">Continue <span aria-hidden="true">→</span></button>
                </div>
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div key="step2" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="rounded-2xl border border-[#e3e5dc] bg-white p-4 shadow-[0_12px_36px_rgba(31,49,35,.06)] dark:border-white/10 dark:bg-[#17241b] sm:p-6">
              <h2 className="font-archivo text-2xl font-bold tracking-tight text-[#1e3024] dark:text-white">How much material is there?</h2>
              <p className="mt-1 text-sm text-[#68756b] dark:text-gray-400">Enter your best estimate in tonnes. Add a range, condition, and grade if you know them.</p>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2 flex items-center gap-3 rounded-2xl border border-[#e0e7dc] bg-[#f5f7f2] p-2.5 dark:border-white/10 dark:bg-white/[0.03]">
                  <img src={materialMediaFor(typeValue).src} alt={materialMediaFor(typeValue).alt} className="size-14 shrink-0 rounded-xl object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-[#79877c] dark:text-gray-400">Selected material</p>
                    <p className="truncate font-archivo text-sm font-bold text-[#243229] dark:text-white">{materialTypeLabel(typeValue) || "Custom material"}</p>
                  </div>
                  <button type="button" onClick={() => setStep(1)} className="min-h-9 rounded-lg border border-[#b8c9b9] bg-white px-4 text-xs font-semibold text-[#315f3d] transition hover:bg-[#edf4e9] dark:border-white/15 dark:bg-[#17241b] dark:text-[#b9d9bf]">Change</button>
                </div>
                <div className="rounded-2xl border border-[#e4e8df] bg-[#f8f9f6] p-3 dark:border-white/10 dark:bg-white/[0.025]">
                  <div>
                    <label className="mb-1.5 flex items-center justify-between text-xs font-semibold text-[#536559] dark:text-gray-300">
                      <span>Unit</span>
                      <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">Required</span>
                    </label>
                    <input type="text" value={unit} onChange={e => {
                        setUnit(e.target.value);
                        if (e.target.value.toLowerCase() === 'tonnes' || e.target.value.toLowerCase() === 't') setConversionFactor("1");
                    }} className="h-10 w-full rounded-xl border border-[#d7ded5] bg-white px-3 text-sm outline-none transition focus:border-[#4f8b60] focus:ring-2 focus:ring-[#4f8b60]/15 dark:border-steel-700 dark:bg-black dark:text-white" placeholder="tonnes, m3, pallets..." />
                  </div>
                </div>
                <div className="rounded-2xl border border-[#e4e8df] bg-[#f8f9f6] p-3 dark:border-white/10 dark:bg-white/[0.025]">
                  <label className="mb-1.5 flex items-center justify-between text-xs font-semibold text-[#536559] dark:text-gray-300">
                    <span>Conversion factor (t/unit)</span>
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[9px] font-medium text-gray-600 dark:bg-white/10 dark:text-gray-400">Optional</span>
                  </label>
                  <input type="number" step="0.01" value={conversionFactor} onChange={e => setConversionFactor(e.target.value)} className="h-10 w-full rounded-xl border border-[#d7ded5] bg-white px-3 text-sm outline-none transition focus:border-[#4f8b60] focus:ring-2 focus:ring-[#4f8b60]/15 dark:border-steel-700 dark:bg-black dark:text-white" disabled={isTonnes} />
                </div>
                <div className="sm:col-span-2 rounded-2xl border border-[#dce7da] bg-[#f3f7f0] p-3.5 dark:border-white/10 dark:bg-white/[0.03]">
                  <label className="mb-1.5 flex items-center justify-between text-xs font-semibold text-[#536559] dark:text-gray-300">
                    <span>Estimated quantity ({unit})</span>
                    <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">Required</span>
                  </label>
                  <input type="number" value={quantity} onChange={e => handleQuantityChange(e.target.value)} className="h-11 w-full rounded-xl border border-[#d7ded5] bg-white px-3 text-base font-semibold outline-none transition focus:border-[#4f8b60] focus:ring-2 focus:ring-[#4f8b60]/15 dark:border-steel-700 dark:bg-black dark:text-white" />
                  {!isTonnes && <p className="mt-1.5 text-xs font-medium text-[#58705f] dark:text-gray-300">Equivalent to {quantityTValue.toFixed(2)} tonnes</p>}
                </div>
                <details className="sm:col-span-2 rounded-xl border border-[#e2e7df] bg-white px-4 py-3 dark:border-white/10 dark:bg-white/[0.02]">
                  <summary className="cursor-pointer text-sm font-semibold text-[#35443a] dark:text-gray-200">Optional details: estimate range, condition, and grade</summary>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-[#536559] dark:text-gray-300">Estimate range · minimum ({unit})</label>
                  <input type="number" value={rangeMin} onChange={e => setRangeMin(e.target.value)} className="h-10 w-full rounded-xl border border-[#d7ded5] bg-[#f8f9f6] px-3 text-sm outline-none transition focus:border-[#4f8b60] focus:ring-2 focus:ring-[#4f8b60]/15 dark:border-steel-700 dark:bg-black dark:text-white" />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-[#536559] dark:text-gray-300">Estimate range · maximum ({unit})</label>
                  <input type="number" value={rangeMax} onChange={e => setRangeMax(e.target.value)} className="h-10 w-full rounded-xl border border-[#d7ded5] bg-[#f8f9f6] px-3 text-sm outline-none transition focus:border-[#4f8b60] focus:ring-2 focus:ring-[#4f8b60]/15 dark:border-steel-700 dark:bg-black dark:text-white" />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-[#536559] dark:text-gray-300">Condition</label>
                  <select value={condition} onChange={e => setCondition(e.target.value as MaterialCondition)} className="h-10 w-full rounded-xl border border-[#d7ded5] bg-[#f8f9f6] px-3 text-sm outline-none transition focus:border-[#4f8b60] focus:ring-2 focus:ring-[#4f8b60]/15 dark:border-steel-700 dark:bg-black dark:text-white">
                    <option value="good">Good</option>
                    <option value="fair">Fair</option>
                    <option value="poor">Poor</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-[#536559] dark:text-gray-300">Grade</label>
                  <select value={grade} onChange={e => setGrade(e.target.value as MaterialGrade)} className="h-10 w-full rounded-xl border border-[#d7ded5] bg-[#f8f9f6] px-3 text-sm outline-none transition focus:border-[#4f8b60] focus:ring-2 focus:ring-[#4f8b60]/15 dark:border-steel-700 dark:bg-black dark:text-white">
                    <option value="A">Grade A</option>
                    <option value="B">Grade B</option>
                    <option value="C">Grade C</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-[#536559] dark:text-gray-300">Available from</label>
                  <input type="date" value={availableFrom} onChange={(event) => setAvailableFrom(event.target.value)} className="h-10 w-full rounded-xl border border-[#d7ded5] bg-[#f8f9f6] px-3 text-sm outline-none transition focus:border-[#4f8b60] focus:ring-2 focus:ring-[#4f8b60]/15 dark:border-steel-700 dark:bg-black dark:text-white" />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-[#536559] dark:text-gray-300">Price per tonne (₹, optional)</label>
                  <input type="number" min="0" step="1" value={pricePerT} onChange={(event) => setPricePerT(event.target.value)} className="h-10 w-full rounded-xl border border-[#d7ded5] bg-[#f8f9f6] px-3 text-sm outline-none transition focus:border-[#4f8b60] focus:ring-2 focus:ring-[#4f8b60]/15 dark:border-steel-700 dark:bg-black dark:text-white" />
                </div>
                <div className="sm:col-span-2 rounded-xl border border-[#d6e5d8] bg-[#f4f9f5] p-3 dark:border-steel-800 dark:bg-white/[0.02]">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={reusable}
                      onChange={(e) => setReusable(e.target.checked)}
                      className="size-4 accent-[#164b2d] rounded"
                    />
                    <span className="text-xs font-semibold text-[#1e3b26] dark:text-gray-200">
                      Designate as Reusable Asset
                      <span className="block text-[11px] font-normal text-[#586b5c] dark:text-gray-400">
                        Select if the material consists of intact, salvaged components suitable for direct circular reuse without downcycling (e.g. whole bricks, structural timber, steel beams, rebar).
                      </span>
                    </span>
                  </label>
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="survey-notes" className="mb-1.5 block text-xs font-semibold text-[#536559] dark:text-gray-300">Survey notes</label>
                  <textarea id="survey-notes" value={surveyNotes} onChange={(event) => setSurveyNotes(event.target.value)} rows={3} className="w-full rounded-xl border border-[#d7ded5] bg-[#f8f9f6] px-3 py-2 text-sm outline-none transition focus:border-[#4f8b60] focus:ring-2 focus:ring-[#4f8b60]/15 dark:border-steel-700 dark:bg-black dark:text-white" />
                </div>
                  </div>
                </details>
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                <button onClick={() => setStep(1)} className="min-h-10 rounded-xl px-4 font-semibold text-[#536559] transition hover:bg-[#eff3ec] dark:text-gray-300 dark:hover:bg-white/5">Back</button>
                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => void handleSave("draft")}
                    disabled={isSavingDraft}
                    className="min-h-10 rounded-xl border border-[#cbd5cb] px-4 py-2 text-xs font-semibold text-[#3b5443] transition hover:bg-[#edf3eb] dark:border-steel-700 dark:text-gray-300 dark:hover:bg-white/5"
                  >
                    {isSavingDraft ? "Saving…" : "Save as Draft"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSave("published")}
                    disabled={isSavingDraft}
                    className="min-h-10 rounded-xl border border-[#24643d] px-5 py-2 text-xs font-bold text-[#164b2d] transition hover:bg-[#f2f7f0] dark:border-[#8fc69c] dark:text-[#a5d8b1] dark:hover:bg-white/5"
                  >
                    ⚡ Quick Publish
                  </button>
                  <button onClick={() => setStep(3)} className="min-h-10 rounded-xl bg-[#164b2d] px-7 py-2.5 font-semibold text-white shadow-sm transition hover:bg-[#22633e] dark:bg-[#2d7047]">Continue <span aria-hidden="true">→</span></button>
                </div>
              </div>
            </motion.div>
          )}

          {step === 4 && (
            <motion.div key="add-photos" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="rounded-2xl border border-[#e3e5dc] bg-white p-4 shadow-[0_12px_36px_rgba(31,49,35,.06)] dark:border-white/10 dark:bg-[#17241b] sm:p-6">
              <h2 className="font-archivo text-2xl font-bold tracking-tight text-[#1e3024] dark:text-white">Add photos</h2>
              <p className="mt-1 text-sm text-[#68756b] dark:text-gray-400">Photos help providers and receivers understand what the material looks like.</p>

              <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(220px,.8fr)]">
                <div className="flex min-h-[210px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[#bdcdbd] bg-[#f7f9f5] px-4 py-5 text-center transition focus-within:ring-2 focus-within:ring-[#4f8b60]/25 focus-within:ring-offset-2 dark:border-white/15 dark:bg-white/[0.025] dark:focus-within:ring-offset-[#17241b]">
                  <span className="flex size-11 items-center justify-center rounded-2xl bg-[#e3f0e2] text-[#2d7546] dark:bg-[#203a28] dark:text-[#a6c7ad]" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" className="size-6" stroke="currentColor" strokeWidth="1.7"><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 14v4.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V14" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </span>
                  <p className="mt-3 font-archivo text-sm font-bold text-[#263b2c] dark:text-white">Add photos or documents</p>
                  <p className="mt-1 text-xs text-[#748078] dark:text-gray-400">Choose images or PDF evidence from your device.</p>
                  <input id="material-evidence-files" type="file" disabled={uploading} multiple accept="image/png,image/jpeg,image/webp,.pdf" onChange={(event) => handleFiles(event.target.files)} className="sr-only" />
                  <label htmlFor="material-evidence-files" className={cn("mt-3 inline-flex min-h-9 cursor-pointer items-center rounded-lg bg-[#164b2d] px-5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#22633e]", uploading && "pointer-events-none opacity-50")}>
                    {uploading ? t("backend.uploadingEvidence") : "Choose files"}
                  </label>
                  <p className="mt-2 text-[10px] text-[#879188] dark:text-gray-500">{t("backend.uploadLimits")}</p>
                  {uploading && <p role="status" className="sr-only">{t("backend.uploadingEvidence")}</p>}
                  {uploadError && <p role="alert" className="mt-2 text-xs text-error-500">{uploadError}</p>}
                  {evidence.length === 0 && <p className="mt-1 text-[10px] text-[#879188]">No evidence attached yet.</p>}
                </div>
                <aside className="rounded-2xl border border-[#e2e7df] bg-[#f6f8f3] p-4 dark:border-white/10 dark:bg-white/[0.025]">
                  <h3 className="font-archivo text-sm font-bold text-[#263b2c] dark:text-white">Tips for good photos</h3>
                  <ul className="mt-3 space-y-2.5 text-xs text-[#536559] dark:text-gray-300">
                    {["Show the material clearly", "Include multiple angles", "Show scale if possible", "Avoid blurred or dark images"].map((tip) => (
                      <li key={tip} className="flex items-center gap-2">
                        <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-[#dff0df] text-[10px] font-bold text-[#287244] dark:bg-[#203a28] dark:text-[#a6c7ad]" aria-hidden="true">✓</span>
                        {tip}
                      </li>
                    ))}
                  </ul>
                </aside>
              </div>

              <div className="mt-5">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h3 className="text-xs font-bold text-[#35443a] dark:text-gray-200">Preview</h3>
                  {evidence.length > 0 && (
                    <label htmlFor="material-evidence-files" className={cn("cursor-pointer text-xs font-semibold text-[#37794e] underline underline-offset-2 dark:text-[#a6c7ad]", uploading && "pointer-events-none opacity-50")}>
                      + Add more
                    </label>
                  )}
                </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {evidence.map((ev, idx) => (
                  <div key={idx} className="group relative overflow-hidden rounded-xl border border-[#e2e7df] bg-white dark:border-white/10 dark:bg-[#17241b]">
                    {ev.kind === "site-photo" && ev.ref ? (
                      <div className="relative h-28 w-full bg-[#eef1eb] dark:bg-steel-900">
                        <img src={ev.ref} alt={ev.label} className="size-full object-cover transition-transform duration-500 group-hover:scale-105" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                      </div>
                    ) : (
                      <div className="flex h-28 w-full items-center justify-center bg-[#f4f6f2] dark:bg-steel-900/50">
                        <svg className="size-8 text-steel-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                    )}
                    <div className={cn("p-2.5", ev.kind === "site-photo" ? "text-[#263b2c] dark:text-white" : "text-ink-900 dark:text-white")}>
                      <div className="flex items-start justify-between gap-1">
                        <p className="truncate text-[11px] font-bold">{ev.label}</p>
                        <button
                          type="button"
                          onClick={() => setEvidence(prev => prev.filter((_, i) => i !== idx))}
                          className="text-xs text-red-500 hover:text-red-700 dark:text-red-400 font-bold px-1"
                          title="Remove attachment"
                        >
                          ×
                        </button>
                      </div>
                      <p className="mt-0.5 flex items-center justify-between text-[9px] text-[#748078] dark:text-gray-400">
                        <span>{ev.kind}</span>
                        <span className="text-loop-400 font-medium">Attached</span>
                      </p>
                    </div>
                  </div>
                ))}
                {evidence.length > 0 && (
                  <label htmlFor="material-evidence-files" className={cn("flex min-h-[150px] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-[#cbd8c9] bg-[#fafbf9] text-[#68756b] transition hover:border-[#7aa584] hover:bg-[#f2f7ef] dark:border-white/15 dark:bg-white/[0.02] dark:text-gray-300 dark:hover:bg-white/[0.05]", uploading && "pointer-events-none opacity-50")}>
                    <span className="flex size-8 items-center justify-center rounded-full border border-[#d8e2d6] bg-white text-lg dark:border-white/10 dark:bg-[#17241b]" aria-hidden="true">+</span>
                    <span className="mt-2 text-[10px] font-semibold">Add more</span>
                  </label>
                )}
              </div>
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                <button onClick={() => setStep(3)} className="min-h-10 rounded-xl px-4 font-semibold text-[#536559] transition hover:bg-[#eff3ec] dark:text-gray-300 dark:hover:bg-white/5">Back</button>
                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => void handleSave("draft")}
                    disabled={isSavingDraft}
                    className="min-h-10 rounded-xl border border-[#cbd5cb] px-4 py-2 text-xs font-semibold text-[#3b5443] transition hover:bg-[#edf3eb] dark:border-steel-700 dark:text-gray-300 dark:hover:bg-white/5"
                  >
                    {isSavingDraft ? "Saving…" : "Save as Draft"}
                  </button>
                  <button onClick={() => setStep(5)} disabled={evidence.length === 0} className="min-h-10 rounded-xl bg-[#164b2d] px-7 py-2.5 font-semibold text-white shadow-sm transition hover:bg-[#22633e] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#2d7047]">Continue <span aria-hidden="true">→</span></button>
                </div>
              </div>
            </motion.div>
          )}

          {step === 5 && (
            <motion.div key="review-material" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="rounded-2xl border border-[#e3e5dc] bg-white p-4 shadow-[0_12px_36px_rgba(31,49,35,.06)] dark:border-white/10 dark:bg-[#17241b] sm:p-6">
              <h2 className="font-archivo text-2xl font-bold tracking-tight text-[#1e3024] dark:text-white">Review &amp; Create Passport</h2>
              <p className="mt-1 text-sm text-[#68756b] dark:text-gray-400">Check the details before creating the material passport.</p>

              <div className="mt-5 grid gap-4 lg:grid-cols-[230px_minmax(0,1fr)]">
                <div className="overflow-hidden rounded-2xl border border-[#e2e7df] bg-[#f5f7f2] dark:border-white/10 dark:bg-white/[0.03]">
                  <img src={materialMediaFor(typeValue).src} alt={materialMediaFor(typeValue).alt} className="h-40 w-full object-cover sm:h-48" />
                  <div className="p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-[#79877c]">Material</p>
                    <p className="mt-0.5 font-archivo text-sm font-bold text-[#243229] dark:text-white">{materialTypeLabel(typeValue) || "Custom material"}</p>
                    <p className="mt-1 text-xs text-[#68756b] dark:text-gray-400">Grade {grade} · {condition}</p>
                  </div>
                </div>

                <dl className="grid content-start grid-cols-2 gap-2 sm:grid-cols-3">
                  <div className="rounded-xl border border-[#e2e7df] bg-[#f8f9f6] p-3 dark:border-white/10 dark:bg-white/[0.025]">
                    <dt className="text-[10px] font-semibold uppercase tracking-wide text-[#879188]">Project</dt>
                    <dd className="mt-1 text-sm font-bold text-[#243229] dark:text-white">{dataset.projects.find(p => p.id === projectId)?.name}</dd>
                  </div>
                  <div className="rounded-xl border border-[#e2e7df] bg-[#f8f9f6] p-3 dark:border-white/10 dark:bg-white/[0.025]">
                    <dt className="text-[10px] font-semibold uppercase tracking-wide text-[#879188]">Quantity</dt>
                    <dd className="mt-1 text-sm font-bold text-[#243229] dark:text-white">{isTonnes ? `${quantity} t` : `${quantity} ${unit} (${quantityTValue.toFixed(1)} t)`}</dd>
                  </div>
                  <div className="rounded-xl border border-[#e2e7df] bg-[#f8f9f6] p-3 dark:border-white/10 dark:bg-white/[0.025]">
                    <dt className="text-[10px] font-semibold uppercase tracking-wide text-[#879188]">Location</dt>
                    <dd className="mt-1 text-sm font-bold text-[#243229] dark:text-white">{projectLocation || "Not specified"}</dd>
                    {projectGeo && <dd className="mt-1 text-[10px] text-[#748078] dark:text-gray-400">Pinned on map</dd>}
                  </div>
                  <div className="rounded-xl border border-[#e2e7df] bg-[#f8f9f6] p-3 dark:border-white/10 dark:bg-white/[0.025]">
                    <dt className="text-[10px] font-semibold uppercase tracking-wide text-[#879188]">Availability</dt>
                    <dd className="mt-1 text-sm font-bold text-[#243229] dark:text-white">{availableFrom || "Not specified"}</dd>
                  </div>
                  {pricePerT !== "" && <div className="rounded-xl border border-[#e2e7df] bg-[#f8f9f6] p-3 dark:border-white/10 dark:bg-white/[0.025]"><dt className="text-[10px] font-semibold uppercase tracking-wide text-[#879188]">Price / tonne</dt><dd className="mt-1 text-sm font-bold text-[#243229] dark:text-white">₹{Number(pricePerT).toLocaleString("en-IN")}</dd></div>}
                  <div className="rounded-xl border border-[#e2e7df] bg-[#f8f9f6] p-3 dark:border-white/10 dark:bg-white/[0.025]">
                    <dt className="text-[10px] font-semibold uppercase tracking-wide text-[#879188]">Estimate range</dt>
                    <dd className="mt-1 text-sm font-bold text-[#243229] dark:text-white">{estimateRange[0].toFixed(1)}–{estimateRange[1].toFixed(1)} t</dd>
                  </div>
                  <div className="rounded-xl border border-[#e2e7df] bg-[#f8f9f6] p-3 dark:border-white/10 dark:bg-white/[0.025]">
                    <dt className="text-[10px] font-semibold uppercase tracking-wide text-[#879188]">Photos &amp; evidence</dt>
                    <dd className="mt-1 text-sm font-bold text-[#243229] dark:text-white">{evidence.length} attachments</dd>
                  </div>
                  <div className="rounded-xl border border-[#d7e6d4] bg-[#eff6ec] p-3 dark:border-white/10 dark:bg-[#203a28]">
                    <dt className="text-[10px] font-semibold uppercase tracking-wide text-[#5d8064] dark:text-[#a6c7ad]">Status</dt>
                    <dd className="mt-1 inline-flex items-center gap-1.5 text-sm font-bold text-[#28613c] dark:text-white"><span className="size-1.5 rounded-full bg-[#4c9a5e]" />Ready to create</dd>
                  </div>
                  {reusable && (
                    <div className="rounded-xl border border-[#d7e6d4] bg-[#eff6ec] p-3 dark:border-white/10 dark:bg-[#203a28]">
                      <dt className="text-[10px] font-semibold uppercase tracking-wide text-[#5d8064] dark:text-[#a6c7ad]">Asset Type</dt>
                      <dd className="mt-1 inline-flex items-center gap-1.5 text-sm font-bold text-[#28613c] dark:text-white">♻ Reusable Asset</dd>
                    </div>
                  )}
                  {surveyNotes.trim() && <div className="col-span-2 rounded-xl border border-[#e2e7df] bg-[#f8f9f6] p-3 dark:border-white/10 dark:bg-white/[0.025] sm:col-span-3"><dt className="text-[10px] font-semibold uppercase tracking-wide text-[#879188]">Survey notes</dt><dd className="mt-1 text-sm text-[#536559] dark:text-gray-300">{surveyNotes.trim()}</dd></div>}
                </dl>
              </div>

              {/* Verification Limitations Scope Notice */}
              <div className="mt-4 rounded-xl border border-[#d8e5d9] bg-[#f4f8f5] p-3.5 text-xs text-[#2b4c33] dark:border-steel-800 dark:bg-[#14291c] dark:text-[#a6d5b0]">
                <p className="font-bold uppercase tracking-wider text-[11px] text-[#224e2c] dark:text-[#8fe0a4]">Notice on Survey Scope &amp; Verification Limitations</p>
                <p className="mt-1 leading-relaxed opacity-95">
                  Initial Material Passports capture on-site survey estimations and uploaded digital evidence. Definitive net weight and material purity verification are executed upon delivery arrival at the destination facility weighbridge.
                </p>
              </div>
              {evidence.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {evidence.slice(0, 5).map((item, index) => item.kind === "site-photo" ? (
                    <img key={`${item.label}-${index}`} src={item.ref} alt={item.label} title={item.label} className="size-14 rounded-lg border border-[#e2e7df] object-cover dark:border-white/10" />
                  ) : (
                    <span key={`${item.label}-${index}`} title={item.label} className="flex h-14 max-w-36 items-center gap-2 rounded-lg border border-[#e2e7df] bg-[#f8f9f6] px-2 text-[10px] text-[#536559] dark:border-white/10 dark:bg-white/[0.025] dark:text-gray-300"><span aria-hidden="true">▤</span><span className="truncate">{item.label}</span></span>
                  ))}
                  {evidence.length > 5 && <span className="flex size-14 items-center justify-center rounded-lg bg-[#edf3ea] text-xs font-semibold text-[#536559] dark:bg-white/5 dark:text-gray-300">+{evidence.length - 5}</span>}
                </div>
              )}

              {validationError && <p role="alert" className="mt-4 text-sm text-error-500">{validationError}</p>}
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                <button onClick={() => setStep(4)} className="min-h-10 rounded-xl px-4 font-semibold text-[#536559] transition hover:bg-[#eff3ec] dark:text-gray-300 dark:hover:bg-white/5">Back</button>
                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => void handleSave("draft")}
                    disabled={isSavingDraft}
                    className="min-h-10 rounded-xl border border-[#cbd5cb] px-4 py-2 text-xs font-semibold text-[#3b5443] transition hover:bg-[#edf3eb] dark:border-steel-700 dark:text-gray-300 dark:hover:bg-white/5"
                  >
                    {isSavingDraft ? "Saving…" : "Save as Draft"}
                  </button>
                  <button onClick={() => void handleSave("published")} disabled={uploading || isSavingDraft} className="min-h-10 rounded-xl bg-[#164b2d] px-6 py-2.5 font-semibold text-white shadow-sm transition hover:bg-[#22633e] disabled:opacity-50 dark:bg-[#2d7047] sm:px-8">
                    {existingDraft ? "Update & Publish Passport" : "Create Material Passport"} <span aria-hidden="true">→</span>
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {step === 6 && createdPassport && (
            <motion.div key="step5" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.45 }} className="relative overflow-hidden rounded-3xl border border-[#dfe8d9] bg-gradient-to-br from-[#f8fbf5] via-white to-[#eaf3e5] p-4 shadow-[0_20px_60px_rgba(31,49,35,.1)] dark:border-white/10 dark:from-[#17241b] dark:via-[#1a2c20] dark:to-[#203a28] sm:p-8">
              <div className="grid items-center gap-5 md:grid-cols-[minmax(0,1fr)_minmax(260px,.8fr)]">
              <div className="text-center md:py-6">
              <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-[#dff1df] text-[#218247] shadow-[0_0_0_8px_rgba(88,153,96,.1)] dark:bg-loop-500/20 dark:text-loop-300">
                <svg className="size-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-xs font-bold uppercase tracking-[.18em] text-[#4b805e] dark:text-[#a6c7ad]">GreenLoop Material Passport</p>
              <h2 className="mt-2 font-archivo text-3xl font-bold tracking-tight text-[#1e3024] dark:text-white sm:text-4xl">Material Passport Created</h2>
              <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-[#68756b] dark:text-gray-300">
                Passport <strong className="text-ink-900 dark:text-white">{createdPassport.id}</strong> has been issued for {createdPassport.quantityT}t of {materialTypeLabel(createdPassport.type)}.
              </p>
              
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <button onClick={() => navigate(`/app/materials/${createdPassport.id}`)} className="min-h-10 rounded-xl border border-[#b8c9b9] bg-white px-5 text-sm font-semibold text-[#315f3d] shadow-sm transition hover:bg-[#edf4e9] dark:border-white/15 dark:bg-[#17241b] dark:text-[#b9d9bf]">View Passport</button>
                <button onClick={() => navigate(`/app/market-demand?view=receivers&materialId=${encodeURIComponent(createdPassport.id)}&type=${encodeURIComponent(createdPassport.type)}`, { state: { materialId: createdPassport.id } })} className="min-h-10 rounded-xl bg-[#164b2d] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#22633e] dark:bg-[#2d7047]">Find a Receiver <span aria-hidden="true">→</span></button>
              </div>
              </div>
              <div className="relative min-h-[220px] overflow-hidden rounded-2xl border border-white/70 bg-[#dfe8d9] shadow-inner dark:border-white/10">
                <img src={materialMediaFor(createdPassport.type).src} alt={materialMediaFor(createdPassport.type).alt} className="absolute inset-0 size-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#102218]/70 via-transparent to-transparent" aria-hidden="true" />
                <div className="absolute inset-x-3 bottom-3 flex items-end justify-between gap-2">
                  <div className="rounded-xl bg-[#f7faf2]/95 px-3 py-2 shadow-sm dark:bg-[#17241b]/90">
                    <p className="text-[9px] font-semibold uppercase tracking-wide text-[#718075] dark:text-gray-400">Created passport</p>
                    <p className="mt-0.5 font-archivo text-sm font-bold text-[#243229] dark:text-white">{createdPassport.id}</p>
                  </div>
                  <span className="rounded-full border border-white/60 bg-white/90 px-3 py-1.5 text-[10px] font-bold text-[#315f3d] shadow-sm dark:border-white/10 dark:bg-[#17241b]/90 dark:text-[#b9d9bf]">{createdPassport.quantityT} t · {materialTypeLabel(createdPassport.type)}</span>
                </div>
              </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

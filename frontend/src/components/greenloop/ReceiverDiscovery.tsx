import { LocationMap } from "@/components/greenloop/LocationMap";
import FacilityResearch from "@/components/greenloop/FacilityResearch";
import MatchDetailsPanel from "@/components/greenloop/MatchDetailsPanel";
import SearchFilterBar from "@/components/greenloop/SearchFilterBar";
import { useAuth } from "@/context/AuthContext.helpers";
import { contextualMatch, evaluateMatch } from "@shared/domain/capacity";
import type { AllocationCandidate, GreenLoopDataset, MaterialPassport, MaterialTypeKey, ReceiverFacility } from "@shared/domain/types";
import { formatDate, materialTypeLabel } from "@/utils";
import { useMemo, useState, useEffect } from "react";
import { Link, useLocation, useSearchParams } from "react-router";

const materials: MaterialTypeKey[] = ["concrete", "brick", "steel", "timber", "plasterboard", "glass"];

function matchesMaterialType(facilityType: string, targetType: string): boolean {
  if (!facilityType || !targetType) return false;
  const a = facilityType.toLowerCase().replace(/[^a-z0-9]/g, "");
  const b = targetType.toLowerCase().replace(/[^a-z0-9]/g, "");
  return a.includes(b) || b.includes(a) ||
    (a.includes("concrete") && b.includes("concrete")) ||
    (a.includes("steel") && b.includes("steel")) ||
    (a.includes("brick") && b.includes("brick")) ||
    (a.includes("timber") && (b.includes("timber") || b.includes("wood"))) ||
    (b.includes("timber") && (a.includes("timber") || a.includes("wood")));
}

function facilityAcceptsType(receiver: ReceiverFacility, type: string): boolean {
  if (!type) return true;
  if (!receiver.acceptedTypes || receiver.acceptedTypes.length === 0) return true;
  return receiver.acceptedTypes.some((t) => matchesMaterialType(t, type));
}

export default function ReceiverDiscovery({ dataset }: { dataset: GreenLoopDataset }) {
  const { user } = useAuth();
  const providerId = user?.email ?? "P-001";
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();

  const urlMaterialId = searchParams.get("materialId") || searchParams.get("passport") || (location.state as { materialId?: string })?.materialId || "";
  const [selectedMaterialId, setSelectedMaterialId] = useState<string>(urlMaterialId);

  useEffect(() => {
    const currentId = searchParams.get("materialId") || searchParams.get("passport") || (location.state as { materialId?: string })?.materialId || "";
    if (currentId) {
      setSelectedMaterialId(currentId);
    }
  }, [searchParams, location.state]);

  const providerMaterials = useMemo(() => {
    return dataset.materials.filter(
      (m) => m.quantityT > 0 && m.status !== "cancelled" && m.listingStatus !== "archived"
    );
  }, [dataset.materials]);

  const targetedMaterial: MaterialPassport | undefined = useMemo(() => {
    return providerMaterials.find((m) => m.id === selectedMaterialId);
  }, [providerMaterials, selectedMaterialId]);

  const providerMaterialTypes = useMemo(() => {
    return [...new Set(providerMaterials.map((m) => m.type))];
  }, [providerMaterials]);

  const [materialType, setMaterialType] = useState<string>(() => {
    if (targetedMaterial) return targetedMaterial.type;
    return searchParams.get("type") || searchParams.get("category") || "";
  });

  useEffect(() => {
    if (targetedMaterial) {
      setMaterialType(targetedMaterial.type);
    }
  }, [targetedMaterial]);

  const [locationQuery, setLocationQuery] = useState("");
  const [minimumQuantity, setMinimumQuantity] = useState("");
  const [neededBy, setNeededBy] = useState("");
  const [projectId, setProjectId] = useState("");
  const [organization, setOrganization] = useState("");
  const [status, setStatus] = useState("");
  const [onlyCompatible, setOnlyCompatible] = useState(true);

  const activeDemands = useMemo(() => {
    return dataset.demands.filter((demand) => demand.status === "OPEN" || demand.status === "PARTIALLY_COVERED");
  }, [dataset.demands]);

  const isOwnFacility = (receiver: ReceiverFacility) => {
    if (user?.receiverId && receiver.id === user.receiverId) return true;
    if (user?.organization && receiver.name && receiver.name.trim().toLowerCase() === user.organization.trim().toLowerCase()) return true;
    return false;
  };

  const isDummyFacility = (receiver: ReceiverFacility, demandsForReceiver: typeof activeDemands) => {
    return receiver.dailyIntakeT === 0 && (!receiver.acceptedTypes || receiver.acceptedTypes.length === 0) && demandsForReceiver.length === 0;
  };

  const filteredReceivers = useMemo(() => {
    return dataset.receivers.filter((receiver) => {
      const demands = activeDemands.filter((demand) => demand.receiverId === receiver.id);

      if (onlyCompatible) {
        // Exclude own facility
        if (isOwnFacility(receiver)) return false;

        // Exclude dummy facilities with zero intake, no accepted types, and no active demand
        if (isDummyFacility(receiver, demands)) return false;

        // When a specific material is targeted, evaluate compatibility
        if (targetedMaterial) {
          const typeMatch = facilityAcceptsType(receiver, targetedMaterial.type) ||
            demands.some((d) => matchesMaterialType(d.materialType, targetedMaterial.type));
          if (!typeMatch) return false;

          const candidate = evaluateMatch(dataset, {
            material: targetedMaterial,
            receiver,
            demand: demands.find((d) => matchesMaterialType(d.materialType, targetedMaterial.type)),
          });
          if (!candidate.isEligible) return false;
        } else if (materialType) {
          // When a material category filter is set
          const typeMatch = facilityAcceptsType(receiver, materialType) ||
            demands.some((d) => matchesMaterialType(d.materialType, materialType));
          if (!typeMatch) return false;
        } else {
          // When searching across all inventory: facility must accept at least one provider type OR have open demand
          const isRelevantToProvider = demands.length > 0 ||
            providerMaterialTypes.some((t) => facilityAcceptsType(receiver, t));
          if (!isRelevantToProvider) return false;
        }
      }

      const linkedProjectIds = new Set(
        dataset.bookings
          .filter((booking) => booking.receiverId === receiver.id)
          .flatMap((booking) => {
            const material = dataset.materials.find((item) => item.id === booking.materialId);
            return material ? [material.projectId] : [];
          })
      );
      const query = locationQuery.trim().toLowerCase();
      return (
        (!query || `${receiver.location} ${receiver.name}`.toLowerCase().includes(query)) &&
        (!minimumQuantity || receiver.dailyIntakeT >= Number(minimumQuantity) || demands.some((demand) => demand.requiredT >= Number(minimumQuantity))) &&
        (!neededBy || demands.some((demand) => demand.period <= neededBy)) &&
        (!projectId || linkedProjectIds.has(projectId)) &&
        (!organization || receiver.name.toLowerCase().includes(organization.trim().toLowerCase())) &&
        (!status || demands.some((demand) => demand.status === status))
      );
    });
  }, [
    dataset,
    activeDemands,
    onlyCompatible,
    user,
    targetedMaterial,
    materialType,
    providerMaterialTypes,
    locationQuery,
    minimumQuantity,
    neededBy,
    projectId,
    organization,
    status,
  ]);

  const evaluatedReceivers = useMemo(() => {
    return filteredReceivers
      .map((receiver) => {
        const demands = activeDemands.filter((item) => item.receiverId === receiver.id);
        const demand = targetedMaterial
          ? demands.find((d) => matchesMaterialType(d.materialType, targetedMaterial.type)) || demands[0]
          : materialType
          ? demands.find((d) => matchesMaterialType(d.materialType, materialType)) || demands[0]
          : demands[0];

        let matchCandidate: AllocationCandidate | null = null;
        let matchScore = 0;

        if (targetedMaterial) {
          matchCandidate = evaluateMatch(dataset, {
            material: targetedMaterial,
            receiver,
            demand,
            filters: {
              minimumQuantityT: minimumQuantity ? Number(minimumQuantity) : undefined,
              neededBy: neededBy || undefined,
              locationQuery: locationQuery || undefined,
              materialType: targetedMaterial.type,
            },
          });
          matchScore = matchCandidate?.score ?? 0;
        } else {
          const matchCandidates = contextualMatch(
            dataset,
            demand ? { demandId: demand.id } : { receiverId: receiver.id },
            {
              minimumQuantityT: minimumQuantity ? Number(minimumQuantity) : undefined,
              neededBy: neededBy || undefined,
              locationQuery: locationQuery || undefined,
              materialType: materialType || undefined,
            }
          ).filter((c) => c.providerId === providerId);
          matchCandidate = matchCandidates.length > 0 ? matchCandidates[0] : null;
          matchScore = matchCandidate?.score ?? 0;
        }

        return {
          receiver,
          demand,
          matchCandidate,
          matchScore,
        };
      })
      .sort((a, b) => {
        const aDemand = a.demand ? 1 : 0;
        const bDemand = b.demand ? 1 : 0;
        if (aDemand !== bDemand) return bDemand - aDemand;

        if (Math.abs(b.matchScore - a.matchScore) > 0.05) {
          return b.matchScore - a.matchScore;
        }

        return b.receiver.dailyIntakeT - a.receiver.dailyIntakeT;
      });
  }, [
    filteredReceivers,
    activeDemands,
    targetedMaterial,
    materialType,
    dataset,
    minimumQuantity,
    neededBy,
    locationQuery,
    providerId,
  ]);

  const handleMaterialChange = (matId: string) => {
    setSelectedMaterialId(matId);
    const nextParams = new URLSearchParams(searchParams);
    if (!matId) {
      setMaterialType("");
      nextParams.delete("materialId");
      nextParams.delete("passport");
      nextParams.delete("type");
    } else {
      const mat = providerMaterials.find((m) => m.id === matId);
      if (mat) {
        setMaterialType(mat.type);
        nextParams.set("materialId", mat.id);
        nextParams.set("type", mat.type);
      }
    }
    setSearchParams(nextParams, { replace: true });
  };

  const jumpToDemand = () => document.getElementById("active-demand-list")?.scrollIntoView({ behavior: "smooth" });
  const customTypeOptions = [...new Set(activeDemands.map((demand) => demand.materialType))].filter(
    (item) => !materials.includes(item as MaterialTypeKey)
  );
  const activeFilterCount = [
    materialType,
    locationQuery,
    minimumQuantity,
    neededBy,
    projectId,
    organization,
    status,
    onlyCompatible ? "compatible" : "",
  ].filter(Boolean).length;

  return (
    <section id="receiver-discovery" className="mt-8 scroll-mt-24" aria-labelledby="receiver-discovery-title">
      {/* Targeted Material Context Banner */}
      {targetedMaterial ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-800/40 dark:bg-emerald-950/20">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-xs">
              <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                Finding Compatible Receivers For
              </p>
              <h3 className="font-archivo text-base font-bold text-ink-900 dark:text-white">
                {targetedMaterial.name || materialTypeLabel(targetedMaterial.type)} · {targetedMaterial.quantityT} t ({targetedMaterial.id})
              </h3>
              <p className="text-xs text-steel-600 dark:text-gray-400">
                Showing verified facilities with active demand or intake capacity for {materialTypeLabel(targetedMaterial.type)}.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedMaterialId}
              onChange={(e) => handleMaterialChange(e.target.value)}
              className="h-9 rounded-lg border border-emerald-300 bg-white px-3 text-xs font-semibold text-emerald-900 shadow-2xs dark:border-emerald-700 dark:bg-[#122319] dark:text-white"
            >
              <option value="">All Inventory Materials</option>
              {providerMaterials.map((mat) => (
                <option key={mat.id} value={mat.id}>
                  {mat.id} · {materialTypeLabel(mat.type)} ({mat.quantityT} t)
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => handleMaterialChange("")}
              className="h-9 rounded-lg border border-emerald-200 bg-white px-3 text-xs font-medium text-emerald-800 hover:bg-emerald-100/50 dark:border-emerald-800 dark:bg-transparent dark:text-emerald-300"
            >
              Clear
            </button>
          </div>
        </div>
      ) : materialType ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-800/40 dark:bg-emerald-950/20">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-xs">
              <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                Finding Compatible Receivers For
              </p>
              <h3 className="font-archivo text-base font-bold text-ink-900 dark:text-white">
                {materialTypeLabel(materialType)} Intake
              </h3>
              <p className="text-xs text-steel-600 dark:text-gray-400">
                Showing verified facilities with active demand or intake capacity for {materialTypeLabel(materialType)}.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setMaterialType("");
              const nextParams = new URLSearchParams(searchParams);
              nextParams.delete("type");
              nextParams.delete("category");
              setSearchParams(nextParams, { replace: true });
            }}
            className="h-9 rounded-lg border border-emerald-200 bg-white px-3 text-xs font-medium text-emerald-800 hover:bg-emerald-100/50 dark:border-emerald-800 dark:bg-transparent dark:text-emerald-300"
          >
            Clear Filter
          </button>
        </div>
      ) : providerMaterials.length > 0 ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-steel-200 bg-white p-3.5 dark:border-steel-800 dark:bg-[#17251d]">
          <span className="text-xs font-semibold text-steel-700 dark:text-gray-300">
            Select a material from your surveyed inventory to find matching receivers:
          </span>
          <select
            value={selectedMaterialId}
            onChange={(e) => handleMaterialChange(e.target.value)}
            className="h-9 rounded-lg border border-steel-300 bg-white px-3 text-xs font-medium text-ink-900 shadow-2xs dark:border-steel-700 dark:bg-[#122319] dark:text-white"
          >
            <option value="">All Inventory Materials ({providerMaterials.length} available)</option>
            {providerMaterials.map((mat) => (
              <option key={mat.id} value={mat.id}>
                {mat.id} · {materialTypeLabel(mat.type)} ({mat.quantityT} t)
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {/* Header */}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-loop-700 dark:text-loop-300">Provider Discovery</p>
          <h2 id="receiver-discovery-title" className="mt-1 font-archivo text-2xl font-bold text-ink-900 dark:text-white">
            {targetedMaterial ? `Receivers for ${materialTypeLabel(targetedMaterial.type)}` : "Receiver Facilities"}
          </h2>
        </div>
        <span className="text-xs text-steel-500 font-medium">
          {evaluatedReceivers.length} compatible {evaluatedReceivers.length === 1 ? "facility" : "facilities"} shown
        </span>
      </div>

      <SearchFilterBar
        searchValue={locationQuery}
        onSearchChange={setLocationQuery}
        searchPlaceholder="Search facility, city or region…"
        searchLabel="Search receivers"
        activeFilterCount={activeFilterCount}
        onClearFilters={() => {
          setMaterialType("");
          setLocationQuery("");
          setMinimumQuantity("");
          setNeededBy("");
          setProjectId("");
          setOrganization("");
          setStatus("");
          handleMaterialChange("");
          setOnlyCompatible(true);
        }}
        resultLabel={`${evaluatedReceivers.length} shown`}
        filters={
          <>
            <label className="text-xs font-medium text-steel-600 dark:text-gray-300">
              Material
              <select
                value={materialType}
                onChange={(event) => setMaterialType(event.target.value)}
                className="mt-1 block h-10 w-full rounded-lg border border-steel-300 bg-white px-3 text-sm dark:border-steel-700 dark:bg-[#17251d] dark:text-white"
              >
                <option value="">Any material</option>
                {materials.map((item) => (
                  <option key={item} value={item}>
                    {materialTypeLabel(item)}
                  </option>
                ))}
                {customTypeOptions.map((item) => (
                  <option key={item} value={item}>
                    {materialTypeLabel(item)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-steel-600 dark:text-gray-300">
              Minimum daily intake (t)
              <input
                type="number"
                min="0"
                value={minimumQuantity}
                onChange={(event) => setMinimumQuantity(event.target.value)}
                className="mt-1 block h-10 w-full rounded-lg border border-steel-300 bg-white px-3 text-sm dark:border-steel-700 dark:bg-[#17251d] dark:text-white"
              />
            </label>
            <label className="text-xs font-medium text-steel-600 dark:text-gray-300">
              Required by
              <input
                type="date"
                value={neededBy}
                onChange={(event) => setNeededBy(event.target.value)}
                className="mt-1 block h-10 w-full rounded-lg border border-steel-300 bg-white px-3 text-sm dark:border-steel-700 dark:bg-[#17251d] dark:text-white"
              />
            </label>
            <label className="text-xs font-medium text-steel-600 dark:text-gray-300">
              Project
              <select
                value={projectId}
                onChange={(event) => setProjectId(event.target.value)}
                className="mt-1 block h-10 w-full rounded-lg border border-steel-300 bg-white px-3 text-sm dark:border-steel-700 dark:bg-[#17251d] dark:text-white"
              >
                <option value="">All projects</option>
                {dataset.projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-steel-600 dark:text-gray-300">
              Organization
              <input
                value={organization}
                onChange={(event) => setOrganization(event.target.value)}
                placeholder="Name"
                className="mt-1 block h-10 w-full rounded-lg border border-steel-300 bg-white px-3 text-sm dark:border-steel-700 dark:bg-[#17251d] dark:text-white"
              />
            </label>
            <label className="text-xs font-medium text-steel-600 dark:text-gray-300">
              Status
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                className="mt-1 block h-10 w-full rounded-lg border border-steel-300 bg-white px-3 text-sm dark:border-steel-700 dark:bg-[#17251d] dark:text-white"
              >
                <option value="">All statuses</option>
                <option value="OPEN">Open</option>
                <option value="PARTIALLY_COVERED">Partially covered</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs font-medium text-steel-700 dark:text-gray-300 sm:col-span-2 mt-2">
              <input
                type="checkbox"
                checked={onlyCompatible}
                onChange={(e) => setOnlyCompatible(e.target.checked)}
                className="size-4 rounded border-steel-300 accent-[#1b432a]"
              />
              <span>Only show verified facilities matching my materials and active demand</span>
            </label>
          </>
        }
      />

      {/* Facilities Cards Grid */}
      {evaluatedReceivers.length ? (
        <ul className="mt-4 grid gap-detail lg:grid-cols-2">
          {evaluatedReceivers.map(({ receiver, demand, matchCandidate, matchScore }) => {
            const relatedProjects = [
              ...new Set(
                dataset.bookings
                  .filter((booking) => booking.receiverId === receiver.id)
                  .map((booking) => dataset.materials.find((item) => item.id === booking.materialId)?.projectId)
                  .filter((id): id is string => Boolean(id))
              ),
            ];

            return (
              <li
                key={receiver.id}
                className="border border-steel-200 bg-white p-5 dark:border-steel-800 dark:bg-[#17251d] rounded-surface shadow-xs transition hover:border-[#9ec1a5]"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-archivo text-lg font-bold text-ink-900 dark:text-white">{receiver.name}</h3>
                      {demand ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                          Active Request
                        </span>
                      ) : matchScore >= 0.7 ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-loop-100 px-2.5 py-0.5 text-xs font-semibold text-loop-800 dark:bg-loop-900/60 dark:text-loop-300">
                          {Math.round(matchScore * 100)}% Match
                        </span>
                      ) : receiver.dailyIntakeT > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700 dark:bg-steel-800 dark:text-steel-300">
                          Open Intake
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm text-steel-600 dark:text-gray-400">
                      {receiver.distanceKnown && receiver.distanceKm ? `${receiver.distanceKm} km · ` : ""}
                      {receiver.location || "Location on request"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1 text-right">
                    {receiver.acceptedTypes.length ? (
                      receiver.acceptedTypes.map((t) => (
                        <span
                          key={t}
                          className="rounded-md border border-steel-200 bg-steel-50 px-2 py-0.5 text-[11px] font-medium text-steel-700 dark:border-steel-700 dark:bg-steel-800/60 dark:text-steel-300"
                        >
                          {materialTypeLabel(t)}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs font-semibold text-steel-500">Open intake</span>
                    )}
                  </div>
                </div>

                {(demand?.geo ?? receiver.geo) && <LocationMap geo={demand?.geo ?? receiver.geo} className="mt-3.5 h-36" />}

                {/* Metrics */}
                <div className="mt-3.5 grid grid-cols-2 gap-3 border-y border-steel-100 py-3 text-xs dark:border-steel-800">
                  {demand ? (
                    <>
                      <span>
                        Material requested
                        <strong className="mt-1 block capitalize text-ink-900 dark:text-white">
                          {materialTypeLabel(demand.materialType)}
                        </strong>
                      </span>
                      <span>
                        Quantity needed
                        <strong className="mt-1 block text-ink-900 dark:text-white">
                          {demand.requiredT.toLocaleString("en-IN")} t
                        </strong>
                      </span>
                      <span>
                        Required date
                        <strong className="mt-1 block text-ink-900 dark:text-white">
                          {formatDate(demand.period)}
                        </strong>
                      </span>
                      <span>
                        Request status
                        <strong className="mt-1 block capitalize text-ink-900 dark:text-white">
                          {demand.status.toLowerCase().replaceAll("_", " ")}
                        </strong>
                      </span>
                    </>
                  ) : (
                    <>
                      <span>
                        Daily intake capacity
                        <strong className="mt-1 block text-ink-900 dark:text-white">
                          {receiver.dailyIntakeT.toLocaleString("en-IN")} t / day
                        </strong>
                      </span>
                      <span>
                        Current yard stock
                        <strong className="mt-1 block text-ink-900 dark:text-white">
                          {receiver.currentStockT.toLocaleString("en-IN")} t
                        </strong>
                      </span>
                      <span>
                        Intake readiness
                        <strong className="mt-1 block text-emerald-700 dark:text-emerald-400">
                          Accepting Deliveries
                        </strong>
                      </span>
                      <span>
                        Linked projects
                        <strong className="mt-1 block text-ink-900 dark:text-white">
                          {relatedProjects
                            .map((id) => dataset.projects.find((project) => project.id === id)?.name ?? id)
                            .join(", ") || "None"}
                        </strong>
                      </span>
                    </>
                  )}
                </div>

                {/* Primary Action Button */}
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {demand ? (
                    <Link
                      onClick={jumpToDemand}
                      to={`/app/market-demand?demand=${encodeURIComponent(demand.id)}`}
                      state={{ from: location.pathname }}
                      className="inline-flex min-h-10 items-center justify-center rounded-xl bg-[#315f3d] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#274d32]"
                    >
                      Offer Material →
                    </Link>
                  ) : targetedMaterial ? (
                    <Link
                      to={`/app/materials?allocate=${encodeURIComponent(targetedMaterial.id)}&receiver=${encodeURIComponent(receiver.id)}`}
                      className="inline-flex min-h-10 items-center justify-center rounded-xl bg-[#164b2d] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#22633e]"
                    >
                      Allocate Surplus Material →
                    </Link>
                  ) : (
                    <Link
                      to={`/app/materials?receiver=${encodeURIComponent(receiver.id)}`}
                      className="inline-flex min-h-10 items-center justify-center rounded-xl bg-[#315f3d] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#274d32]"
                    >
                      Allocate From Inventory →
                    </Link>
                  )}
                </div>

                {/* Match Analysis Accordion */}
                {matchCandidate && (
                  <details className="mt-3.5 border-t border-steel-100 pt-3 dark:border-steel-800">
                    <summary className="cursor-pointer text-xs font-semibold text-loop-700 dark:text-loop-300">
                      View Match Analysis ({Math.round(matchScore * 100)}% compatibility)
                    </summary>
                    <div className="mt-2 text-left">
                      <p className="text-xs text-steel-600 dark:text-gray-300 mb-2">
                        Compatibility evaluation for {targetedMaterial ? targetedMaterial.id : "your material"} against {receiver.name}:
                      </p>
                      <MatchDetailsPanel match={matchCandidate} showProceedAction={false} />
                    </div>
                  </details>
                )}

                {/* Facility Intelligence & Research */}
                <details className="mt-2.5">
                  <summary className="cursor-pointer text-xs font-semibold text-steel-500 hover:text-steel-700 dark:text-steel-400">
                    Facility Intelligence & Research
                  </summary>
                  <div className="mt-2">
                    <FacilityResearch facility={receiver} />
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="mt-6 rounded-2xl border border-dashed border-steel-300 p-10 text-center text-sm text-steel-600 dark:border-steel-700 dark:text-gray-400">
          <p className="font-semibold text-ink-900 dark:text-white text-base">No matching receivers found</p>
          <p className="mt-1 text-xs text-steel-500 max-w-md mx-auto">
            No facilities currently have active demand or certified capacity matching {targetedMaterial ? materialTypeLabel(targetedMaterial.type) : "the selected filters"}.
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <button
              type="button"
              onClick={() => {
                handleMaterialChange("");
                setOnlyCompatible(false);
              }}
              className="rounded-lg bg-steel-100 px-3.5 py-2 text-xs font-semibold text-steel-700 hover:bg-steel-200 dark:bg-steel-800 dark:text-gray-200"
            >
              Browse all directory facilities
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

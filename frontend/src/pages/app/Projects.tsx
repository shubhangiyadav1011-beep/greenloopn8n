import PageMeta from "@/components/common/PageMeta";
import { EmptyState, ProjectStatusChip } from "@/components/greenloop/AppExploration";
import { currentStepIndex, materialMedia, projectNextAction, projectSteps, STEP_LABELS } from "@/components/greenloop/AppExploration.helpers";
import { ambientMedia, projectMediaFor } from "@/config/appMedia";
import type { Project, ProjectStatus } from "@shared/domain/types";
import { useGreenLoopStore } from "@/store/GreenLoopStore.helpers";
import { useMemo, useState } from "react";
import { Link } from "react-router";

type ProjectFilter = "all" | ProjectStatus;

const filters: { id: ProjectFilter; label: string }[] = [
  { id: "all", label: "All Projects" },
  { id: "active", label: "Active" },
  { id: "demolition", label: "Demolition" },
  { id: "complete", label: "Completed" },
];

const materialLabels: Record<string, string> = {
  concrete: "Concrete",
  brick: "Brick",
  steel: "Steel",
  timber: "Timber",
  plasterboard: "Plasterboard",
  glass: "Glass",
};

function MetricIcon({ kind }: { kind: "projects" | "material" | "loads" | "complete" }) {
  const paths = {
    projects: <><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><path d="M8 4.5V3m8 1.5V3M7.5 9h9m-9 4h5" /></>,
    material: <><path d="m4 7 8-4 8 4-8 4-8-4Z" /><path d="M4 7v10l8 4 8-4V7M12 11v10" /></>,
    loads: <><path d="M3 6h11v11H3zM14 10h4l3 3v4h-7z" /><circle cx="7.5" cy="18" r="1.5" /><circle cx="17.5" cy="18" r="1.5" /></>,
    complete: <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.5 2.5L16.5 9" /></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="size-5">{paths[kind]}</svg>;
}

export default function Projects() {
  const { dataset } = useGreenLoopStore();
  const [filter, setFilter] = useState<ProjectFilter>("all");
  const [query, setQuery] = useState("");

  const rows = useMemo(() => dataset.projects.map((project: Project) => {
    const materials = dataset.materials.filter((material) => material.projectId === project.id);
    const materialIds = new Set(materials.map((material) => material.id));
    const surveyedT = materials.reduce((total, material) => total + material.quantityT, 0);
    const verifiedT = dataset.verifications
      .filter((verification) => materialIds.has(verification.materialId))
      .reduce((total, verification) => total + verification.acceptedT, 0);
    const steps = projectSteps(dataset, project.id);
    const stageIndex = currentStepIndex(steps);
    const complete = project.status === "complete";
    const next = complete
      ? { label: "View project report", to: "/app/dashboard", reason: "Project marked complete." }
      : projectNextAction(dataset, project.id);
    const materialTypes = [...new Set(materials.map((material) => material.type))];

    return {
      project,
      materials,
      surveyedT,
      verifiedT,
      recoveryRate: surveyedT > 0 ? Math.round((verifiedT / surveyedT) * 100) : 0,
      stageLabel: complete ? "Complete" : STEP_LABELS[stageIndex] ?? "Complete",
      progress: Math.min(100, Math.round((stageIndex / STEP_LABELS.length) * 100)),
      complete,
      next,
      materialTypes,
      media: materials.flatMap(materialMedia),
    };
  }), [dataset]);

  const visibleRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return rows.filter(({ project }) => {
      const matchesFilter = filter === "all" || project.status === filter;
      const matchesQuery = !normalizedQuery || [project.name, project.location, project.id]
        .some((value) => value.toLowerCase().includes(normalizedQuery));
      return matchesFilter && matchesQuery;
    });
  }, [filter, query, rows]);

  const activeProjects = dataset.projects.filter((project) => project.status !== "complete").length;
  const surveyedTotal = rows.reduce((total, row) => total + row.surveyedT, 0);
  const dispatchedBookingIds = new Set(dataset.events
    .filter((event) => event.kind === "load.dispatched")
    .flatMap((event) => event.subjectIds));
  const loadsScheduled = dataset.bookings.filter((booking) => {
    if (booking.status !== "confirmed" || dispatchedBookingIds.has(booking.id)) return false;
    const material = dataset.materials.find((item) => item.id === booking.materialId);
    return Boolean(material && dataset.projects.some((project) => project.id === material.projectId));
  }).length;
  const completedProjects = dataset.projects.filter((project) => project.status === "complete").length;

  const metrics = [
    { label: "Active Projects", value: activeProjects.toLocaleString(), note: "In progress", kind: "projects" as const },
    { label: "Material Surveyed", value: `${surveyedTotal.toFixed(1)} t`, note: "Across all projects", kind: "material" as const },
    { label: "Loads Scheduled", value: loadsScheduled.toLocaleString(), note: "Awaiting dispatch", kind: "loads" as const },
    { label: "Projects Completed", value: completedProjects.toLocaleString(), note: "Recovery complete", kind: "complete" as const },
  ];

  return (
    <div className="mx-auto max-w-app pb-16">
      <PageMeta
        title="Recovery Projects | GreenLoop"
        description="Monitor active demolition and construction projects, track material recovery progress, and coordinate logistics."
      />

      <section className="mb-section grid overflow-hidden border border-[#e5e1d8] bg-[#f7f5ef] dark:border-steel-800 dark:bg-[#1b2921] md:min-h-[230px] md:gl-golden-columns rounded-surface">
        <div className="flex flex-col justify-center px-6 py-7 sm:px-9 md:py-9">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#65806e] dark:text-[#a5bba9]">GreenLoop Operations</p>
          <h1 className="mt-2 font-archivo font-bold tracking-tight text-[#1d2c23] dark:text-white gl-page-title">Recovery Projects</h1>
          <div className="mt-5 flex items-center gap-2 text-xs font-medium text-[#486b53] dark:text-[#b4d0bc]">
            <span className="size-2 rounded-full bg-[#568365]" />
            {activeProjects} active {activeProjects === 1 ? "project" : "projects"} in your recovery pipeline
          </div>
        </div>
        <div className="relative min-h-44 overflow-hidden md:min-h-[230px]">
          <img src={ambientMedia.surveyHero.src} alt={ambientMedia.surveyHero.alt} className="absolute inset-0 size-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#f7f5ef] via-[#f7f5ef]/35 to-transparent md:from-[#f7f5ef]/25 md:via-transparent md:to-transparent dark:from-[#1b2921]/40" />
          <div className="absolute bottom-4 right-4 border border-white/25 bg-[#172c21]/75 px-3 py-2 text-xs font-medium uppercase tracking-[0.12em] text-white backdrop-blur-sm rounded-surface">
            Recovery in progress
          </div>
        </div>
      </section>

      <section aria-label="Project summary" className="mb-section grid grid-cols-2 gap-detail lg:grid-cols-4">
        {metrics.map((metric) => (
          <div key={metric.label} className="flex min-h-[112px] items-start gap-3 border border-[#e7e3da] bg-white shadow-[0_2px_10px_rgba(26,42,31,0.035)] dark:border-steel-800 dark:bg-[#17251d] gl-card-pad rounded-surface">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#edf3ed] text-[#487454] dark:bg-[#284233] dark:text-[#b6d1bd]"><MetricIcon kind={metric.kind} /></span>
            <div className="min-w-0">
              <p className="font-archivo text-xl font-bold leading-6 text-[#1d2c23] dark:text-white sm:text-2xl">{metric.value}</p>
              <p className="mt-1 text-xs font-semibold text-[#38483e] dark:text-gray-200 sm:text-sm">{metric.label}</p>
              <p className="mt-0.5 text-xs text-[#828b83] dark:text-gray-400 sm:text-xs">{metric.note}</p>
            </div>
          </div>
        ))}
      </section>

      <section aria-label="Project list">
        <div className="mb-4 flex flex-col gap-4 border-b border-[#e5e1d8] pb-4 dark:border-steel-800 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="font-archivo text-2xl font-bold tracking-tight text-[#1d2c23] dark:text-white">Your Projects</h2>
            <p className="mt-1 text-sm text-[#778078] dark:text-gray-400">{visibleRows.length} of {rows.length} projects</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="relative block sm:w-64">
              <span className="sr-only">Search projects</span>
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#818a82]"><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.2 4.2" /></svg>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search projects…"
                className="h-10 w-full rounded-lg border border-[#e1ded6] bg-white pl-9 pr-3 text-sm text-[#26362c] outline-none transition focus:border-[#64866d] focus:ring-2 focus:ring-[#64866d]/15 dark:border-steel-700 dark:bg-[#17251d] dark:text-white"
              />
            </label>
            <div role="group" aria-label="Filter projects" className="flex max-w-full gap-1 overflow-x-auto border border-[#e5e1d8] bg-[#f6f4ee] p-1 dark:border-steel-800 dark:bg-[#17251d] rounded-surface">
              {filters.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={filter === item.id}
                  onClick={() => setFilter(item.id)}
                  className={`shrink-0 rounded-md px-3 py-2 text-xs font-semibold transition-colors ${filter === item.id ? "bg-white text-[#315c3d] shadow-sm dark:bg-[#314b39] dark:text-white" : "text-[#758078] hover:text-[#315c3d] dark:text-gray-400 dark:hover:text-white"}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-card">
          {visibleRows.map((row) => {
            const projectImage = row.media[0] ?? projectMediaFor(row.project);
            return (
              <article key={row.project.id} className="group grid overflow-hidden border border-[#e6e2d9] bg-white shadow-[0_2px_12px_rgba(26,42,31,0.035)] transition hover:border-[#b9c8ba] hover:shadow-[0_6px_20px_rgba(26,42,31,0.07)] dark:border-steel-800 dark:bg-[#17251d] dark:hover:border-[#506957] xl:grid-cols-[210px_minmax(0,1fr)_236px] rounded-surface">
                <div className="relative min-h-44 overflow-hidden lg:min-h-[220px]">
                  <img src={projectImage.src} alt={row.media[0]?.caption ?? row.project.name} loading="lazy" className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-[1.035]" />
                  <span className="absolute left-3 top-3 border border-white/40 bg-[#182b20]/75 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-white backdrop-blur-sm rounded-surface">{row.project.id}</span>
                </div>

                <div className="flex min-w-0 flex-col gl-card-pad">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h3 className="font-archivo text-xl font-bold tracking-tight text-[#203027] dark:text-white sm:text-2xl">{row.project.name}</h3>
                    <ProjectStatusChip status={row.project.status} />
                  </div>
                  <p className="mt-1.5 text-sm text-[#778078] dark:text-gray-400">{row.project.location}</p>
                  {row.materialTypes.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Surveyed materials">
                      {row.materialTypes.map((type) => (
                        <span key={type} className="rounded-md bg-[#f2f3ed] px-2 py-1 text-xs font-medium text-[#617065] dark:bg-white/[0.06] dark:text-gray-300">{materialLabels[type] ?? type}</span>
                      ))}
                    </div>
                  )}

                  <div className="mt-auto grid grid-cols-2 gap-x-4 gap-y-4 pt-5 sm:grid-cols-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#899189]">Volume</p>
                      <p className="mt-1 font-archivo text-lg font-bold text-[#26372c] dark:text-white">{row.surveyedT.toFixed(1)} t</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#899189]">Current Stage</p>
                      <p className="mt-1 truncate text-sm font-semibold text-[#35473a] dark:text-gray-200">{row.stageLabel}</p>
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#899189]">Progress</p>
                        <span className="text-xs font-semibold text-[#426b4c] dark:text-[#b2ceb9]">{row.progress}%</span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#e9ece6] dark:bg-white/10">
                        <div className="h-full rounded-full bg-[#5c8967] transition-all" style={{ width: `${row.progress}%` }} />
                      </div>
                      {row.verifiedT > 0 && <p className="mt-1 text-xs text-[#899189]">{row.verifiedT.toFixed(1)} t recovered</p>}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col justify-between gap-4 border-t border-[#eeeae2] bg-[#f8f7f2] p-5 dark:border-steel-800 dark:bg-[#1c2b22] sm:flex-row sm:items-center xl:flex-col xl:items-stretch xl:border-l xl:border-t-0 xl:p-5">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#8a938b]">Next Action</p>
                    <p className="mt-1.5 font-archivo text-base font-bold text-[#2c3e31] dark:text-white">{row.next.label}</p>
                    <p className="mt-1 text-xs leading-5 text-[#7a837b] dark:text-gray-400">{row.next.reason}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 sm:shrink-0 xl:flex-col xl:items-stretch">
                    <Link to={`/app/projects/${row.project.id}`} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#315c3d] px-4 text-sm font-semibold text-white transition hover:bg-[#254a30] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#315c3d] focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#1c2b22]">
                      Open Project <span aria-hidden="true">→</span>
                    </Link>
                    <Link to={row.next.to} state={{ projectId: row.project.id }} className="inline-flex min-h-9 items-center justify-center rounded-lg px-3 text-xs font-semibold text-[#496b51] transition hover:bg-[#e9eee7] dark:text-[#b8d0bd] dark:hover:bg-white/[0.06]">
                      Take next step <span aria-hidden="true" className="ml-1">↗</span>
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        {rows.length === 0 && (
          <EmptyState
            title="No active projects"
            body="You haven't added any recovery projects yet. Start by adding material from a project."
            action={{ label: "Add Material", to: "/app/materials/new" }}
          />
        )}
        {rows.length > 0 && visibleRows.length === 0 && (
          <div className="border border-dashed border-[#d8ddd5] bg-white/60 px-6 py-12 text-center dark:border-steel-700 dark:bg-white/[0.02] rounded-surface">
            <h3 className="font-archivo text-lg font-bold text-[#2c3e31] dark:text-white">No matching projects</h3>
            <p className="mt-1 text-sm text-[#7a837b] dark:text-gray-400">Try another name, location, or project status.</p>
            <button type="button" onClick={() => { setQuery(""); setFilter("all"); }} className="mt-4 text-sm font-semibold text-[#416d4b] underline underline-offset-4 dark:text-[#b8d0bd]">Clear search and filters</button>
          </div>
        )}
      </section>
    </div>
  );
}

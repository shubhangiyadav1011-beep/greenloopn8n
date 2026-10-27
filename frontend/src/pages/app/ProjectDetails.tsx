import PageMeta from "@/components/common/PageMeta";
import { LocationMap } from "@/components/greenloop/LocationMap";
import { useGreenLoopStore } from "@/store/GreenLoopStore.helpers";
import { formatDate, formatINRPerT } from "@/utils";
import { Link, useParams } from "react-router";

const stages = ["Offered", "Requested", "Accepted", "Delivered", "Completed"] as const;

export default function ProjectDetails() {
  const { id } = useParams<{ id: string }>();
  const { dataset } = useGreenLoopStore();
  const project = dataset.projects.find((item) => item.id === id);

  if (!project) {
    return (
      <main className="mx-auto max-w-4xl py-16 text-center">
        <PageMeta title="Project not found | GreenLoop" description="The requested recovery project could not be found." />
        <h1 className="font-archivo text-2xl font-bold text-ink-900 dark:text-white">Project not found</h1>
        <Link to="/app/projects" className="mt-4 inline-flex text-sm font-semibold text-loop-600 underline dark:text-loop-400">Back to Projects</Link>
      </main>
    );
  }

  const materials = dataset.materials.filter((material) => material.projectId === project.id);
  const materialIds = new Set(materials.map((material) => material.id));
  const offers = (dataset.offers ?? []).filter((offer) => materialIds.has(offer.passportId));
  const bookings = dataset.bookings.filter((booking) => materialIds.has(booking.materialId));
  const bookingIds = new Set(bookings.map((booking) => booking.id));
  const verifications = dataset.verifications.filter((record) => bookingIds.has(record.bookingId));
  const dispatched = new Set(dataset.events.filter((event) => event.kind === "load.dispatched").flatMap((event) => event.subjectIds));
  const progress = [
    offers.length > 0,
    bookings.some((booking) => booking.status !== "cancelled"),
    bookings.some((booking) => booking.status === "confirmed" && Boolean(booking.receiverAcceptedAt)),
    bookings.some((booking) => dispatched.has(booking.id)) || verifications.length > 0,
    verifications.some((record) => record.status === "verified"),
  ];
  const relatedIds = new Set([
    project.id,
    ...materialIds,
    ...dataset.allocations.filter((allocation) => materialIds.has(allocation.materialId)).map((allocation) => allocation.id),
    ...bookingIds,
    ...offers.map((offer) => offer.id),
    ...dataset.demands.filter((demand) => dataset.bookings.some((booking) => booking.demandId === demand.id && materialIds.has(booking.materialId))).map((demand) => demand.id),
  ]);
  const events = dataset.events.filter((event) => event.subjectIds.some((subjectId) => relatedIds.has(subjectId))).sort((a, b) => b.at.localeCompare(a.at));
  const totalT = materials.reduce((total, material) => total + material.quantityT, 0);
  const acceptedT = verifications.filter((record) => record.status === "verified").reduce((total, record) => total + record.acceptedT, 0);

  return (
    <main className="mx-auto max-w-[1200px] pb-16">
      <PageMeta title={`${project.name} | GreenLoop`} description={`Live recovery progress and activity for ${project.name}.`} />
      <Link to="/app/projects" className="mb-5 inline-flex text-sm font-semibold text-steel-600 hover:text-ink-900 dark:text-gray-300 dark:hover:text-white">← Projects</Link>
      <header className="mb-section border-b border-steel-200 pb-6 dark:border-steel-800">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-loop-700 dark:text-loop-300">Project {project.id}</p>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-archivo font-bold tracking-tight text-ink-900 dark:text-white gl-page-title">{project.name}</h1>
            <p className="mt-2 text-sm text-steel-600 dark:text-gray-400">{project.location}</p>
          </div>
          <Link to={`/app/materials/new?project=${encodeURIComponent(project.id)}`} className="inline-flex min-h-11 items-center bg-loop-700 px-5 text-sm font-semibold text-white hover:bg-loop-800">Add Material</Link>
        </div>
      </header>

      <section aria-label="Recovery progress" className="mb-section border border-steel-200 bg-white dark:border-steel-800 dark:bg-white/[0.02] gl-card-pad rounded-surface">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-archivo text-xl font-bold text-ink-900 dark:text-white">Recovery progress</h2>
          <span className="text-xs font-semibold uppercase tracking-wide text-steel-500">{progress.filter(Boolean).length} of {stages.length} stages</span>
        </div>
        <ol className="mt-5 grid gap-detail sm:grid-cols-5">
          {stages.map((stage, index) => (
            <li key={stage} className={`border-s-2 ps-3 py-1 ${progress[index] ? "border-loop-600" : "border-steel-200 dark:border-steel-700"}`}>
              <p className={`text-xs font-semibold uppercase tracking-wide ${progress[index] ? "text-loop-700 dark:text-loop-300" : "text-steel-500"}`}>{stage}</p>
              <p className="mt-1 text-sm font-medium text-ink-900 dark:text-white">{progress[index] ? "Recorded" : "Awaiting activity"}</p>
            </li>
          ))}
        </ol>
      </section>

      <div className="grid gap-card lg:gl-golden-columns">
        <section className="border border-steel-200 bg-white dark:border-steel-800 dark:bg-white/[0.02] gl-card-pad rounded-surface">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-archivo text-xl font-bold text-ink-900 dark:text-white">Project inventory</h2>
            <Link to={`/app/materials?project=${encodeURIComponent(project.id)}`} className="text-sm font-semibold text-loop-700 underline dark:text-loop-300">Open inventory</Link>
          </div>
          {materials.length ? <ul className="mt-4 divide-y divide-steel-100 dark:divide-steel-800">
            {materials.map((material) => <li key={material.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div><Link to={`/app/materials/${material.id}`} className="font-semibold capitalize text-ink-900 underline dark:text-white">{material.type} · {material.id}</Link><p className="mt-1 text-xs text-steel-500">{material.condition} condition · {material.status}</p></div>
              <div className="text-end"><p className="font-archivo text-lg font-bold text-ink-900 dark:text-white">{material.quantityT.toLocaleString("en-IN")} t</p>{material.pricePerT !== undefined && <p className="text-xs text-steel-500">{formatINRPerT(material.pricePerT)}</p>}</div>
            </li>)}
          </ul> : <p className="mt-4 text-sm text-steel-500">No materials have been added to this project.</p>}
          <div className="mt-5 grid grid-cols-2 gap-detail border-t border-steel-100 pt-4 dark:border-steel-800">
            <div><p className="text-xs uppercase tracking-wide text-steel-500">Surveyed</p><p className="mt-1 font-archivo text-xl font-bold text-ink-900 dark:text-white">{totalT.toLocaleString("en-IN")} t</p></div>
            <div><p className="text-xs uppercase tracking-wide text-steel-500">Recovered</p><p className="mt-1 font-archivo text-xl font-bold text-ink-900 dark:text-white">{acceptedT.toLocaleString("en-IN")} t</p></div>
          </div>
        </section>

        <section className="border border-steel-200 bg-white dark:border-steel-800 dark:bg-white/[0.02] gl-card-pad rounded-surface">
          <h2 className="font-archivo text-xl font-bold text-ink-900 dark:text-white">Location & activity</h2>
          <p className="mt-3 rounded-md bg-steel-50 p-3 text-sm text-ink-900 dark:bg-white/[0.04] dark:text-gray-200">{project.location}</p>
          {project.geo && <LocationMap geo={project.geo} className="mt-3 h-52" />}
          <ol className="mt-4 space-y-4">
            {events.length ? events.slice(0, 12).map((event) => <li key={event.id} className="border-s-2 border-loop-500 ps-3">
              <p className="text-sm font-semibold text-ink-900 dark:text-white">{event.summary}</p>
              {event.detail && <p className="mt-1 text-xs text-steel-500">{event.detail}</p>}
              <p className="mt-1 text-xs text-steel-500">{formatDate(event.at)} · {event.actor.name}</p>
            </li>) : <li className="text-sm text-steel-500">Project activity will appear here as records are updated.</li>}
          </ol>
        </section>
      </div>

    </main>
  );
}

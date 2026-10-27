/**
 * App media configuration — the authenticated product's visual vocabulary.
 *
 * Every page resolves imagery through this file so photography stays
 * coherent (industrial construction/recovery subjects, one grade) and
 * footage is reused deliberately. Adding or swapping media is a one-file
 * change; pages never hardcode image paths.
 */

import type { MaterialTypeKey, Project } from "@shared/domain/types";

export interface AppMedia {
  src: string;
  alt: string;
}

/* ------------------------------------------------------------------ */
/* Material type imagery — distinct subject per type                   */
/* ------------------------------------------------------------------ */

export const materialTypeMedia: Record<MaterialTypeKey, AppMedia> = {
  concrete: {
    src: "/images/site/concrete-pile.jpg",
    alt: "Crushed concrete rubble stockpiled as reusable aggregate",
  },
  brick: {
    src: "/images/site/brick-stack.jpg",
    alt: "Reclaimed bricks stacked at a recovery yard",
  },
  timber: {
    src: "/images/site/timber-stack.jpg",
    alt: "Salvaged timber stacked for reuse",
  },
  steel: {
    src: "/images/site/steel-beams.jpg",
    alt: "Structural steel beams during recovery works",
  },
  plasterboard: {
    src: "/images/site/plasterboard-stack.jpg",
    alt: "Plasterboard sheets stacked on site",
  },
  glass: {
    src: "/images/site/glass-cullet.jpg",
    alt: "Processed glass cullet at a reprocessing plant",
  },
};

/** Fallback when a type key is unknown (user-created materials). */
export function materialMediaFor(type: string): AppMedia {
  return (
    materialTypeMedia[type as MaterialTypeKey] ?? {
      src: "/images/site/pallets-2.jpg",
      alt: "Recovered material palletised for reuse",
    }
  );
}

/* ------------------------------------------------------------------ */
/* Project imagery — per known project, with generic fallbacks         */
/* ------------------------------------------------------------------ */

const projectMediaById: Record<string, AppMedia> = {
  "PR-01": {
    src: "/images/site/demolition-site-a.jpg",
    alt: "Harrow Road Demolition — high-reach excavator working the site",
  },
  "PR-02": {
    src: "/images/site/strip-out-b.jpg",
    alt: "Kings Cross Strip-out — interior strip-out works",
  },
};

const projectMediaFallbacks: AppMedia[] = [
  { src: "/images/site/hero-demolition.jpg", alt: "Demolition site under recovery" },
  { src: "/images/site/demolition-site-a.jpg", alt: "Demolition site with machinery" },
  { src: "/images/site/strip-out-b.jpg", alt: "Interior strip-out works" },
];

export function projectMediaFor(project: Pick<Project, "id" | "name">): AppMedia {
  const known = projectMediaById[project.id];
  if (known) return known;
  // Deterministic fallback per project id so cards never collapse to one image.
  const sum = [...project.id].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return projectMediaFallbacks[sum % projectMediaFallbacks.length];
}

/* ------------------------------------------------------------------ */
/* Receiver imagery                                                    */
/* ------------------------------------------------------------------ */

const receiverMediaById: Record<string, AppMedia> = {
  "R-001": {
    src: "/images/site/receiver-yard-a.jpg",
    alt: "Riverstone Aggregates — receiving yard and stockpiles",
  },
  "R-002": {
    src: "/images/site/receiver-yard-b.jpg",
    alt: "Receiving facility with material bays",
  },
};

export function receiverMediaFor(receiverId: string): AppMedia {
  return (
    receiverMediaById[receiverId] ?? {
      src: "/images/site/yard-wide.jpg",
      alt: "Materials recovery yard — bays and stockpiles",
    }
  );
}

/* ------------------------------------------------------------------ */
/* Ambient / thematic media                                            */
/* ------------------------------------------------------------------ */

export const ambientMedia = {
  surveyHero: {
    src: "/images/site/hero-demolition.jpg",
    alt: "Excavator recovering material on an active demolition site",
  },
  sortingFacility: {
    src: "/images/site/sorting-facility.jpg",
    alt: "Material sorting facility with stockpiled bays",
  },
  brickPallets: {
    src: "/images/site/brick-pallets.jpg",
    alt: "Recovered material pallets sorted for placement",
  },
  yardWide: {
    src: "/images/site/yard-wide.jpg",
    alt: "Wide view of a materials recovery yard",
  },
  authConcrete: {
    src: "/images/site/auth-concrete.jpg",
    alt: "Recovered concrete stockpiles at a materials yard",
  },
  authTruck: {
    src: "/images/site/auth-truck.jpg",
    alt: "Haulage truck loaded with recovered material",
  },
  authYard: {
    src: "/images/site/auth-yard.jpg",
    alt: "Receiving yard with space allocated for arrivals",
  },
  weighbridge: {
    src: "/images/site/weighbridge.jpg",
    alt: "Lorry crossing the weighbridge at a materials intake gate",
  },
  inspectionWorker: {
    src: "/images/site/inspection-worker.jpg",
    alt: "Site inspector checking recovered material quality",
  },
  pallets: {
    src: "/images/site/pallets-2.jpg",
    alt: "Reclaimed bricks palletised for placement",
  },
  siteCabins: {
    src: "/images/site/office-yard.jpg",
    alt: "Site cabins on an active construction project",
  },
  weighbridgeTicket: {
    src: "/images/site/weighbridge-ticket.svg",
    alt: "Certified weighbridge intake ticket",
  },
} satisfies Record<string, AppMedia>;

/* ------------------------------------------------------------------ */
/* Ambient video — the four small clips (41 MB hero stays site-only)   */
/* ------------------------------------------------------------------ */

export interface AppVideo {
  src: string;
  poster: string;
  alt: string;
}

export const ambientVideo = {
  receiverDemand: {
    src: "/videos/verification-yard.mp4",
    poster: "/images/site/auth-yard.jpg",
    alt: "Truck arriving at a receiving yard for material acceptance",
  },
  activeDemand: {
    src: "/videos/material-loading.mp4",
    poster: "/images/site/brick-pallets.jpg",
    alt: "Machinery loading recovered material for transport",
  },
  inventory: {
    src: "/videos/concrete-excavation.mp4",
    poster: "/images/site/concrete-pile.jpg",
    alt: "Excavator working with recovered concrete on site",
  },
  /** Provider auth / matching contexts — urban demolition in progress. */
  demolition: {
    src: "/videos/demolition-urban.mp4",
    poster: "/images/site/hero-demolition.jpg",
    alt: "Building demolition underway in an urban area",
  },
  /** Material handling contexts — machinery loading recovered material. */
  materialHandling: {
    src: "/videos/material-loading.mp4",
    poster: "/images/site/brick-pallets.jpg",
    alt: "Machinery loading recovered material for transport",
  },
  /** Logistics contexts — truck being loaded ahead of dispatch. */
  dispatch: {
    src: "/videos/truck-dispatch.mp4",
    poster: "/images/site/auth-truck.jpg",
    alt: "Dump truck being loaded ahead of a booked dispatch",
  },
  /** Receiver contexts — arrival and acceptance at the receiving yard. */
  receiving: {
    src: "/videos/verification-yard.mp4",
    poster: "/images/site/auth-yard.jpg",
    alt: "Truck arriving at the receiving yard for verification",
  },
} satisfies Record<string, AppVideo>;

/* ------------------------------------------------------------------ */
/* Onboarding media                                                    */
/* ------------------------------------------------------------------ */

export const onboardingMedia = {
  provider: {
    image: ambientMedia.surveyHero,
    video: ambientVideo.demolition,
  },
  receiver: {
    image: ambientMedia.sortingFacility,
    video: ambientVideo.receiving,
  },
  both: {
    image: ambientMedia.yardWide,
    video: ambientVideo.materialHandling,
  },
  sampleData: ambientVideo.materialHandling,
  ownData: ambientMedia.sortingFacility,
} as const;

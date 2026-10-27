import type { GreenLoopDataset } from "./types.ts";

/** Accepted transactions remain active orders while the receiver plans intake. */
export function acceptedOffersAwaitingBooking(dataset: GreenLoopDataset) {
  return (dataset.offers ?? []).filter(offer =>
    offer.status === "accepted" && !offer.archivedAt &&
    dataset.demands.some(demand => demand.id === offer.demandId && !demand.archivedAt && demand.status !== "CANCELLED") &&
    !dataset.bookings.some(booking => booking.offerId === offer.id ||
      (!booking.offerId && booking.demandId === offer.demandId && booking.materialId === offer.passportId))
  );
}

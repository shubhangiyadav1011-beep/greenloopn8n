import type { GreenLoopDataset } from "./types.ts";
import { slotLedger } from "./capacity.ts";

export function recoveryFlowTotals(dataset: GreenLoopDataset): Record<string, number> {
  const allocatedIds = new Set(dataset.allocations.filter(a => a.status !== "cancelled").map(a => a.materialId));
  const dispatchedIds = new Set(dataset.events.filter(e => e.kind === "load.dispatched").flatMap(e => e.subjectIds));
  return {
    surveyed: dataset.materials.reduce((sum, m) => sum + m.quantityT, 0),
    matched: dataset.materials.filter(m => allocatedIds.has(m.id)).reduce((sum, m) => sum + m.quantityT, 0),
    reserved: dataset.bookings.filter(b => b.status === "confirmed").reduce((sum, b) => sum + b.tonnesT, 0),
    dispatched: dataset.bookings.filter(b => dispatchedIds.has(b.id)).reduce((sum, b) => sum + b.tonnesT, 0),
    verified: dataset.verifications.filter(v => v.status === "verified").reduce((sum, v) => sum + v.acceptedT, 0),
  };
}

export function receiverCapacityTotals(dataset: GreenLoopDataset) {
  return dataset.receivers.map(receiver => {
    const slots = dataset.slots.filter(slot => slot.receiverId === receiver.id);
    const capacity = slots.reduce((sum, slot) => sum + slot.capacityT, 0);
    const reserved = slots.reduce((sum, slot) => sum + (slotLedger(dataset, slot.id)?.reserved ?? 0), 0);
    return { name: receiver.name, capacity, reserved, available: Math.max(0, capacity - reserved) };
  });
}

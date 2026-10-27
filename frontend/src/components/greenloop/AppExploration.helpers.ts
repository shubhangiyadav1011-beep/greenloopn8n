import { STORY } from "@/domain/demoData";
import type {
BookingStatus,
GreenLoopDataset,
MaterialPassport
} from "@shared/domain/types";
import { useState } from "react";

export interface ProjectSteps {
  survey: boolean;
  match: boolean;
  reserve: boolean;
  deliver: boolean;
  verify: boolean;
}

export function projectSteps(dataset: GreenLoopDataset, projectId: string): ProjectSteps {
  const materials = dataset.materials.filter((m) => m.projectId === projectId);
  const materialIds = new Set(materials.map((m) => m.id));
  const allocations = dataset.allocations.filter((a) => materialIds.has(a.materialId));
  const bookingIds = new Set(allocations.map((a) => a.id));
  const bookings = dataset.bookings.filter((b) => bookingIds.has(b.allocationId));

  const survey = materials.length > 0;
  const match = allocations.length > 0;
  const reserve = bookings.some((b) => b.status === "confirmed" || b.status === "cancelled");
  // Dispatch/verify live on the event trail and verification records, not on
  // BookingStatus — a booking stays "confirmed" while its load is on the road.
  const dispatchedBookings = bookings.filter((b) =>
    dataset.events.some((e) => e.kind === "load.dispatched" && e.subjectIds.includes(b.id)),
  );
  const deliver = dispatchedBookings.length > 0;
  const verify = dataset.verifications.some((v) => v.status !== "pending" && dispatchedBookings.some((b) => b.id === v.bookingId));

  return { survey, match, reserve, deliver, verify };
}

export function currentStepIndex(steps: ProjectSteps): number {
  if (!steps.survey) return 0;
  if (!steps.match) return 1;
  if (!steps.reserve) return 2;
  if (!steps.deliver) return 3;
  if (!steps.verify) return 4;
  return 5; // complete
}

export const STEP_LABELS = ["Add Material", "Find receiver", "Request slot", "Send load", "Proof of Recovery"] as const;

export const STORY_PROJECT_ID = STORY.projectAId;

export type AppRole = "site" | "receiver" | "admin";

export const ROLE_STORAGE_KEY = "greenloop.role";

export function loadRole(): AppRole {
  try {
    const stored = localStorage.getItem(ROLE_STORAGE_KEY);
    if (stored === "site" || stored === "receiver" || stored === "admin") return stored;
  } catch {
    /* SSR / private mode — fall through */
  }
  return "site";
}

export function useAppRole(): [AppRole, (role: AppRole) => void] {
  const [role, setRole] = useState<AppRole>(loadRole);
  const change = (next: AppRole) => {
    setRole(next);
    try {
      localStorage.setItem(ROLE_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  };
  return [role, change];
}

export interface NextAction {
  label: string;
  to: string;
  reason: string;
}

export function projectNextAction(dataset: GreenLoopDataset, projectId: string): NextAction {
  const steps = projectSteps(dataset, projectId);
  const current = currentStepIndex(steps);
  const projectName = dataset.projects.find((p) => p.id === projectId)?.name ?? "Project";
  switch (current) {
    case 0:
      return { label: "Add Material", to: "/app/materials/new", reason: `${projectName} has no material records yet.` };
    case 1:
      return { label: "Find a receiver", to: "/app/market-demand?view=receivers", reason: "Materials are surveyed — match them to a facility." };
    case 2: {
      const held = dataset.bookings.find(
        (b) => b.status === "hold" && dataset.allocations.some((a) => a.id === b.allocationId && materialInProject(dataset, a.materialId, projectId)),
      );
      if (held) {
        return { label: "Review booking", to: "/app/bookings", reason: held.holdReason ?? "Waiting on Capacity — check another available slot." };
      }
      return { label: "Request slot", to: "/app/bookings", reason: "A receiver is matched — request an intake slot." };
    }
    case 3:
      return { label: "Send load", to: "/app/deliveries", reason: "The receiver approved the slot — get the material on the road." };
    case 4:
      return { label: "View Proof of Recovery", to: "/app/verification", reason: "The receiver has checked the load and recorded what arrived." };
    default:
      return { label: "View project report", to: "/app/dashboard", reason: "Every stage is complete — review the outcomes." };
  }
}

export function materialInProject(dataset: GreenLoopDataset, materialId: string, projectId: string): boolean {
  return dataset.materials.some((m) => m.id === materialId && m.projectId === projectId);
}

export function materialIdsInProject(dataset: GreenLoopDataset, projectId: string): Set<string> {
  return new Set(dataset.materials.filter((m) => m.projectId === projectId).map((m) => m.id));
}

export interface ReceiverOption {
  receiverId: string;
  name: string;
  location: string;
  distanceKm: number;
  acceptsMaterial: boolean;
  slotAvailableT: number;
  slotCapacityT: number;
  slotDate: string;
  recommended: boolean;
  reasons: string[];
}

export interface MaterialMediaItem {
  id: string;
  kind: "photo" | "video";
  src: string;
  caption: string;
  recordedAt: string;
}

export function materialMedia(material: MaterialPassport): MaterialMediaItem[] {
  return material.evidence
    .filter((e) => e.kind === "site-photo" && e.ref && (e.ref.startsWith("/") || e.ref.startsWith("data:image/") || e.ref.startsWith("https://") || e.ref.startsWith("http://")))
    .map((e, idx) => ({
      id: `${material.id}-ev-${idx}`,
      kind: "photo",
      src: e.ref!,
      caption: e.label,
      recordedAt: e.recordedAt,
    }));
}

export function formatStamp(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${date} · ${time}`;
}

export type UnifiedStatus =
  | "surveyed"
  | "matched"
  | "reserved"
  | "confirmed"
  | "hold"
  | "dispatched"
  | "verified"
  | "rejected"
  | "cancelled";

export function bookingStatusToUnified(status: BookingStatus): UnifiedStatus {
  switch (status) {
    case "confirmed":
      return "confirmed";
    case "hold":
      return "hold";
    case "pending":
      return "reserved";
    case "cancelled":
      return "cancelled";
  }
}

export function useGreeting(): string {
  const [greeting] = useState(() => {
    const hour = new Date().getHours();
    return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  });
  return greeting;
}


export const EASE = [0.22, 1, 0.36, 1] as const;

export type KitStatus =
  | "available"
  | "confirmed"
  | "verified"
  | "active"
  | "attention"
  | "limited"
  | "waiting"
  | "hold"
  | "draft"
  | "inactive"
  | "rejected"
  | "cancelled";

export const KIT_STATUS_CLASS: Record<KitStatus, string> = {
  available: "border-loop-300 bg-loop-50 text-loop-700 dark:border-loop-500/40 dark:bg-loop-500/10 dark:text-loop-300",
  confirmed: "border-loop-500 bg-loop-500 text-white dark:border-loop-500 dark:bg-loop-500",
  verified: "border-loop-500 bg-loop-500 text-white dark:border-loop-500 dark:bg-loop-500",
  active: "border-loop-300 bg-loop-50 text-loop-700 dark:border-loop-500/40 dark:bg-loop-500/10 dark:text-loop-300",
  attention: "border-signal-400 bg-signal-50 text-signal-700 dark:border-signal-500/40 dark:bg-signal-500/10 dark:text-signal-300",
  limited: "border-signal-400 bg-signal-50 text-signal-700 dark:border-signal-500/40 dark:bg-signal-500/10 dark:text-signal-300",
  waiting: "border-signal-300 bg-signal-50 text-signal-700 dark:border-signal-500/40 dark:bg-signal-500/10 dark:text-signal-300",
  hold: "border-signal-500 bg-signal-500/15 text-signal-700 dark:border-signal-500/50 dark:bg-signal-500/15 dark:text-signal-300",
  draft: "border-steel-300 bg-steel-50 text-steel-700 dark:border-steel-700 dark:bg-white/5 dark:text-steel-300",
  inactive: "border-steel-300 bg-steel-50 text-steel-600 dark:border-steel-700 dark:bg-white/5 dark:text-steel-400",
  rejected: "border-error-400 bg-error-50 text-error-700 dark:border-error-500/40 dark:bg-error-500/10 dark:text-error-300",
  cancelled: "border-steel-300 bg-steel-50 text-steel-600 dark:border-steel-700 dark:bg-white/5 dark:text-steel-400",
};

export const WORKFLOW_STEPS = ["Survey", "Passport", "Match", "Capacity", "Book", "Send", "Verify"] as const;

export interface EvidenceItem {
  id: string;
  src?: string;
  label: string;
  kind?: string;
  recordedAt?: string;
}

export const JOURNEY_STAGES = ["Booked", "Dispatched", "In transit", "Received", "Verified"] as const;

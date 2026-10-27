import { useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

export const TYPE_COLORS: Record<string, string> = {
  concrete: "bg-ink-900 dark:bg-white",
  brick: "bg-steel-600 dark:bg-steel-400",
  timber: "bg-steel-400 dark:bg-steel-500",
  steel: "bg-steel-800 dark:bg-steel-300",
  plasterboard: "bg-steel-300 dark:bg-steel-600",
  glass: "bg-gray-500 dark:bg-gray-400",
};

export const FLOW_STAGES = ["Surveyed", "Matched", "Reserved", "Dispatched", "Verified"] as const;

export function useCountUp(target: number, durationMs = 1500): number {
  const reduce = useReducedMotion();
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (reduce) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - p, 4);
      setValue(target * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs, reduce]);
  return reduce ? target : value;
}

export interface TimelineStep {
  time: string;
  label: string;
  availableT: number;
  tone: "confirmed" | "hold" | "released" | "recheck";
}

import type { GreenLoopDataset } from "@shared/domain/types";
import { createContext, useContext } from "react";
import type { GreenLoopStoreValue } from "./contracts";

export const empty = (): GreenLoopDataset => ({ projects: [], materials: [], receivers: [], slots: [], allocations: [], bookings: [], verifications: [], events: [], demands: [], offers: [], negotiations: [], supportRequests: [] });

export const Context = createContext<GreenLoopStoreValue | null>(null);

export function useGreenLoopStore(): GreenLoopStoreValue {
  const context = useContext(Context);
  if (!context) throw new Error("useGreenLoopStore must be used within GreenLoopStoreProvider");
  return context;
}

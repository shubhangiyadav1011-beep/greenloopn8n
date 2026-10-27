import { useAuth } from "@/context/AuthContext.helpers";
import type { GreenLoopDataset } from "@shared/domain/types";
import { api } from "@/lib/api";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { GreenLoopStoreValue } from "./contracts";
import { Context, empty } from "./GreenLoopStore.helpers";

export function GreenLoopStoreProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { user, ready } = useAuth();
  const [dataset, setDataset] = useState<GreenLoopDataset>(empty);
  const [loadedFor, setLoadedFor] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [retry, setRetry] = useState(0);
  const busy = useRef(false);
  const generation = useRef(0);
  const revision = useRef(0);
  const identity = `${user?.id ?? ""}:${user?.receiverId ?? ""}:${user?.activeWorkspace ?? ""}`;
  useEffect(() => {
    generation.current++;
    if (!user) return;
    let active = true;
    let fetching = false;
    const refresh = async () => {
      if (busy.current || fetching) return;
      fetching = true;
      const refreshRevision = revision.current;
      try {
        const result = await api<{ dataset: GreenLoopDataset }>("/dataset");
        if (active && !busy.current && refreshRevision === revision.current) { setDataset(result.dataset); setLoadedFor(identity); setError(""); }
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : t("backend.workspaceFailed")); }
      finally { fetching = false; }
    };
    void refresh();
    const interval = window.setInterval(() => { void refresh(); }, 5000);
    window.addEventListener("focus", refresh);
    return () => { active = false; window.clearInterval(interval); window.removeEventListener("focus", refresh); };
  }, [identity, user, retry, t]);
  const run = async <T,>(action: string, args: unknown[], fallback: T): Promise<T> => {
    if (busy.current) return fallback;
    const requestGeneration = generation.current;
    revision.current++;
    busy.current = true; setPending(true); setError("");
    try {
      const result = await api<{ dataset: GreenLoopDataset; result: T }>("/actions", "POST", { action, args });
      if (requestGeneration === generation.current) { revision.current++; setDataset(result.dataset); }
      return result.result;
    } catch (cause) { if (requestGeneration === generation.current) setError(cause instanceof Error ? cause.message : t("backend.saveFailed")); return fallback; }
    finally { busy.current = false; setPending(false); }
  };
  const value: GreenLoopStoreValue = {
    dataset: user ? dataset : empty(),
    markNotificationsReadAction: eventIds => run("markNotificationsReadAction", [eventIds], []),
    requestCapacityAction: input => run("requestCapacityAction", [input], false),
    cancelBookingAction: input => run("cancelBookingAction", [input], false),
    dispatchAction: input => run("dispatchAction", [input], false),
    updateDeliveryAction: (id, stage) => run("updateDeliveryAction", [id, stage], false),
    verifyAction: input => run("verifyAction", [input], false),
    addMaterialAction: input => run("addMaterialAction", [input], null),
    updateMaterialAction: (id, input) => run("updateMaterialAction", [id, input], false),
    deleteMaterialAction: id => run("deleteMaterialAction", [id], false),
    setMaterialListingStatusAction: (id, status) => run("setMaterialListingStatusAction", [id, status], false),
    bulkImportMaterialsAction: items => run("bulkImportMaterialsAction", [items], null),
    updateDemandAction: (id, input) => run("updateDemandAction", [id, input], false),
    deleteDemandAction: id => run("deleteDemandAction", [id], false),
    addDemandAction: input => run("addDemandAction", [input], null),
    saveDemandDraftAction: input => run("saveDemandDraftAction", [input], null),
    deleteDemandDraftAction: id => run("deleteDemandDraftAction", [id], false),
    addProjectAction: input => run("addProjectAction", [input], null),
    addCapacityAction: input => run("addCapacityAction", [input], null),
    updateCapacityAction: (slotId, capacityT) => run("updateCapacityAction", [slotId, capacityT], false),
    addSupportRequestAction: input => run("addSupportRequestAction", [input], null),
    addOfferAction: input => run("addOfferAction", [input], false),
    saveOfferDraftAction: input => run("saveOfferDraftAction", [input], false),
    deleteOfferDraftAction: id => run("deleteOfferDraftAction", [id], false),
    acceptOfferAction: id => run("acceptOfferAction", [id], false),
    scheduleAcceptedOfferAction: (id, slotId) => run("scheduleAcceptedOfferAction", [id, slotId], false),
    declineOfferAction: id => run("declineOfferAction", [id], false),
    sendNegotiationMessageAction: (id, body) => run("sendNegotiationMessageAction", [id, body], false),
    proposeFinalTermsAction: (id, terms) => run("proposeFinalTermsAction", [id, terms], false),
    approveFinalTermsAction: (id, proposalId) => run("approveFinalTermsAction", [id, proposalId], null),
    cancelDemandAction: id => run("cancelDemandAction", [id], false),
    withdrawOfferAction: id => run("withdrawOfferAction", [id], false),
    archiveBookingAction: id => run("archiveBookingAction", [id], false),
    acceptRequestAction: (id, tonnes) => run("acceptRequestAction", [id, tonnes], false),
    rejectRequestAction: id => run("rejectRequestAction", [id], false),
    rescheduleRequestAction: (id, slot) => run("rescheduleRequestAction", [id, slot], false),
    receiveLoadAction: (id, tonnes, evidence) => run("receiveLoadAction", [id, tonnes, evidence], false),
    verifyLoadAction: (id, accepted, rejected, reason) => run("verifyLoadAction", [id, accepted, rejected, reason], false),
    directOrderMaterialAction: input => run("directOrderMaterialAction", [input], null),
    createPaymentAttemptAction: input => run("createPaymentAttemptAction", [typeof input === "string" ? { bookingId: input } : input], null),
    disputePaymentAction: (bookingId, reason) => run("disputePaymentAction", [{ bookingId, reason }], false),
    addMaterialEvidenceAction: (materialId, item) => run("addMaterialEvidenceAction", [materialId, item], null),
    removeMaterialEvidenceAction: (materialId, evidenceRefOrId) => run("removeMaterialEvidenceAction", [materialId, evidenceRefOrId], false),
    submitPassportForReviewAction: (materialId, notes) => run("submitPassportForReviewAction", [materialId, notes], null),
    reviewPassportAction: input => run("reviewPassportAction", [input], null),
    updateMaterialPassportDetailsAction: (materialId, input) => run("updateMaterialPassportDetailsAction", [materialId, input], null),
  };
  const loading = ready && user && loadedFor !== identity;
  return <Context.Provider value={value}>
    {error && <div role="alert" className="fixed inset-x-0 bottom-0 z-99999 flex items-center justify-center gap-3 bg-error-600 px-4 py-3 text-sm text-white">{error}<button type="button" className="underline" onClick={() => setRetry(value => value + 1)}>{t("backend.refresh")}</button></div>}
    {pending && <div role="status" className="fixed bottom-4 end-4 z-9999 bg-ink-900 px-4 py-2 text-sm text-white dark:bg-white dark:text-ink-900">{t("backend.savingChanges")}</div>}
    {loading ? <div role="status" className="flex min-h-screen items-center justify-center text-steel-600 dark:text-steel-400">{t("backend.loadingWorkspace")}</div> : children}
  </Context.Provider>;
}


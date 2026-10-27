import PageMeta from "@/components/common/PageMeta";
import { Modal } from "@/components/ui/modal";
import { useAuth } from "@/context/AuthContext.helpers";
import { useModal } from "@/hooks/useModal";
import { ArrowRightIcon, BoxCubeIcon, FolderIcon } from "@/icons";
import { cn } from "@/utils";
import { useRef, useState, type PointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useNavigate } from "react-router";

type Workspace = "provider" | "receiver";

export default function WorkspaceSelector() {
  const { t } = useTranslation();
  const { user, setActiveWorkspace } = useAuth();
  const navigate = useNavigate();
  const { isOpen, closeModal } = useModal(true);
  const [mode, setMode] = useState<Workspace>(user?.activeWorkspace === "receiver" ? "receiver" : "provider");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const pointer = useRef<{ x: number; y: number; id: number } | null>(null);
  const dragged = useRef(false);
  const selecting = useRef(false);
  const flip = () => {
    if (selecting.current) return;
    setMode(current => current === "provider" ? "receiver" : "provider");
    setError("");
  };
  const select = async () => {
    if (selecting.current) return;
    selecting.current = true;
    setLoading(true);
    setError("");
    try {
      if (!await setActiveWorkspace(mode)) {
        setError(t("workspacePicker.failed"));
        return;
      }
      window.location.href = mode === "receiver" ? "/app/receiver/overview" : "/app/explore";
    } catch {
      setError(t("workspacePicker.failed"));
    } finally {
      selecting.current = false;
      setLoading(false);
    }
  };
  const endSwipe = (event: PointerEvent<HTMLButtonElement>) => {
    const start = pointer.current;
    pointer.current = null;
    if (!start || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      dragged.current = true;
      flip();
    }
  };
  const dismiss = () => {
    if (selecting.current || !user?.activeWorkspace) return;
    closeModal();
    navigate(user.activeWorkspace === "receiver" ? "/app/receiver/overview" : "/app/explore", { replace: true });
  };

  if (!user) return <Navigate to="/sign-in" replace />;

  return (
    <>
      <PageMeta title={t("workspacePicker.metaTitle")} description={t("workspacePicker.subtitle")} />
      <Modal isOpen={isOpen} onClose={dismiss} isFullscreen showCloseButton={false}>
        <section role="dialog" aria-modal="true" aria-labelledby="workspace-title" className="fixed inset-0 flex flex-col items-center justify-center overflow-y-auto bg-loop-25/85 px-4 py-section backdrop-blur-xl dark:bg-loop-950/85"
          onKeyDown={event => {
            if (event.key !== "Tab") return;
            const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");
            const first = buttons[0];
            const last = buttons[buttons.length - 1];
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first?.focus();
            }
          }}
        >
          <div className="relative my-auto w-full max-w-sm">
            <header className="mb-card text-center">
              <p className="eyebrow-label text-loop-700 dark:text-loop-300">GreenLoop</p>
              <h1 id="workspace-title" className="mt-2 font-archivo text-2xl font-bold tracking-tight text-ink-900 dark:text-white">{t("workspacePicker.title")}</h1>
              <p className="mt-detail text-sm leading-relaxed text-steel-600 dark:text-steel-300">{t("workspacePicker.hint")}</p>
            </header>

            <div className="workspace-perspective">
              <button
                type="button"
                autoFocus
                disabled={loading}
                aria-label={t(`workspacePicker.${mode}.enter`)}
                aria-describedby="workspace-gesture-hint"
                aria-busy={loading}
                className={cn("workspace-flip grid w-full cursor-pointer touch-pan-y select-none rounded-surface text-start outline-none focus-visible:ring-2 focus-visible:ring-loop-600 focus-visible:ring-offset-4 focus-visible:ring-offset-loop-25 disabled:cursor-wait dark:focus-visible:ring-offset-loop-950", mode === "receiver" && "workspace-flipped")}
                onPointerDown={event => {
                  if (!event.isPrimary || event.button !== 0) return;
                  dragged.current = false;
                  pointer.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
                  event.currentTarget.setPointerCapture(event.pointerId);
                }}
                onPointerMove={event => {
                  if (pointer.current && Math.hypot(event.clientX - pointer.current.x, event.clientY - pointer.current.y) > 12) dragged.current = true;
                }}
                onPointerUp={endSwipe}
                onPointerCancel={() => { pointer.current = null; dragged.current = true; }}
                onKeyDown={event => {
                  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                    event.preventDefault();
                    flip();
                  }
                }}
                onClick={event => {
                  if (event.detail > 0 && dragged.current) {
                    dragged.current = false;
                    return;
                  }
                  void select();
                }}
              >
                {(["provider", "receiver"] as const).map(role => {
                  const Icon = role === "provider" ? BoxCubeIcon : FolderIcon;
                  return <span key={role} aria-hidden={mode !== role} className={cn("workspace-face col-start-1 row-start-1 flex flex-col rounded-surface border border-loop-200 bg-loop-25 p-card shadow-lg shadow-loop-900/10 dark:border-loop-800 dark:bg-loop-900 sm:p-section", role === "receiver" && "workspace-back")}>
                    <span className="flex items-center justify-between gap-detail">
                      <span className="flex size-13 items-center justify-center rounded-control bg-loop-100 text-loop-800 dark:bg-loop-800 dark:text-loop-200"><Icon className="size-6" /></span>
                      <span className="text-xs font-semibold text-loop-700 dark:text-loop-300">{role === "provider" ? "01" : "02"} / 02</span>
                    </span>
                    <span className="mt-card font-archivo text-xl font-bold text-ink-900 dark:text-white">{t(`workspacePicker.${role}.title`)}</span>
                    <span className="mt-detail text-sm leading-relaxed text-steel-600 dark:text-steel-300">{t(`workspacePicker.${role}.description`)}</span>
                    <span className="mt-card flex items-center justify-between gap-detail border-t border-loop-200 pt-detail text-sm font-semibold text-loop-800 dark:border-loop-800 dark:text-loop-200">
                      <span>{loading ? t("workspacePicker.entering") : t(`workspacePicker.${role}.enter`)}</span>
                      <ArrowRightIcon className="size-5 shrink-0 rtl:rotate-180" />
                    </span>
                  </span>;
                })}
              </button>
            </div>

            <div className="mt-card flex items-center justify-center gap-detail">
              <button type="button" disabled={loading} onClick={flip} aria-label={t("workspacePicker.flip")} className="flex size-10 items-center justify-center rounded-full border border-loop-200 bg-loop-50 text-loop-800 hover:bg-loop-100 focus-visible:outline-2 focus-visible:outline-loop-600 disabled:opacity-50 dark:border-loop-800 dark:bg-loop-900 dark:text-loop-200"><ArrowRightIcon className="size-4 rotate-180" /></button>
              <p aria-live="polite" className="min-w-32 text-center text-sm font-semibold text-loop-800 dark:text-loop-200">{t(`workspacePicker.${mode}.short`)}</p>
              <button type="button" disabled={loading} onClick={flip} aria-label={t("workspacePicker.flip")} className="flex size-10 items-center justify-center rounded-full border border-loop-200 bg-loop-50 text-loop-800 hover:bg-loop-100 focus-visible:outline-2 focus-visible:outline-loop-600 disabled:opacity-50 dark:border-loop-800 dark:bg-loop-900 dark:text-loop-200"><ArrowRightIcon className="size-4" /></button>
            </div>
            <p id="workspace-gesture-hint" className="mt-detail text-center text-xs text-steel-600 dark:text-steel-300">{t("workspacePicker.keyboardHint")}</p>
            {error && <p role="alert" className="mt-detail text-center text-sm text-error-600 dark:text-error-300">{error}</p>}
          </div>
        </section>
      </Modal>
    </>
  );
}

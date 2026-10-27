import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDownIcon } from "@/icons";

export default function VerificationDetails({ image, name, status, children, enabled = true }: {
  image: string;
  name: string;
  status: string;
  children: ReactNode;
  enabled?: boolean;
}) {
  const { t } = useTranslation();
  if (!enabled) return <>{children}</>;
  return (
    <details className="group/verification">
      <summary className="flex cursor-pointer list-none items-center gap-3 marker:hidden hover:bg-steel-50 focus-visible:outline-2 focus-visible:outline-loop-600 dark:hover:bg-white/5 [&::-webkit-details-marker]:hidden gl-card-pad">
        <img src={image} alt="" loading="lazy" className="size-14 shrink-0 rounded-lg object-cover" />
        <div className="min-w-0 flex-1">
          <h2 className="font-archivo text-base font-bold capitalize text-ink-900 dark:text-white">{name}</h2>
          <p className="mt-1 text-sm text-steel-600 dark:text-gray-400">{status}</p>
        </div>
        <span className="flex shrink-0 items-center gap-1 text-sm font-semibold text-loop-700 dark:text-loop-300">
          {t("verificationCards.details")}
          <ChevronDownIcon aria-hidden="true" className="size-4 transition-transform group-open/verification:rotate-180" />
        </span>
      </summary>
      <div className="border-t border-steel-200 dark:border-steel-800">{children}</div>
    </details>
  );
}

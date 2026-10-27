import GridShape from "@/components/common/GridShape";
import PageMeta from "@/components/common/PageMeta";
import { MediaPanel } from "@/components/greenloop/kit";
import { ambientMedia } from "@/config/appMedia";
import { cn } from "@/utils";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";

interface NotFoundProps {
  className?: string;
}

export default function NotFound({ className }: NotFoundProps) {
  const { t } = useTranslation("common", { keyPrefix: "notFound" });

  return (
    <>
      <PageMeta
        title="Page Not Found | GreenLoop"
        description="The page you are looking for does not exist in GreenLoop."
      />
      <div
        className={cn(
          "relative z-1 flex min-h-screen flex-col items-center justify-center overflow-hidden p-6",
          className,
        )}
      >
        <GridShape />
        <div className="mx-auto w-full max-w-60.5 text-center sm:max-w-118">
          <h1 className="mb-8 font-archivo text-title-md font-bold tracking-tight text-ink-900 xl:text-title-2xl dark:text-white">
            Page Not Found
          </h1>

          <div className="relative group mx-auto w-full max-w-md">
            <MediaPanel media={ambientMedia.siteCabins} aspect="aspect-[16/10]" caption="GreenLoop yard" />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 flex items-center justify-center font-archivo text-6xl font-bold tracking-tight text-white drop-shadow-lg"
            >
              404
            </span>
          </div>

          <p className="mt-10 mb-6 text-base text-gray-700 sm:text-lg dark:text-gray-400">
            {t("message")}
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/app"
              className={cn(
                "inline-flex items-center justify-center rounded-sm bg-ink-900 px-5 py-3.5 text-sm font-medium text-white transition-colors hover:bg-ink-800 dark:bg-white dark:text-ink-900 dark:hover:bg-gray-200",
              )}
            >
              {t("goPlatform")}
            </Link>
            <Link
              to="/"
              className={cn(
                "inline-flex items-center justify-center rounded-sm border border-steel-300 bg-gray-25 px-5 py-3.5 text-sm font-medium text-ink-800 transition-colors hover:bg-steel-50 dark:border-steel-700 dark:bg-gray-dark dark:text-gray-200 dark:hover:bg-white/5",
              )}
            >
              {t("backHome")}
            </Link>
          </div>
        </div>
        {/* <!-- Footer --> */}
        <p
          className={cn(
            "absolute inset-s-1/2 bottom-6 -translate-x-1/2 text-center text-sm text-gray-500 rtl:translate-x-1/2 dark:text-gray-400",
          )}
        >
          &copy; {new Date().getFullYear()} - GreenLoop
        </p>
      </div>
    </>
  );
}

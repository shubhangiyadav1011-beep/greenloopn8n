import { ThemeToggleButton } from "@/components/common/ThemeToggleButton";
import GlobalSearch from "@/components/header/GlobalSearch";
import NotificationDropdown from "@/components/header/NotificationDropdown";
import UserDropdown from "@/components/header/UserDropdown";
import { useSidebar } from "@/context/SidebarContext.helpers";
import { SearchIcon } from "@/icons";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

const AppHeader: React.FC<{ overlay?: boolean; lightOverlay?: boolean }> = ({ overlay = false, lightOverlay = false }) => {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const { isMobileOpen, toggleSidebar, toggleMobileSidebar } = useSidebar();

  const handleToggleSidebar = () => {
    if (window.innerWidth >= 1280) toggleSidebar();
    else toggleMobileSidebar();
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <header className={overlay
      ? `absolute inset-x-0 top-0 z-99999 flex w-full border-b text-white ${lightOverlay ? "border-white/10 bg-[#17251d]/40 backdrop-blur-sm" : "border-white/15 bg-[#17251d]/20 backdrop-blur-md"}`
      : "sticky top-0 z-99999 flex w-full border-b border-[#e7e5de] bg-[#f6f5f0]/95 backdrop-blur-sm"}>
      <div className="flex w-full items-center gap-2 px-3 py-3 sm:gap-4 sm:px-6 xl:gap-6 xl:px-8">
        <button
          type="button"
          onClick={handleToggleSidebar}
          className={overlay
            ? "flex size-9 shrink-0 items-center justify-center rounded-xl border border-white/30 bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/20 sm:size-10"
            : "flex size-9 shrink-0 items-center justify-center rounded-lg border border-[#deded5] text-[#526157] transition-colors hover:bg-[#e9eee8] sm:size-10"}
          aria-label={isMobileOpen ? "Close navigation" : "Open navigation"}
        >
          {isMobileOpen ? <span aria-hidden="true" className="text-xl">×</span> : <span aria-hidden="true" className="text-lg">☰</span>}
        </button>

        <Link to="/app" className="shrink-0 xl:hidden">
          <img src="/images/logo/logo.svg" alt="GreenLoop" width={96} height={28} className={overlay ? "brightness-0 invert" : ""} />
        </Link>

        <div className="hidden min-w-0 flex-1 xl:block">
          <form onSubmit={(event) => { event.preventDefault(); setSearchOpen(true); }}>
            <div className="relative max-w-[390px]">
              <span className="pointer-events-none absolute inset-s-3.5 top-1/2 -translate-y-1/2 text-[#7d877e]">
                <SearchIcon className="size-4" />
              </span>
              <input
                ref={inputRef}
                type="text"
                readOnly
                onFocus={() => setSearchOpen(true)}
                onClick={() => setSearchOpen(true)}
                placeholder={t("header.searchPlaceholder")}
                className={overlay
                  ? "h-10 w-full cursor-pointer rounded-full border border-white/70 bg-white/95 py-2.5 ps-10 pe-14 text-sm text-[#28342b] placeholder:text-[#818980] shadow-lg shadow-black/10 transition-colors focus:border-[#548866] focus:ring-3 focus:ring-[#548866]/10 focus:outline-hidden"
                  : "h-10 w-full cursor-pointer rounded-lg border border-[#deded5] bg-white py-2.5 ps-10 pe-14 text-sm text-[#28342b] placeholder:text-[#818980] transition-colors focus:border-[#548866] focus:ring-3 focus:ring-[#548866]/10 focus:outline-hidden"}
              />
              <button type="button" onClick={() => setSearchOpen(true)} className="absolute inset-e-2 top-1/2 inline-flex -translate-y-1/2 items-center gap-0.5 rounded-md border border-[#e5e3dc] bg-[#f6f5f0] px-1.5 py-1 text-[10px] text-[#737c74]" aria-label="Open search">
                <span>⌘</span><span>K</span>
              </button>
            </div>
          </form>
        </div>

        <button type="button" onClick={() => setSearchOpen(true)} className={overlay
          ? "ms-auto inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-white hover:bg-white/15 sm:size-9 xl:hidden"
          : "ms-auto inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-[#526157] hover:bg-[#e9eee8] sm:size-9 xl:hidden"} aria-label="Search GreenLoop">
          <SearchIcon className="size-5" />
        </button>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2.5">
          <ThemeToggleButton />
          <NotificationDropdown />
          <UserDropdown overlay={overlay} />
        </div>
      </div>
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </header>
  );
};

export default AppHeader;

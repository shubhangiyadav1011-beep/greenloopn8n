import { useAuth } from "@/context/AuthContext.helpers";
import { useGreenLoopStore } from "@/store/GreenLoopStore.helpers";
import { cn, formatStamp } from "@/utils";
import { useState } from "react";
import { Link } from "react-router";
import { Dropdown } from "../ui/dropdown/Dropdown";
import { DropdownItem } from "../ui/dropdown/DropdownItem";

interface ActivityItem {
  id: string;
  actor: string;
  message: string;
  label: string;
  time: string;
  href: string;
  tone: "confirmed" | "hold" | "rejected" | "neutral";
  icon: "offer" | "material" | "project" | "delivery" | "activity";
}

const toneText: Record<ActivityItem["tone"], string> = {
  confirmed: "text-loop-700 dark:text-loop-300",
  hold: "text-signal-700 dark:text-signal-300",
  rejected: "text-error-700 dark:text-error-300",
  neutral: "text-steel-700 dark:text-steel-300",
};

export default function NotificationDropdown() {
  const { dataset, markNotificationsReadAction } = useGreenLoopStore();
  const { user } = useAuth();
  const items: ActivityItem[] = [...dataset.events].reverse().map((event) => {
    const [firstId = "", secondId = ""] = event.subjectIds;
    const activeReceiver = user?.activeWorkspace === "receiver";
    const href = event.kind.startsWith("demand.")
      ? activeReceiver ? `/app/receiver/demand?demand=${encodeURIComponent(firstId)}` : `/app/market-demand?demand=${encodeURIComponent(firstId)}`
      : event.kind.startsWith("offer.")
        ? activeReceiver ? `/app/receiver/demand?demand=${encodeURIComponent(secondId)}` : `/app/market-demand?demand=${encodeURIComponent(secondId)}`
        : event.kind.startsWith("allocation.")
          ? activeReceiver ? "/app/receiver/incoming-requests" : "/app/bookings"
          : event.kind.includes("capacity")
            ? activeReceiver ? "/app/receiver/demand?capacity=1" : "/app/bookings"
            : event.kind.startsWith("request.")
              ? "/app/bookings"
              : event.kind.startsWith("load.")
                ? activeReceiver ? "/app/receiver/deliveries" : "/app/deliveries"
                : event.kind.startsWith("delivery.")
                  ? activeReceiver ? "/app/receiver/verification" : "/app/deliveries"
                  : event.kind.startsWith("verification.")
                ? activeReceiver ? "/app/receiver/verification" : "/app/verification"
                : event.kind.startsWith("material.")
                  ? `/app/materials/${encodeURIComponent(firstId)}`
                  : event.kind.startsWith("project.")
                    ? `/app/projects/${encodeURIComponent(firstId)}`
                    : "/app/bookings";
    return {
      id: event.id,
      actor: event.actor.name,
      message: event.summary,
      label: event.kind.split(".").map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" · "),
      time: formatStamp(event.at),
      href,
      tone: event.kind.includes("hold") ? "hold" : event.kind.includes("reject") || event.kind.includes("cancel") ? "rejected" : event.kind.includes("confirm") || event.kind.includes("verified") ? "confirmed" : "neutral",
      icon: event.kind.startsWith("offer.")
        ? "offer"
        : event.kind.startsWith("material.")
          ? "material"
          : event.kind.startsWith("project.")
            ? "project"
            : event.kind.startsWith("delivery.") || event.kind.startsWith("load.")
              ? "delivery"
              : "activity",
    };
  });
  const [isOpen, setIsOpen] = useState(false);
  const readIds = new Set(dataset.readEventIds ?? []);
  const unreadCount = dataset.events.filter(event => !readIds.has(event.id)).length;

  const toggleDropdown = () => {
    setIsOpen(!isOpen);
  };

  const closeDropdown = () => {
    setIsOpen(false);
  };

  const handleClick = () => {
    const opening = !isOpen;
    setIsOpen(opening);
    if (opening) {
      const unreadIds = items.filter(item => !readIds.has(item.id)).slice(0, 1000).map(item => item.id);
      if (unreadIds.length) void markNotificationsReadAction(unreadIds);
    }
  };

  return (
    <div className="relative">
      <button
        className="dropdown-toggle relative flex h-8 w-8 items-center justify-center rounded-lg border border-[#deded5] bg-white text-[#526157] transition-colors hover:bg-[#e9eee8] sm:h-9 sm:w-9 xl:h-10 xl:w-10"
        onClick={handleClick}
        aria-label={unreadCount ? `Activity, ${unreadCount} unread` : "Activity"}
        aria-expanded={isOpen}
      >
        {unreadCount > 0 && <span className="absolute -end-1 -top-1 z-10 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-signal-500 px-1 text-[9px] font-bold leading-none text-white" aria-hidden="true">{unreadCount}</span>}
        <svg
          className="fill-current"
          width="20"
          height="20"
          viewBox="0 0 20 20"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M10.75 2.29248C10.75 1.87827 10.4143 1.54248 10 1.54248C9.58583 1.54248 9.25004 1.87827 9.25004 2.29248V2.83613C6.08266 3.20733 3.62504 5.9004 3.62504 9.16748V14.4591H3.33337C2.91916 14.4591 2.58337 14.7949 2.58337 15.2091C2.58337 15.6234 2.91916 15.9591 3.33337 15.9591H4.37504H15.625H16.6667C17.0809 15.9591 17.4167 15.6234 17.4167 15.2091C17.4167 14.7949 17.0809 14.4591 16.6667 14.4591H16.375V9.16748C16.375 5.9004 13.9174 3.20733 10.75 2.83613V2.29248ZM14.875 14.4591V9.16748C14.875 6.47509 12.6924 4.29248 10 4.29248C7.30765 4.29248 5.12504 6.47509 5.12504 9.16748V14.4591H14.875ZM8.00004 17.7085C8.00004 18.1228 8.33583 18.4585 8.75004 18.4585H11.25C11.6643 18.4585 12 18.1228 12 17.7085C12 17.2943 11.6643 16.9585 11.25 16.9585H8.75004C8.33583 16.9585 8.00004 17.2943 8.00004 17.7085Z"
            fill="currentColor"
          />
        </svg>
      </button>

      <Dropdown
        isOpen={isOpen}
        onClose={closeDropdown}
        className="absolute inset-e-0 top-full z-[100000] mt-2 flex h-[min(62vh,30rem)] max-h-[calc(100dvh-1.5rem)] w-[min(390px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-[18px] border border-[#e2e5db] bg-[#fbfaf5] p-3 shadow-[0_16px_44px_rgba(11,36,22,0.2)] dark:border-steel-700 dark:bg-[#15251b]"
      >
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-24 overflow-hidden opacity-70">
          <img src="/images/site/inventory-nature-concrete.png" alt="" className="absolute bottom-0 right-0 h-full w-2/3 object-contain object-right-bottom" />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#fbfaf5_0%,rgba(251,250,245,0.84)_35%,rgba(251,250,245,0.12)_78%,transparent)] dark:bg-[linear-gradient(to_right,#15251b_0%,rgba(21,37,27,0.84)_35%,rgba(21,37,27,0.12)_78%,transparent)]" />
          <div className="absolute inset-0 bg-[linear-gradient(to_bottom,#fbfaf5_0%,transparent_48%)] dark:bg-[linear-gradient(to_bottom,#15251b_0%,transparent_48%)]" />
        </div>
        <div className="relative z-10 mb-2.5 flex shrink-0 items-center justify-between border-b border-[#e5e4dc] px-1 pb-2.5 dark:border-white/10">
          <div>
            <h2 className="font-archivo text-xl font-bold tracking-tight text-[#102e21] dark:text-white">Activity</h2>
            <p className="mt-0.5 text-[11px] text-[#87918a] dark:text-gray-300">Your latest updates and actions</p>
          </div>
          <button
            onClick={toggleDropdown}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#f3f1e9] text-[#3c5145] transition hover:bg-[#e9eee7] dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
            aria-label="Close activity"
          >
            <svg
              className="fill-current"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M6.21967 7.28131C5.92678 6.98841 5.92678 6.51354 6.21967 6.22065C6.51256 5.92775 6.98744 5.92775 7.28033 6.22065L11.999 10.9393L16.7176 6.22078C17.0105 5.92789 17.4854 5.92788 17.7782 6.22078C18.0711 6.51367 18.0711 6.98855 17.7782 7.28144L13.0597 12L17.7782 16.7186C18.0711 17.0115 18.0711 17.4863 17.7782 17.7792C17.4854 18.0721 17.0105 18.0721 16.7176 17.7792L11.999 13.0607L7.28033 17.7794C6.98744 18.0722 6.51256 18.0722 6.21967 17.7794C5.92678 17.4865 5.92678 17.0116 6.21967 16.7187L10.9384 12L6.21967 7.28131Z"
                fill="currentColor"
              />
            </svg>
          </button>
        </div>

        <ul className="relative z-10 flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-0.5 py-0.5 custom-scrollbar">
          {items.length === 0 && <li className="rounded-2xl bg-[#edf4e9] p-3 text-xs text-[#536259] dark:bg-white/[0.06] dark:text-gray-300">No activity has been recorded.</li>}
          {items.map((item, index) => (
            <li key={item.id} className="shrink-0">
              <DropdownItem
                tag="a"
                to={item.href}
                onItemClick={() => { closeDropdown(); void markNotificationsReadAction([item.id]); }}
                baseClassName="group flex min-h-[58px] w-full items-center gap-2 rounded-full px-2 py-1.5 text-start transition-colors"
                className={index % 2 === 0
                  ? "bg-[#eaf2e6]/90 hover:bg-[#e1eddb] dark:bg-[#294334]/80 dark:hover:bg-[#31513b]"
                  : "bg-[#f4f1e9]/95 hover:bg-[#eeece3] dark:bg-white/[0.06] dark:hover:bg-white/[0.1]"}
              >
                <span className={cn(
                  "relative flex size-9 shrink-0 items-center justify-center rounded-full",
                  index % 2 === 0 ? "bg-[#175238] text-white" : "bg-[#dfecd9] text-[#164b32] dark:bg-[#36543e] dark:text-white",
                )} aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" className="size-5">
                    {item.icon === "offer" && <><path d="M7 3h7l5 5v7" /><path d="M14 3v5h5" /><path d="M7 3a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6" /><path d="M8 12h6m-6 4h4" /><path d="m16 18 2 2 4-4" /></>}
                    {item.icon === "material" && <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" /><path d="m4 7.5 8 4.5 8-4.5M12 12v9" /></>}
                    {item.icon === "project" && <><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" /><path d="M3 10h18" /></>}
                    {item.icon === "delivery" && <><path d="M3 6h11v11H3z" /><path d="M14 10h4l3 3v4h-7z" /><circle cx="7.5" cy="18" r="1.5" /><circle cx="17.5" cy="18" r="1.5" /></>}
                    {item.icon === "activity" && <><path d="M4 12h4l2.5-7 4 14 2.5-7h3" /><circle cx="12" cy="12" r="9" /></>}
                  </svg>
                  {!readIds.has(item.id) && <span className="absolute end-1 top-1 size-2.5 rounded-full border-2 border-[#eaf2e6] bg-[#d99b44]" />}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block line-clamp-2 text-[11px] font-medium leading-4 text-[#22382c] dark:text-white">
                    <span className="font-bold text-[#102e21] dark:text-white">{item.actor}</span>{" "}
                    <span className={cn("font-semibold", toneText[item.tone])}>{item.message}</span>
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[9px] text-[#7b837d] dark:text-gray-300">
                    <span>{item.label}</span>
                    <span aria-hidden="true" className="size-1 rounded-full bg-[#9ba39b]" />
                    <span className="ledger-numeral">{item.time}</span>
                  </span>
                </span>
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white/65 text-[#1c5439] transition group-hover:translate-x-0.5 group-hover:bg-white dark:bg-black/10 dark:text-[#d6ebd8]" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-3.5"><path d="m9 18 6-6-6-6" /></svg>
                </span>
              </DropdownItem>
            </li>
          ))}
        </ul>
        <Link
          to="/app/audit-trail"
          onClick={closeDropdown}
          className="relative z-10 mt-2.5 flex min-h-[44px] shrink-0 items-center gap-2.5 rounded-xl bg-[#0d3a27] px-3 text-xs font-semibold text-white shadow-[0_6px_16px_rgba(11,53,32,0.18)] transition hover:bg-[#155037]"
        >
          <span className="flex size-8 items-center justify-center rounded-lg bg-white/15 text-white">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-4"><path d="M4 20V10m5 10V4m5 16v-7m5 7V7" /><path d="M2 20h20" /></svg>
          </span>
          <span className="flex-1">View full audit trail</span>
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-3.5"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>
        </Link>
      </Dropdown>
    </div>
  );
}
